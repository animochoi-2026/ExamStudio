import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '../../tools/storage-migration/node_modules/@electric-sql/pglite/dist/index.js';
const space='11111111-1111-4111-8111-111111111111',file='22222222-2222-4222-8222-222222222222',name=space+'/'+file+'/000';
test('SQL proposal preserves Supabase default, enforces freeze and receipts, restores definitions locally',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql as $$select '33333333-3333-4333-8333-333333333333'::uuid$$;
 create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;
 create table public.bank_entries(id uuid,space_id uuid,kind text,chunks integer);
 create function public.bank_object_allowed(object_name text,writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$select object_name='${name}'$$;
 create function public.bank_deletion_object_allowed(object_name text) returns boolean language sql as $$select object_name='${name}'$$;
 create function public.bank_question_delete_finish(q uuid,expected_token text) returns void language plpgsql security definer set search_path='' as $$declare job jsonb;begin
 if exists(select 1 from storage.objects o,jsonb_array_elements('[{}]'::jsonb) f where o.bucket_id='question-bank') then raise exception 'remaining';end if;end$$;
 create function public.bank_revision_prune_finish(s uuid,j uuid,expected_token text) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from storage.objects o,jsonb_array_elements('[{}]'::jsonb) f where o.bucket_id='question-bank') then raise exception 'remaining';end if;return '{}'::jsonb;end$$;
 insert into storage.objects values('question-bank','${name}');insert into public.bank_entries values('${file}','${space}','file',1);`);
 await db.exec(await readFile(new URL('../../docs/r2/schema-proposal.sql',import.meta.url),'utf8'));
 const scalar=async sql=>(await db.query(sql)).rows[0].ok;
 assert.equal(await scalar(`select public.bank_file_access('${name}','write','supabase') as ok`),true);
 assert.equal(await scalar(`select public.bank_file_access('${name}','read','r2') as ok`),false);
 assert.equal(await scalar(`select public.bank_file_access('${name.replace('/000','/001')}','read','supabase') as ok`),false);
 await db.exec(`update bank_storage_private.settings set frozen=true;`);
 await assert.rejects(db.exec(`update public.bank_entries set chunks=chunks`),/STORAGE_WRITES_FROZEN/);
 await assert.rejects(db.exec(`delete from public.bank_entries where false`),/STORAGE_WRITES_FROZEN/);
 assert.equal(await scalar(`select public.bank_file_access('${name}','write','supabase') as ok`),false);
 assert.equal(await scalar(`select public.bank_file_access('${name}','read','supabase') as ok`),true);
 await db.exec(`update bank_storage_private.settings set provider='r2',frozen=false;`);
 await db.exec(`update public.bank_entries set chunks=chunks`);
 assert.equal(await scalar(`select public.bank_object_allowed('${name}',false) as ok`),false);
 assert.equal(await scalar(`select public.bank_file_access('${name}','write','r2') as ok`),true);
 assert.equal(await scalar(`select has_function_privilege('authenticated','public.bank_r2_delete_receipt(text)','execute') as ok`),false);
 await assert.rejects(db.query(`select public.bank_question_delete_finish('${file}','token')`),/remaining/);
 await db.exec(`select public.bank_r2_delete_receipt('${name}');select public.bank_question_delete_finish('${file}','token');`);
 assert.equal(Number((await db.query('select count(*) from storage.objects')).rows[0].count),1,'Supabase backup is untouched');
 await db.exec(`update bank_storage_private.settings set provider='supabase',frozen=true;`);
 await db.exec(await readFile(new URL('../../docs/r2/schema-rollback.sql',import.meta.url),'utf8'));
 await assert.rejects(db.query(`select public.bank_question_delete_finish('${file}','token')`),/remaining/);
 }finally{await db.close();}
});
