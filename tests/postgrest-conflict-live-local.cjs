'use strict';
// Real PostgreSQL + PostgREST HTTP. Disposable loopback-only cluster, never production.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'data/diagnostics/db-20261001-hotfix'),bin=path.join(require('node:os').tmpdir(),'examstudio-dbhotfix-tools/pgsql/bin'),cluster=path.join(require('node:os').tmpdir(),'examstudio-isolated-pg-'+Date.now()),report=[];
const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,PGCLIENTENCODING:'UTF8'};
function run(exe,args,input){const r=cp.spawnSync(path.join(bin,exe+'.exe'),args,{env,input,encoding:'utf8',windowsHide:true,...(exe==='pg_ctl'?{stdio:'ignore'}:{}),maxBuffer:10*1024*1024});if(r.status!==0)throw Error(exe+': '+r.stderr);return r.stdout;}
function sql(q){return run('psql',['-h','127.0.0.1','-p','55432','-U','fixture','-d','postgres','-X','-t','-A','-v','ON_ERROR_STOP=1'],q);}
const S='57fcd460-b526-487f-9075-5503e4d07145',A='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
let server,started=false;
(async()=>{try{
 if(!fs.existsSync(cluster))run('initdb',['-D',cluster,'-U','fixture','-A','trust','--encoding=UTF8','--locale=C']);
 run('pg_ctl',['-D',cluster,'-l',path.join(require('node:os').tmpdir(),'examstudio-isolated-pg.log'),'-o','-h 127.0.0.1 -p 55432','-w','start']);started=true;
 sql(`create role anon;create role authenticated;create role service_role;create role authenticator login noinherit;grant anon,authenticated,service_role to authenticator;
 create schema auth;create schema storage;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{}',unique(bucket_id,name));
 alter table storage.objects enable row level security;grant usage on schema public,auth,storage to authenticated,anon,service_role;
 grant select,insert,update,delete on storage.objects to authenticated;
 insert into auth.users values('${A}','animochoi@gmail.com',now()),('${B}','teacher-b@example.test',now());`);
 for(const n of fs.readdirSync(path.join(root,'supabase/migrations')).filter(n=>n.endsWith('.sql')&&!n.includes('011_')).sort())sql(fs.readFileSync(path.join(root,'supabase/migrations',n),'utf8'));
 sql(`insert into bank_members(space_id,email,user_id,role,enabled) values('${S}','teacher-b@example.test','${B}','teacher',true);`);
 const secret=crypto.randomBytes(48).toString('hex');
 const token=(role,sub=A)=>{const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),p=Buffer.from(JSON.stringify({role,sub,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return h+'.'+p+'.'+crypto.createHmac('sha256',secret).update(h+'.'+p).digest('base64url');};
 const conf=path.join(base,'isolated-postgrest.conf');fs.writeFileSync(conf,`db-uri="postgresql://authenticator@127.0.0.1:55432/postgres"\ndb-schemas="public"\ndb-anon-role="anon"\njwt-secret="${secret}"\nserver-host="127.0.0.1"\nserver-port=55433\n`);
 const log=fs.openSync(path.join(base,'isolated-postgrest.log'),'w');server=cp.spawn(path.join(base,'tools/postgrest.exe'),[conf],{env,windowsHide:true,stdio:['ignore',log,log]});
 for(let i=0;i<100;i++){try{const ready=await fetch('http://127.0.0.1:55433/');if(ready.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const rpc=async(name,args,role='service_role',sub=A)=>{const start=Date.now();const r=await fetch('http://127.0.0.1:55433/rpc/'+name,{method:'POST',headers:{Authorization:'Bearer '+token(role,sub),'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(5000)});const text=await r.text();return{status:r.status,data:text?JSON.parse(text):null,ms:Date.now()-start};};
 function revision(q,parent=null,actor=A){const r=crypto.randomUUID(),f=crypto.randomUUID();sql(`insert into bank_questions(id,space_id,owner_id,owner_email) values('${q}','${S}','${A}','animochoi@gmail.com') on conflict do nothing;
 insert into bank_revisions(id,question_id,parent_id,actor_id) values('${r}','${q}',${parent?"'"+parent+"'":'null'},'${actor}');
 insert into bank_entries(id,space_id,name,kind,owner_id,props) values('${f}','${S}','completion','file','${actor}','${JSON.stringify({role:'commit',questionId:q,revisionId:r})}');`);return{f,actor,record:{questionId:q,revisionId:r,parentRevisionId:parent,metadata:{source:{originalNumber:'17'},difficulty:{aiScore:null}},content:{body:'$\\sqrt{2}$',answer:'①'},files:[]}};}
 const q=crypto.randomUUID(),first=revision(q);let result=await rpc('bank_finish',first);assert.equal(result.status,204);report.push({case:'new',...result});
 const newer=revision(q,first.record.revisionId);result=await rpc('bank_finish',newer);assert.equal(result.status,204);report.push({case:'update',...result});
 const before=sql('select json_build_object(\'catalog\',count(*),\'audit\',(select count(*) from bank_audit),\'links\',(select count(*) from bank_revision_files)) from bank_catalog;');
 result=await rpc('bank_finish',first);assert.equal(result.status,204);assert.equal(sql('select json_build_object(\'catalog\',count(*),\'audit\',(select count(*) from bank_audit),\'links\',(select count(*) from bank_revision_files)) from bank_catalog;'),before);report.push({case:'lost-response old completed replay',...result});
 result=await rpc('bank_finish',{...first,record:{...first.record,content:{body:'changed'}}});assert.equal(result.status,409);assert.equal(result.data.code,'PT409');report.push({case:'mismatched replay',...result});
 const stale=revision(q,first.record.revisionId);result=await rpc('bank_finish',stale);assert.equal(result.status,409);assert.equal(result.data.code,'PT409');report.push({case:'stale base',...result});
 const c1=revision(q,newer.record.revisionId),c2=revision(q,newer.record.revisionId);const parallel=await Promise.all([rpc('bank_finish',c1),rpc('bank_finish',c2)]);assert.deepEqual(parallel.map(x=>x.status).sort(),[204,409]);report.push({case:'concurrent authorized sessions',results:parallel});
 const own=revision(crypto.randomUUID()),foreign={...own,actor:B};const twoUsers=await Promise.all([rpc('bank_finish',own),rpc('bank_finish',foreign)]);assert.deepEqual(twoUsers.map(x=>x.status),[204,403]);report.push({case:'two users, foreign mutation denied',results:twoUsers});
 result=await rpc('bank_finish',own,'authenticated',A);assert.equal(result.status,403);report.push({case:'client cannot impersonate verifier',...result});
 result=await rpc('bank_begin_revision',{s:S,q,r:crypto.randomUUID(),p:newer.record.revisionId},'authenticated',B);assert.equal(result.status,403);report.push({case:'teacher cannot edit another owner',...result});
 sql('select pg_stat_clear_snapshot();');const measure=()=>JSON.parse(sql("select json_build_object('rollbacks',xact_rollback,'inserts',(select n_tup_ins from pg_stat_user_tables where relname='bank_catalog'),'active',(select count(*) from pg_stat_activity where usename='authenticator' and state='active')) from pg_stat_database where datname=current_database();"));
 const m1=measure();await new Promise(r=>setTimeout(r,2000));const m2=measure();assert.equal(m2.active,0);assert.equal(m1.inserts,m2.inserts);assert.equal(m1.rollbacks,m2.rollbacks);report.push({case:'no background retry after conflict',before:m1,after:m2});
 console.log(JSON.stringify({passed:report.length,report},null,2));fs.writeFileSync(path.join(base,'postgrest-tests.json'),JSON.stringify({at:new Date().toISOString(),postgres:run('postgres',['--version']).trim(),postgrest:'14.18',report},null,2));
 }finally{if(server)server.kill();if(started)run('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);}})().catch(e=>{console.error(e);process.exitCode=1;});
