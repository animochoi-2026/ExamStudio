'use strict';
// Real PostgreSQL (PGlite WASM) executes the migration and RLS. This is NOT a live Supabase test.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const enginePath=require.resolve('@electric-sql/pglite');
const S='57fcd460-b526-487f-9075-5503e4d07145',A='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',X='cccccccc-cccc-4ccc-cccc-cccccccccccc',Q='dddddddd-dddd-4ddd-dddd-dddddddddddd',R='eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',F='ffffffff-ffff-4fff-ffff-ffffffffffff';
test('PostgreSQL enforces approved membership, ownership, immutable storage and audit',async t=>{
 const {PGlite}=require(enginePath),db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema public,auth,storage to authenticated,anon,service_role;grant select,insert,update,delete on storage.objects to authenticated;insert into auth.users values('${A}','animochoi@gmail.com',now()),('${B}','teacher-b@example.test',now()),('${X}','outsider@example.test',now());`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202609300001_shared_bank.sql'),'utf8'));
  const as=async(id)=>db.exec(`reset role;set request.jwt.claim.sub='${id}';set role authenticated;`),query=(sql,args=[])=>db.query(sql,args);
  await as(X);assert.equal((await query('select * from bank_spaces')).rows.length,0);await assert.rejects(query('select bank_join($1)',[S]));await assert.rejects(query('select bank_invite($1,$2)',[S,'intruder@example.test']));
  await as(A);assert.equal((await query('select bank_join($1) as m',[S])).rows[0].m.role,'owner');await query('select bank_invite($1,$2)',[S,'teacher-b@example.test']);await query('select bank_begin_revision($1,$2,$3)',[S,Q,R]);
  const props={rootId:S,questionId:Q,revisionId:R,role:'docx'};
  const reserve=()=>query('select bank_reserve($1,$2,$3,$4,$5,$6,$7,$8,$9)',[S,F,S,'question.docx',props,3,'a'.repeat(64),'b'.repeat(32),1]);
  await reserve();await query('insert into storage.objects(bucket_id,name) values($1,$2)',['question-bank',`${S}/${F}/000`]);await assert.rejects(query('insert into storage.objects(bucket_id,name) values($1,$2)',['question-bank',`${S}/${F}/001`]));
  await assert.rejects(query('select bank_finish($1,$2)',[F,A]));
  await as(B);assert.equal((await query('select bank_join($1) as m',[S])).rows[0].m.role,'teacher');assert.equal((await query('select * from bank_entries where id=$1',[F])).rows.length,0);await assert.rejects(query('select bank_begin_revision($1,$2,$3)',[S,Q,'11111111-1111-4111-8111-111111111111']));await assert.rejects(query('select bank_invite($1,$2)',[S,'new@example.test']));await assert.rejects(reserve());await assert.rejects(query('delete from bank_questions where id=$1',[Q]));
  await db.exec('reset role;set role service_role;');await query('select bank_finish($1,$2)',[F,A]);
  await as(B);assert.equal((await query('select * from bank_entries where id=$1',[F])).rows.length,1);assert.equal((await query('select * from storage.objects')).rows.length,1);assert.equal((await query('update storage.objects set name=$1 returning *',['changed'])).rows.length,0);assert.equal((await query('delete from storage.objects returning *')).rows.length,0);
  await as(A);await query('select bank_invite($1,$2,false)',[S,'teacher-b@example.test']);assert.equal((await query('select * from bank_audit')).rows.length,2);await assert.rejects(query('select bank_invite($1,$2,false)',[S,'animochoi@gmail.com']));
  await as(B);assert.equal((await query('select * from bank_entries')).rows.length,0);assert.equal((await query('select * from storage.objects')).rows.length,0);await assert.rejects(query('select bank_join($1)',[S]));
 }finally{await db.close();}
});
test('maintenance migration applied after conflict hotfix preserves atomic finish',async()=>{
 const {localServer}=require('./shared-bank-local-server.cjs');
 const x=await localServer({through:'202610020019_question_task_types.sql',deferMigrations:['202609300011_maintenance.sql','202610020019_question_task_types.sql']});
 try{
  const query="select pg_get_functiondef('public.bank_finish(uuid,uuid,jsonb)'::regprocedure) as definition";
  const before=(await x.db.query(query)).rows[0].definition;
  await x.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202609300011_maintenance.sql'),'utf8'));
  await x.db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610020019_question_task_types.sql'),'utf8'));
  const after=(await x.db.query(query)).rows[0].definition;
  assert.equal(after,before);
  assert.match(after,/pg_advisory_xact_lock/);
  assert.equal((await x.db.query("select count(*)::int as n from information_schema.tables where table_schema='public' and table_name in ('bank_maintenance_jobs','bank_maintenance_items')")).rows[0].n,2);
 }finally{await x.close();}
});
