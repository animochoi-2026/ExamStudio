// Read-only Management API probe. This credential is NOT a Storage transfer key.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const project='bjxxqdbftefughjkcrqj';
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('SCOPED_READ_PAT_REQUIRED');
const query=`with f as (select id,space_id,size,chunks,verified from public.bank_entries where kind='file'),
e as (select space_id::text||'/'||id::text||'/'||lpad(i::text,3,'0') key,least(6291456::bigint,size-i::bigint*6291456) size from f cross join lateral generate_series(0,chunks-1) i),
a as (select name key,(metadata->>'size')::bigint size from storage.objects where bucket_id='question-bank'),
j as (select e.key ek,a.key ak,e.size es,a.size az from e full join a using(key))
select now() observed_at,(select count(*) from f) logical_files,(select count(*) from a) storage_objects,(select sum(size) from a) storage_bytes,
(select count(*) from j where ak is null) missing,(select count(*) from j where ek is null) unreferenced,
(select count(*) from j where ek is not null and ak is not null and es is distinct from az) size_mismatches,
to_regprocedure('public.bank_storage_status()') is not null status_function_exists,
to_regnamespace('bank_storage_private') is not null migration_schema_exists`;
try{
 const r=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only:true}),signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw Error(`SCOPED_METADATA_HTTP_${r.status}`);
 const result=await r.json();
 const report={project,credential:'scoped Database Read PAT',scope:'SQL metadata only; not copy transport or frozen final inventory',result};
 const dir=resolve('tests/artifacts/r2');await mkdir(dir,{recursive:true});await writeFile(resolve(dir,'source-read-probe.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}catch(e){console.error(/^SCOPED_METADATA_HTTP_\d+$/.test(e.message)?e.message:'SOURCE_READ_PROBE_FAILED');process.exitCode=1;}
