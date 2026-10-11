-- ONLY after freeze + reverse copy + full verification of active files, including
-- all R2-only uploads. Never restore an old DB snapshot over new registrations.
begin;
do $$ declare row record;begin
 if not exists(select 1 from bank_storage_private.settings where frozen and provider='supabase') then raise exception 'Reverse-copy verification and frozen Supabase mode required';end if;
 for row in select * from bank_storage_private.function_backup loop execute row.definition;end loop;
end $$;
drop policy bank_storage_freeze_delete on storage.objects;
do $$ declare t record;begin
 for t in select n.nspname,c.relname from pg_trigger g join pg_class c on c.oid=g.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where g.tgname='bank_r2_freeze_write' and n.nspname='public' loop
  execute format('drop trigger bank_r2_freeze_write on %I.%I',t.nspname,t.relname);
 end loop;
end $$;
-- Keep private receipts and definition backups for audit/recovery.
commit;
