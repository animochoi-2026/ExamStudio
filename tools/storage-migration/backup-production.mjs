// Read-only production DB/config snapshot; encrypted local + private R2 copies.
// No source object contents, no production writes, no plaintext records/logs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {seal,unseal,sha,canonical} from './core.mjs';
import {s3Store} from './adapters.mjs';
const project='bjxxqdbftefughjkcrqj',job='backup-20261011-'+randomUUID();
const key=process.env.MIGRATION_STATE_KEY,token=process.env.SUPABASE_ACCESS_TOKEN;
const dir=path.resolve('tools/storage-migration/.private',job),prefix='__migration/'+job+'/';
const target=s3Store({endpoint:'https://7b3f670b94ea81a6649c3529b108ee8b.r2.cloudflarestorage.com',region:'auto',bucket:'examstudio-files-prep',accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY});
seal({},key);
const parts=[];let rowsTotal=0;
async function storageState(){const k=process.env.SUPABASE_READ_KEY;const r=await fetch(`https://${project}.supabase.co/rest/v1/rpc/bank_storage_status`,{method:'POST',headers:{apikey:k,Authorization:'Bearer '+k,'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error('BACKUP_STATUS_HTTP_'+r.status);return r.json();}
async function sql(query){const r=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query,read_only:true}),signal:AbortSignal.timeout(60000)});if(!r.ok){const d=await r.json().catch(()=>({}));const message=String(d.message||d.error||'').replace(/sbp_[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9_-]+/g,'[REDACTED]');console.error(JSON.stringify({readonlyQueryDiagnostic:message.slice(0,500)}));throw Error('BACKUP_DATABASE_HTTP_'+r.status);}return r.json();}
async function save(name,value){const bytes=seal(value,key),file=path.join(dir,name+'.enc');await fs.writeFile(file,bytes,{flag:'wx',mode:0o600});await target.put(prefix+name+'.enc',bytes,{ContentType:'application/octet-stream'},{absent:true});const copy=await target.get(prefix+name+'.enc');if(sha(copy.body)!==sha(bytes)||canonical(unseal(copy.body,key))!==canonical(value))throw Error('BACKUP_READBACK_FAILED');parts.push({name,bytes:bytes.length,sha256:sha(bytes)});}
try{
 await fs.mkdir(dir,{recursive:true,mode:0o700});
 const before=await storageState();
 const tables=await sql("select schemaname,tablename from pg_tables where schemaname='public' and tablename like 'bank_%' order by schemaname,tablename");
 const schema=await sql(`select jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and ((n.nspname='public' and p.proname like 'bank_%') or n.nspname='bank_storage_private')),
 'columns',(select jsonb_agg(to_jsonb(c)) from information_schema.columns c where (table_schema='public' and table_name like 'bank_%') or table_schema='bank_storage_private'),
 'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where (schemaname='public' and tablename like 'bank_%') or schemaname in ('storage','bank_storage_private')),
 'constraints',(select jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid))) from pg_constraint where connamespace in ('public'::regnamespace,'bank_storage_private'::regnamespace)),
 'triggers',(select jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'definition',pg_get_triggerdef(oid))) from pg_trigger where not tgisinternal and tgrelid in(select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','bank_storage_private','storage'))),
 'relations',(select jsonb_agg(jsonb_build_object('name',c.oid::regclass::text,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'rls',c.relrowsecurity,'forcedRls',c.relforcerowsecurity)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','bank_storage_private','storage') and c.relkind in ('r','v','S')),
 'indexes',(select jsonb_agg(to_jsonb(i)) from pg_indexes i where schemaname in ('public','bank_storage_private','storage')),
 'storageBuckets',(select jsonb_agg(to_jsonb(b)) from storage.buckets b)
 ) as snapshot`);
 await save('schema',schema);
 for(const name of ['production-before.json','production-preapply.json'])await save('installed-baseline-'+name,JSON.parse(await fs.readFile('tests/artifacts/r2-freeze/'+name,'utf8')));
 for(const name of ['cutover-delta.sql','cutover-delta-rollback.sql','freeze-preparation-rollback.sql'])await save('reviewed-'+name,{sql:await fs.readFile('docs/r2/'+name,'utf8')});
 for(const t of tables){if(!/^[a-z_]+$/.test(t.schemaname)||!/^bank_[a-z0-9_]+$|^(settings|function_backup|trigger_targets|cutover_function_backup|deleted_objects)$/.test(t.tablename))throw Error('UNEXPECTED_BACKUP_TABLE');
  const table=`"${t.schemaname}"."${t.tablename}"`;let offset=0;
  for(;;){const rows=await sql(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text limit 250 offset ${offset}`);if(rows.length)await save(t.schemaname+'-'+t.tablename+'-'+offset,rows);rowsTotal+=rows.length;offset+=rows.length;if(rows.length<250)break;}
 }
 const config=await fetch('https://examstudio-shared-bank.pages.dev/config.json');if(!config.ok)throw Error('PUBLIC_CONFIG_BACKUP_FAILED');const publicConfig=await config.json();if(publicConfig.url!==`https://${project}.supabase.co`)throw Error('PUBLIC_PROJECT_DRIFT');await save('public-config',publicConfig);
 const after=await storageState();
 if(canonical(before)!==canonical(after))throw Error('BACKUP_STATE_CHANGED');
 const manifest={job,project,at:new Date().toISOString(),state:after,transactionallyConsistent:false,requiresFrozenFinalSnapshot:!after.frozen,tables:tables.length,rows:rowsTotal,parts:[...parts],sourceObjectContentDownloaded:false};
 await save('manifest',manifest);
 const summary={job,success:true,state:after,tables:tables.length,rows:rowsTotal,encryptedParts:parts.length,durableReadbackVerified:true,requiresFrozenFinalSnapshot:!after.frozen};
 await fs.writeFile('tests/artifacts/r2-freeze/production-backup-latest.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}catch(e){console.error(JSON.stringify({success:false,job,code:/^BACKUP_[A-Z_0-9]+$/.test(e.message)?e.message:'BACKUP_FAILED',completedParts:parts.length}));process.exitCode=1;}
