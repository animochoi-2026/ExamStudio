-- Only after verified recovery of current R2-only/changed files to Supabase,
-- or before cutover when Supabase remained authoritative. Preserve current DB rows.
-- Restores the installed minimal freeze preparation; does not unfreeze.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $rollback$ declare f record;begin
 if not exists(select 1 from bank_storage_private.settings where singleton and frozen and provider='supabase') then raise exception 'Frozen Supabase and verified recovery required';end if;
 if (select count(*) from bank_storage_private.cutover_function_backup)<>3 then raise exception 'Backup incomplete';end if;
 for f in select * from bank_storage_private.cutover_function_backup loop
  if pg_get_functiondef(f.signature::regprocedure) is distinct from f.installed_definition then raise exception 'Definition changed since delta: %',f.signature;end if;
 end loop;
 for f in select * from bank_storage_private.cutover_function_backup loop execute f.definition;end loop;
end $rollback$;
drop function public.bank_file_access(text,text,text);
drop function public.bank_r2_delete_receipt(text);
drop function public.bank_active_storage_objects();
drop function bank_storage_private.set_provider(text);
alter table bank_storage_private.settings drop constraint settings_provider_check;
alter table bank_storage_private.settings add constraint settings_provider_check check(provider='supabase');
-- Retain receipt and definition tables for recovery audit. No payload/metadata deletion.
notify pgrst,'reload schema';
commit;
