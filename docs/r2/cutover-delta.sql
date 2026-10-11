-- Reviewed separately from the old full proposal. Requires installed freeze preparation.
-- Does not freeze, switch provider, change references, or touch Storage objects.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $guard$ begin
 if to_regclass('bank_storage_private.cutover_function_backup') is not null then raise exception 'Delta already installed; inspect instead of reapplying'; end if;
 if not exists(select 1 from bank_storage_private.settings where singleton and provider='supabase') then raise exception 'Supabase preparation required'; end if;
 if (select count(*) from bank_storage_private.function_backup)<>2 or exists(
  select 1 from bank_storage_private.function_backup where installed_definition is distinct from pg_get_functiondef(signature::regprocedure)
 ) then raise exception 'Installed preparation definition drift'; end if;
 if md5(pg_get_functiondef('public.bank_question_delete_finish(uuid,text)'::regprocedure))<>'0b7b30b5194755d60de4437f03c916a6' or
    md5(pg_get_functiondef('public.bank_revision_prune_finish(uuid,uuid,text)'::regprocedure))<>'150213bffed6a7b0b4a8ad47215f29c5' then raise exception 'Finish definition drift'; end if;
 if (select count(*) from bank_storage_private.trigger_targets)<>24 or
    (select count(*) from pg_trigger where tgname='bank_r2_freeze_write' and tgenabled='O')<>24 then raise exception 'Freeze coverage drift'; end if;
end $guard$;
create table bank_storage_private.cutover_function_backup(signature text primary key,definition text not null,installed_definition text);
create table bank_storage_private.deleted_objects(name text primary key,confirmed_at timestamptz not null default now());
alter table bank_storage_private.cutover_function_backup enable row level security;
alter table bank_storage_private.deleted_objects enable row level security;
revoke all on bank_storage_private.cutover_function_backup,bank_storage_private.deleted_objects from public,anon,authenticated,service_role;
insert into bank_storage_private.cutover_function_backup(signature,definition)
select oid::regprocedure::text,pg_get_functiondef(oid) from pg_proc where oid in (
 'public.bank_question_delete_finish(uuid,text)'::regprocedure,
 'public.bank_revision_prune_finish(uuid,uuid,text)'::regprocedure,
 'bank_storage_private.set_frozen(boolean)'::regprocedure);
alter table bank_storage_private.settings drop constraint settings_provider_check;
alter table bank_storage_private.settings add constraint settings_provider_check check(provider in ('supabase','r2'));
create or replace function bank_storage_private.set_frozen(value boolean)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
begin
 if value is null then raise exception 'Explicit boolean required'; end if;
 update bank_storage_private.settings set frozen=value where singleton;
 if not found then raise exception 'Storage state missing'; end if;
 return public.bank_storage_status();
end $fn$;
-- DB owner only. Caller must first validate the durable migration/recovery report.
create function bank_storage_private.set_provider(value text)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
begin
 if value is null or value not in ('supabase','r2') then raise exception 'Invalid provider'; end if;
 update bank_storage_private.settings set provider=value where singleton and frozen;
 if not found then raise exception 'Actual server freeze required'; end if;
 return public.bank_storage_status();
end $fn$;
revoke all on function bank_storage_private.set_provider(text) from public,anon,authenticated,service_role;
create function public.bank_file_access(object_name text,operation text,expected_provider text)
returns boolean language sql stable security definer set search_path='' as $fn$
 select auth.uid() is not null
 and (select provider=expected_provider and (operation='read' or not frozen) from bank_storage_private.settings where singleton)
 and case operation
  when 'read' then bank_storage_private.original_object_allowed(object_name,false)
  when 'write' then bank_storage_private.original_object_allowed(object_name,true)
  when 'delete' then bank_storage_private.original_deletion_object_allowed(object_name)
  else false end;
$fn$;
revoke all on function public.bank_file_access(text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.bank_file_access(text,text,text) to authenticated;
create function public.bank_r2_delete_receipt(object_name text)
returns void language plpgsql security definer set search_path='' as $fn$
begin
 if not exists(select 1 from bank_storage_private.settings where singleton and provider='r2' and not frozen)
 or object_name !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[0-9]{3}$' or object_name is null then raise exception 'Invalid receipt or frozen storage'; end if;
 -- Server calls only after authorized removal and confirmed absence.
 insert into bank_storage_private.deleted_objects(name) values(object_name) on conflict do nothing;
end $fn$;
revoke all on function public.bank_r2_delete_receipt(text) from public,anon,authenticated,service_role;
grant execute on function public.bank_r2_delete_receipt(text) to service_role;
create function public.bank_active_storage_objects() returns table(bucket_id text,name text)
language sql stable security definer set search_path='' as $fn$
 select o.bucket_id,o.name from storage.objects o where (select provider='supabase' from bank_storage_private.settings where singleton)
 union all
 select 'question-bank',e.space_id::text||'/'||e.id::text||'/'||lpad(i::text,3,'0')
 from public.bank_entries e cross join lateral generate_series(0,e.chunks-1) i
 where e.kind='file' and (select provider='r2' from bank_storage_private.settings where singleton)
 and not exists(select 1 from bank_storage_private.deleted_objects d where d.name=e.space_id::text||'/'||e.id::text||'/'||lpad(i::text,3,'0'));
$fn$;
revoke all on function public.bank_active_storage_objects() from public,anon,authenticated,service_role;
do $finish$ declare sig text;d text;needle text:='from storage.objects o,jsonb_array_elements';begin
 foreach sig in array array['public.bank_question_delete_finish(uuid,text)','public.bank_revision_prune_finish(uuid,uuid,text)'] loop
  select pg_get_functiondef(sig::regprocedure) into d;
  if (length(d)-length(replace(d,needle,'')))/length(needle)<>1 then raise exception 'Finish body drift: %',sig;end if;
  execute replace(d,needle,'from public.bank_active_storage_objects() o,jsonb_array_elements');
 end loop;
end $finish$;
update bank_storage_private.cutover_function_backup set installed_definition=pg_get_functiondef(signature::regprocedure);
notify pgrst,'reload schema';
commit;
