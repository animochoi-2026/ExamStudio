'use strict';
// Delta-only regression in the existing network-disabled PostgreSQL fixture.
// This is not hosted Auth, real file deletion, or a production migration.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const args=['-d','podman-lossless-trial-20261007','-u','root','--','podman','exec','-i','examstudio-freeze-prep-test','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'];
const sql=q=>cp.execFileSync('wsl',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const fails=(q,re)=>{assert.throws(()=>sql(q),e=>re.test(String(e.stderr||e.message)));};
const checks=[],check=(name,fn)=>{fn();checks.push(name);};
const defs=JSON.parse(fs.readFileSync('tests/artifacts/r2-freeze/cutover-finish-before.json'));
const delta=fs.readFileSync('docs/r2/cutover-delta.sql','utf8');
const rollback=fs.readFileSync('docs/r2/cutover-delta-rollback.sql','utf8');
const adminArgs=[...args];adminArgs[adminArgs.indexOf('-U')+1]='supabase_admin';
const database='r2_delta_'+Date.now();
cp.execFileSync('wsl',adminArgs,{input:`create database ${database} owner postgres template template0;`,stdio:['pipe','pipe','pipe']});
args[args.indexOf('-d',args.indexOf('psql'))+1]=database;
const before=JSON.parse(fs.readFileSync('tests/artifacts/r2-freeze/production-before.json'));
sql(`create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create schema storage;create table storage.objects(bucket_id text,name text);
create function public.bank_member(uuid,boolean default false) returns boolean language sql stable as $$select coalesce(current_setting('test.member',true),'false')='true'$$;
create function public.bank_read_entry(uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.readable',true),'false')='true'$$;`);
for(const t of before.tables.filter(t=>t.schema==='public')){
 let columns='id uuid';
 if(t.name==='bank_entries')columns="id uuid,space_id uuid,chunks integer,owner_id uuid,verified boolean,kind text default 'file'";
 if(t.name==='bank_question_deletions')columns='id uuid,space_id uuid,completed boolean,files jsonb';
 if(t.name==='bank_revision_prunes')columns='id uuid,space_id uuid,completed boolean,actor_id uuid,plan jsonb';
 sql('create table public.'+t.name+'('+columns+');');
}
for(const f of before.functions)sql(f.definition+';revoke all on function public.'+f.signature+' from public,anon,service_role;grant execute on function public.'+f.signature+' to authenticated;');
sql(`insert into bank_entries(id,space_id,chunks,owner_id,verified) values('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222',1,'11111111-1111-1111-1111-111111111111',false);insert into bank_question_deletions values('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222',false,'[{"id":"33333333-3333-3333-3333-333333333333"}]');`);
for(const f of defs)sql(f.definition+';revoke all on function public.'+f.signature+' from public,anon,service_role;grant execute on function public.'+f.signature+' to authenticated;');
sql(fs.readFileSync('supabase/migrations/20261010132634_r2_freeze_preparation_only.sql','utf8'));
const baseStatus=sql('select public.bank_storage_status()'),baseCount=sql('select count(*) from bank_entries');
check('Compatible delta installs without switching or freezing',()=>{sql(delta);assert.equal(sql('select public.bank_storage_status()'),baseStatus);});
check('Repeat delta rejected',()=>fails(delta,/Delta already installed/));
check('Provider switch requires actual frozen server state',()=>fails("select bank_storage_private.set_provider('r2')",/Actual server freeze required/));
check('Normal and server roles cannot manage state or list all objects',()=>{
 for(const role of ['anon','authenticated','service_role'])for(const q of ["select bank_storage_private.set_provider('r2')","select bank_storage_private.set_frozen(true)",'select * from public.bank_active_storage_objects()'])fails('set role '+role+';'+q,/permission denied/);
});
check('Finish changes preserve exact original body except absence lookup and ACL',()=>{
 for(const f of defs){
  assert.equal(sql("select pg_get_functiondef('public."+f.signature+"'::regprocedure)").replaceAll('\r\n','\n'),f.definition.trim().replace('from storage.objects o,jsonb_array_elements','from public.bank_active_storage_objects() o,jsonb_array_elements').replaceAll('\r\n','\n'));
  assert.equal(sql("select proacl::text from pg_proc where oid='public."+f.signature+"'::regprocedure"),f.acl);
 }
});
const owner='11111111-1111-1111-1111-111111111111',space='22222222-2222-2222-2222-222222222222',file='33333333-3333-3333-3333-333333333333',key=space+'/'+file+'/000';
const ctx=`set "request.jwt.claim.sub"='${owner}';set "test.member"='true';set "test.readable"='true';`;
check('Frozen R2 allows authorized read only and blocks legacy paths',()=>{
 sql("select bank_storage_private.set_frozen(true);select bank_storage_private.set_provider('r2');");
 assert.equal(sql(ctx+`select public.bank_file_access('${key}','read','r2'),public.bank_file_access('${key}','write','r2'),public.bank_file_access('${key}','delete','r2'),public.bank_object_allowed('${key}',false),public.bank_object_allowed('${key}',true),public.bank_deletion_object_allowed('${key}');`).split('\n').pop(),'t|f|f|f|f|f');
 fails(`set role service_role;select public.bank_r2_delete_receipt('${key}')`,/Invalid receipt or frozen/);
});
check('Unfrozen R2 uses exact existing owner and deletion predicates',()=>{
 sql('select bank_storage_private.set_frozen(false)');
 assert.equal(sql(ctx+`select public.bank_file_access('${key}','write','r2'),public.bank_file_access('${key}','delete','r2'),public.bank_file_access('${key}','read','supabase');`).split('\n').pop(),'t|t|f');
 assert.equal(sql(ctx+`set "test.member"='false';set "test.readable"='false';select public.bank_file_access('${key}','read','r2'),public.bank_file_access('${key}','write','r2'),public.bank_file_access('${key}','delete','r2');`).split('\n').pop(),'f|f|f');
});
check('Receipt only server-writable and switches active object absence',()=>{
 assert.equal(sql("select count(*) from public.bank_active_storage_objects() where name='"+key+"'"),'1');
 for(const role of ['anon','authenticated'])fails(`set role ${role};select public.bank_r2_delete_receipt('${key}')`,/permission denied/);
 sql(`set role service_role;select public.bank_r2_delete_receipt('${key}')`);
 assert.equal(sql("select count(*) from public.bank_active_storage_objects() where name='"+key+"'"),'0');
});
check('Rollback refuses active R2 state',()=>fails(rollback,/Frozen Supabase/));
check('Rollback preserves all metadata, 24 guards and real frozen state',()=>{
 sql("select bank_storage_private.set_frozen(true);select bank_storage_private.set_provider('supabase');");sql(rollback);
 assert.deepEqual(JSON.parse(sql('select public.bank_storage_status()')),{provider:'supabase',frozen:true});
 assert.equal(sql('select count(*) from bank_entries'),baseCount);
 assert.equal(sql("select count(*) from pg_trigger where tgname='bank_r2_freeze_write'"),'24');
 for(const f of defs)assert.equal(sql("select md5(pg_get_functiondef('public."+f.signature+"'::regprocedure))"),f.definition_md5);
});
const result={kind:'actual isolated PostgreSQL delta regression; synthetic dependencies',passed:checks.length,checks,hostedAuth:false,productionChanges:false};
fs.writeFileSync('tests/artifacts/r2-freeze/cutover-delta-test-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
