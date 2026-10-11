'use strict';
// Tests only the new SQL against real PostgreSQL in a network-disabled disposable container.
// The existing real Auth/Edge/R2 integration evidence remains a separate inherited result.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const prefix=['-d','podman-lossless-trial-20261007','-u','root','--','podman','exec','-i','examstudio-freeze-prep-test','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'];
const sql=q=>cp.execFileSync('wsl',prefix,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const before=JSON.parse(fs.readFileSync('tests/artifacts/r2-freeze/production-before.json','utf8'));
const migration=fs.readFileSync('supabase/migrations/20261010132634_r2_freeze_preparation_only.sql','utf8');
const rollback=fs.readFileSync('docs/r2/freeze-preparation-rollback.sql','utf8');
const checks=[];
function check(name,fn){fn();checks.push(name);}
function fails(q,needle){try{sql(q);throw Error('Expected rejection');}catch(e){assert.match(String(e.stderr||e.message),needle);}}
sql(`
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create function public.bank_member(uuid, boolean default false) returns boolean language sql stable as $$ select coalesce(current_setting('test.member',true),'false')='true' $$;
create function public.bank_read_entry(uuid) returns boolean language sql stable as $$ select coalesce(current_setting('test.readable',true),'false')='true' $$;
`);
for(const t of before.tables.filter(t=>t.schema==='public')){
 let columns='id uuid';
 if(t.name==='bank_entries')columns='id uuid,space_id uuid,chunks integer,owner_id uuid,verified boolean';
 if(t.name==='bank_question_deletions')columns='id uuid,space_id uuid,completed boolean,files jsonb';
 if(t.name==='bank_revision_prunes')columns='id uuid,space_id uuid,completed boolean,actor_id uuid,plan jsonb';
 sql('create table public.'+t.name+'('+columns+');');
}
for(const f of before.functions)sql(f.definition+';revoke all on function public.'+f.signature+' from public,anon,service_role;grant execute on function public.'+f.signature+' to authenticated;');
const owner='11111111-1111-1111-1111-111111111111',space='22222222-2222-2222-2222-222222222222',file='33333333-3333-3333-3333-333333333333',key=space+'/'+file+'/000';
sql(`insert into public.bank_entries values('${file}','${space}',1,'${owner}',false);insert into public.bank_question_deletions values('${file}','${space}',false,'[{"id":"${file}"}]');`);
const baseAcl=sql("select json_agg(proacl::text order by proname) from pg_proc where oid in ('public.bank_object_allowed(text,boolean)'::regprocedure,'public.bank_deletion_object_allowed(text)'::regprocedure)");
check('Exact production definition preconditions and install',()=>sql(migration));
check('Supabase non-frozen defaults',()=>assert.deepEqual(JSON.parse(sql('select public.bank_storage_status()')),{provider:'supabase',frozen:false}));
check('Existing predicate ACLs unchanged',()=>assert.equal(sql("select json_agg(proacl::text order by proname) from pg_proc where oid in ('public.bank_object_allowed(text,boolean)'::regprocedure,'public.bank_deletion_object_allowed(text)'::regprocedure)"),baseAcl));
check('Status available to existing server role only',()=>{
 assert.equal(sql("set role service_role;select public.bank_storage_status()").split('\n').pop(),'{"frozen": false, "provider": "supabase"}');
 for(const role of ['anon','authenticated'])fails('set role '+role+';select public.bank_storage_status()',/permission denied/);
});
check('No normal-user management, table or private predicate access',()=>{
 for(const role of ['anon','authenticated','service_role']){
  fails('set role '+role+';select bank_storage_private.set_frozen(true)',/permission denied/);
  fails("set role "+role+";update bank_storage_private.settings set provider='r2'",/permission denied/);
 }
 fails("update bank_storage_private.settings set provider='r2'",/check constraint/);
});
const ctx=`set "request.jwt.claim.sub"='${owner}';set "test.member"='true';set "test.readable"='true';`;
check('Unfrozen predicates identical over membership, owner, read visibility and malformed keys',()=>{
 for(const member of [false,true])for(const readable of [false,true])for(const actor of [owner,space])for(const object of [key,space+'/'+file+'/001','bad']){
  const q=`set "request.jwt.claim.sub"='${actor}';set "test.member"='${member}';set "test.readable"='${readable}';select public.bank_object_allowed('${object}',false) is not distinct from bank_storage_private.original_object_allowed('${object}',false), public.bank_object_allowed('${object}',true) is not distinct from bank_storage_private.original_object_allowed('${object}',true), public.bank_deletion_object_allowed('${object}') is not distinct from bank_storage_private.original_deletion_object_allowed('${object}');`;
  assert.equal(sql(q).split('\n').pop(),'t|t|t');
 }
});
check('Unfrozen metadata insert/update/delete remain allowed',()=>sql("insert into bank_personal values('"+owner+"');update bank_personal set id='"+space+"';delete from bank_personal;"));
check('Frozen metadata writes rejected on every installed target under DB owner execution',()=>{
 sql('select bank_storage_private.set_frozen(true)');
 const targets=sql('select table_name from bank_storage_private.trigger_targets order by table_name').split('\n');
 for(const t of targets)for(const action of ['insert into '+t+'(id) values(null)','update '+t+' set id=id where false','delete from '+t+' where false','truncate '+t])fails(action,/STORAGE_WRITES_FROZEN/);
});
check('Frozen reads preserved, storage upload/delete predicates rejected',()=>{
 assert.equal(sql(ctx+`select public.bank_object_allowed('${key}',false),public.bank_object_allowed('${key}',true),public.bank_deletion_object_allowed('${key}');`).split('\n').pop(),'t|f|f');
});
check('Rollback refuses frozen state',()=>fails(rollback,/non-frozen Supabase/));
check('Unfreeze restores predicate behavior',()=>{
 sql('select bank_storage_private.set_frozen(false)');
 assert.equal(sql(ctx+`select public.bank_object_allowed('${key}',false),public.bank_object_allowed('${key}',true),public.bank_deletion_object_allowed('${key}');`).split('\n').pop(),'t|t|t');
});
check('Rollback restores exact original definitions and removes only installation',()=>{
 sql(rollback);
 for(const f of before.functions)assert.equal(sql("select md5(pg_get_functiondef('public."+f.signature+"'::regprocedure))"),f.definition_md5);
 assert.equal(sql("select to_regnamespace('bank_storage_private') is null, to_regprocedure('public.bank_storage_status()') is null"),'t|t');
 assert.equal(sql('select count(*) from bank_entries'),'1');
});
const result={kind:'new minimal freeze SQL only; real isolated PostgreSQL; synthetic predicate dependencies',checks,passed:checks.length,productionWrites:false};
fs.writeFileSync('tests/artifacts/r2-freeze/sql-test-result.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
