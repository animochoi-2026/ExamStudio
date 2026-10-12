-- Deploy the previous clients first. Preserve all identity mappings and logs.
begin;
set local lock_timeout='5s';
do $$declare t record; original text;begin
 select value into original from bank_security.install_backup where name='bank_member';
 if original is null then raise exception 'Missing bank_member backup';end if;
 execute original;
 for t in select schemaname,tablename from pg_policies where schemaname='public' and policyname='bank_security_session' loop
  execute format('drop policy bank_security_session on %I.%I',t.schemaname,t.tablename);
 end loop;
 select value into original from bank_security.install_backup where name='pre_request';
 if original is null then raise exception 'Missing hook backup';end if;
 if original='' then execute 'alter role authenticator reset pgrst.db_pre_request';else execute format('alter role authenticator set pgrst.db_pre_request=%L',original);end if;
end $$;
update bank_security.settings set enabled=false,version=version+1;
revoke execute on function public.bank_download_begin(uuid,uuid,text,uuid[],text,uuid),public.bank_download_finish(uuid,uuid,boolean) from authenticated;
notify pgrst,'reload config';notify pgrst,'reload schema';
commit;
