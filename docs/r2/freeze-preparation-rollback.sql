-- Undo only this preparation installation, while Supabase is active and NOT frozen.
-- Refuses definition drift; never overwrites data or rolls back the entire database.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $restore$ declare f record; t record; begin
 if not exists(select 1 from bank_storage_private.settings where singleton and provider='supabase' and frozen=false) then
  raise exception 'Preparation rollback requires non-frozen Supabase state';
 end if;
 for f in select * from bank_storage_private.function_backup loop
  if pg_get_functiondef(f.signature::regprocedure) is distinct from f.installed_definition then raise exception 'Function changed since preparation: %',f.signature; end if;
 end loop;
 for f in select * from bank_storage_private.function_backup loop execute f.definition; end loop;
 for t in select table_name from bank_storage_private.trigger_targets order by table_name loop
  execute format('drop trigger bank_r2_freeze_write on public.%I',t.table_name);
 end loop;
end $restore$;
drop function public.bank_storage_status();
drop function bank_storage_private.set_frozen(boolean);
drop function bank_storage_private.guard_write();
drop function bank_storage_private.original_object_allowed(text,boolean);
drop function bank_storage_private.original_deletion_object_allowed(text);
drop table bank_storage_private.trigger_targets;
drop table bank_storage_private.function_backup;
drop table bank_storage_private.settings;
drop schema bank_storage_private;
notify pgrst,'reload schema';
commit;
