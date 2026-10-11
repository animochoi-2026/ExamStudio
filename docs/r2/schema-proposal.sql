-- REVIEW DRAFT ONLY. Not in automatic migrations. Apply only after a fresh DB backup.
-- No storage.objects/buckets writes; original payloads and timestamps stay intact.
begin;
create schema if not exists bank_storage_private;
revoke all on schema bank_storage_private from public,anon,authenticated;
create table bank_storage_private.settings(singleton boolean primary key default true check(singleton),provider text not null default 'supabase' check(provider in ('supabase','r2')),frozen boolean not null default false);
insert into bank_storage_private.settings values(true,'supabase',false);
create table bank_storage_private.deleted_objects(name text primary key,confirmed_at timestamptz not null default now());
create table bank_storage_private.function_backup(signature text primary key,definition text not null);
alter table bank_storage_private.settings enable row level security;
alter table bank_storage_private.deleted_objects enable row level security;
alter table bank_storage_private.function_backup enable row level security;
-- Freeze metadata changes too: old Electron clients and background RPCs must
-- not reserve new files or alter revisions while payload migration is running.
-- The row lock makes the freeze UPDATE wait for in-flight DB transactions.
create function bank_storage_private.guard_write() returns trigger language plpgsql security definer set search_path='' as $$
declare stopped boolean;begin
 select frozen into stopped from bank_storage_private.settings where singleton for share;
 if stopped then raise exception 'STORAGE_WRITES_FROZEN' using errcode='55000';end if;
 return null;
end $$;
revoke all on function bank_storage_private.guard_write() from public,anon,authenticated;
do $$ declare t record;begin
 for t in select tablename from pg_tables where schemaname='public' and tablename like 'bank\_%' escape '\'
   and tablename not in ('bank_spaces','bank_members','bank_invitations','bank_invite_attempts','bank_audit') loop
  execute format('create trigger bank_r2_freeze_write before insert or update or delete or truncate on public.%I for each statement execute function bank_storage_private.guard_write()',t.tablename);
 end loop;
end $$;
insert into bank_storage_private.function_backup
select oid::regprocedure::text,pg_get_functiondef(oid) from pg_proc
where oid in ('public.bank_object_allowed(text,boolean)'::regprocedure,
 'public.bank_question_delete_finish(uuid,text)'::regprocedure,
 'public.bank_revision_prune_finish(uuid,uuid,text)'::regprocedure);
-- Preserve the precise existing authorization predicate, independently of provider.
do $$ declare d text;begin
 select pg_get_functiondef('public.bank_object_allowed(text,boolean)'::regprocedure) into d;
 execute replace(d,'public.bank_object_allowed(','public.bank_file_object_allowed(');
end $$;
revoke all on function public.bank_file_object_allowed(text,boolean) from public,anon,authenticated;

create function public.bank_storage_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('provider',provider,'frozen',frozen) from bank_storage_private.settings;
$$;
revoke all on function public.bank_storage_status() from public,anon;
grant execute on function public.bank_storage_status() to authenticated,service_role;

create or replace function public.bank_object_allowed(object_name text,writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select (select provider='supabase' and (not writing or not frozen) from bank_storage_private.settings)
 and public.bank_file_object_allowed(object_name,writing);
$$;
-- Old desktop clients cannot continue writing to Supabase after cutover.
create policy bank_storage_freeze_delete on storage.objects as restrictive for delete to authenticated
using ((select provider='supabase' and not frozen from jsonb_to_record(public.bank_storage_status()) as x(provider text,frozen boolean)));

create function public.bank_file_access(object_name text,operation text,expected_provider text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and (select provider=expected_provider and (operation='read' or not frozen) from bank_storage_private.settings)
 and case operation
 when 'read' then public.bank_file_object_allowed(object_name,false)
 when 'write' then public.bank_file_object_allowed(object_name,true)
 when 'delete' then public.bank_deletion_object_allowed(object_name)
 else false end;
$$;
revoke all on function public.bank_file_access(text,text,text) from public,anon;
grant execute on function public.bank_file_access(text,text,text) to authenticated;

create function public.bank_r2_delete_receipt(object_name text) returns void language plpgsql security definer set search_path='' as $$
begin
 if (select provider from bank_storage_private.settings)<>'r2' or object_name !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[0-9]{3}$' then raise exception 'Invalid receipt';end if;
 -- service_role only, called after an authorized DELETE and a 404 HEAD.
 insert into bank_storage_private.deleted_objects(name) values(object_name) on conflict do nothing;
end $$;
revoke all on function public.bank_r2_delete_receipt(text) from public,anon,authenticated;
grant execute on function public.bank_r2_delete_receipt(text) to service_role;

create function public.bank_active_storage_objects() returns table(bucket_id text,name text) language sql stable security definer set search_path='' as $$
 select o.bucket_id,o.name from storage.objects o where (select provider='supabase' from bank_storage_private.settings)
 union all
 select 'question-bank',e.space_id::text||'/'||e.id::text||'/'||lpad(i::text,3,'0')
 from public.bank_entries e cross join lateral generate_series(0,e.chunks-1) i
 where e.kind='file' and (select provider='r2' from bank_storage_private.settings)
 and not exists(select 1 from bank_storage_private.deleted_objects d where d.name=e.space_id::text||'/'||e.id::text||'/'||lpad(i::text,3,'0'));
$$;
revoke all on function public.bank_active_storage_objects() from public,anon,authenticated;
-- Keep every existing claim/owner/token/reference/history check. Change only the
-- physical absence source, with exact occurrence guards against schema drift.
do $$ declare sig text;d text;needle text:='from storage.objects o,jsonb_array_elements';begin
 foreach sig in array array['public.bank_question_delete_finish(uuid,text)','public.bank_revision_prune_finish(uuid,uuid,text)'] loop
  select pg_get_functiondef(sig::regprocedure) into d;
  if (length(d)-length(replace(d,needle,'')))/length(needle)<>1 then raise exception 'Definition drift: %',sig;end if;
  execute replace(d,needle,'from public.bank_active_storage_objects() o,jsonb_array_elements');
 end loop;
end $$;
commit;
