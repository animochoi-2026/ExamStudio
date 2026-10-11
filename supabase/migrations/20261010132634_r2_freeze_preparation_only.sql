-- Preparation only: no production freeze, provider switch, payload writes, or Edge deployment.
-- Baseline: 0e272251. Exact live definitions and relation list must match the reviewed backup.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $check$
begin
 if to_regnamespace('bank_storage_private') is not null or to_regprocedure('public.bank_storage_status()') is not null then
  raise exception 'Preparation state already exists; inspect instead of overwriting';
 end if;
 if md5(pg_get_functiondef('public.bank_object_allowed(text,boolean)'::regprocedure)) <> '83ce64b51dd49a863909da7e11d243b7' then raise exception 'Live definition drift: bank_object_allowed(text,boolean)'; end if;
 if md5(pg_get_functiondef('public.bank_deletion_object_allowed(text)'::regprocedure)) <> '4581c63acd957fd248fb0af750257c89' then raise exception 'Live definition drift: bank_deletion_object_allowed(text)'; end if;
 if (select array_agg(tablename::text order by tablename) from pg_tables where schemaname='public' and tablename like 'bank\_%' escape '\' and tablename not in ('bank_spaces','bank_members','bank_invitations','bank_invite_attempts','bank_audit'))
  is distinct from array['bank_catalog','bank_deleted_exams','bank_difficulty_ratings','bank_entries','bank_exam_drafts','bank_exam_history','bank_image_transitions','bank_maintenance_items','bank_maintenance_jobs','bank_mock_exams','bank_mock_items','bank_personal','bank_proposals','bank_question_deletions','bank_questions','bank_revision_files','bank_revision_prune_marks','bank_revision_prunes','bank_revisions','bank_scope_evidence','bank_source_identities','bank_source_numbering','bank_source_progress','bank_taxonomy']::text[] then raise exception 'Freeze target table drift'; end if;
end $check$;
create schema bank_storage_private;
revoke all on schema bank_storage_private from public,anon,authenticated,service_role;
create table bank_storage_private.settings(
 singleton boolean primary key default true check(singleton),
 provider text not null default 'supabase' check(provider='supabase'),
 frozen boolean not null default false
);
create table bank_storage_private.function_backup(signature text primary key,definition text not null,installed_definition text);
create table bank_storage_private.trigger_targets(table_name text primary key);
revoke all on all tables in schema bank_storage_private from public,anon,authenticated,service_role;
alter table bank_storage_private.settings enable row level security;
alter table bank_storage_private.function_backup enable row level security;
alter table bank_storage_private.trigger_targets enable row level security;
insert into bank_storage_private.settings values(true,'supabase',false);
insert into bank_storage_private.function_backup(signature,definition)
select oid::regprocedure::text,pg_get_functiondef(oid) from pg_proc
where oid in ('public.bank_object_allowed(text,boolean)'::regprocedure,'public.bank_deletion_object_allowed(text)'::regprocedure);
insert into bank_storage_private.trigger_targets values
('bank_catalog'),
('bank_deleted_exams'),
('bank_difficulty_ratings'),
('bank_entries'),
('bank_exam_drafts'),
('bank_exam_history'),
('bank_image_transitions'),
('bank_maintenance_items'),
('bank_maintenance_jobs'),
('bank_mock_exams'),
('bank_mock_items'),
('bank_personal'),
('bank_proposals'),
('bank_question_deletions'),
('bank_questions'),
('bank_revision_files'),
('bank_revision_prune_marks'),
('bank_revision_prunes'),
('bank_revisions'),
('bank_scope_evidence'),
('bank_source_identities'),
('bank_source_numbering'),
('bank_source_progress'),
('bank_taxonomy');
-- Clone the precise existing predicates into the non-exposed schema.
do $clone$ declare d text; begin
 select definition into d from bank_storage_private.function_backup where signature='bank_object_allowed(text,boolean)';
 execute replace(d,'public.bank_object_allowed(','bank_storage_private.original_object_allowed(');
 select definition into d from bank_storage_private.function_backup where signature='bank_deletion_object_allowed(text)';
 execute replace(d,'public.bank_deletion_object_allowed(','bank_storage_private.original_deletion_object_allowed(');
end $clone$;
revoke all on all functions in schema bank_storage_private from public,anon,authenticated,service_role;
-- CREATE OR REPLACE retains the current public function owners and ACLs.
create or replace function public.bank_object_allowed(object_name text,writing boolean default false)
returns boolean language sql stable security definer set search_path='' as $fn$
 select (select provider='supabase' and (not writing or not frozen) from bank_storage_private.settings where singleton)
 and bank_storage_private.original_object_allowed(object_name,writing);
$fn$;
create or replace function public.bank_deletion_object_allowed(object_name text)
returns boolean language sql stable security definer set search_path='' as $fn$
 select (select provider='supabase' and not frozen from bank_storage_private.settings where singleton)
 and bank_storage_private.original_deletion_object_allowed(object_name);
$fn$;
-- Existing migration CLI uses its existing server credential. No user-facing status grant.
create function public.bank_storage_status()
returns jsonb language sql stable security definer set search_path='' as $fn$
 select jsonb_build_object('provider',provider,'frozen',frozen) from bank_storage_private.settings where singleton;
$fn$;
revoke all on function public.bank_storage_status() from public,anon,authenticated,service_role;
grant execute on function public.bank_storage_status() to service_role;
create function bank_storage_private.guard_write()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare stopped boolean; begin
 select frozen into stopped from bank_storage_private.settings where singleton for share;
 if stopped is distinct from false then raise exception 'STORAGE_WRITES_FROZEN' using errcode='55000'; end if;
 return null;
end $fn$;
-- DB-owner management only. Installing this does not call it or freeze production.
create function bank_storage_private.set_frozen(value boolean)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
begin
 if value is null then raise exception 'Explicit boolean required'; end if;
 update bank_storage_private.settings set frozen=value where singleton and provider='supabase';
 if not found then raise exception 'Supabase preparation state missing'; end if;
 return public.bank_storage_status();
end $fn$;
revoke all on all functions in schema bank_storage_private from public,anon,authenticated,service_role;
do $triggers$ declare t record; begin
 for t in select table_name from bank_storage_private.trigger_targets order by table_name loop
  execute format('create trigger bank_r2_freeze_write before insert or update or delete or truncate on public.%I for each statement execute function bank_storage_private.guard_write()',t.table_name);
 end loop;
end $triggers$;
update bank_storage_private.function_backup set installed_definition=pg_get_functiondef(signature::regprocedure);
notify pgrst,'reload schema';
commit;
