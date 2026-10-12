-- Operator-only rollback. Stops if membership was edited since installation.
-- Keep the private request/audit/backup history. Do not execute in normal use.
begin;
set local lock_timeout='5s';
lock table public.bank_members in share row exclusive mode;
do $$ declare m jsonb;f jsonb;p jsonb;begin
 for m in select * from jsonb_array_elements((select value from bank_access.install_backup where kind='members')) loop
  if not exists(select 1 from public.bank_members c where c.space_id=(m->>'space_id')::uuid and c.email=m->>'email' and c.user_id is not distinct from (m->>'user_id')::uuid and c.enabled=(m->>'enabled')::boolean and c.role_version=(m->>'role_version')::bigint+case when m->>'role'='reviewer' then 1 else 0 end) then raise exception 'Membership changed after installation; reconcile current records before rollback';end if;
 end loop;
 if exists(select 1 from public.bank_members where role='admin') then raise exception 'New administrators require explicit reconciliation before rollback';end if;
 for f in select * from jsonb_array_elements((select value from bank_access.install_backup where kind='functions')) loop execute f->>'sql';end loop;
 alter table public.bank_members drop constraint bank_members_role_check;
 alter table public.bank_members add constraint bank_members_role_check check(role in ('owner','reviewer','teacher')) not valid;
 for m in select * from jsonb_array_elements((select value from bank_access.install_backup where kind='members')) loop
  update public.bank_members set role=m->>'role' where space_id=(m->>'space_id')::uuid and email=m->>'email';
 end loop;
 alter table public.bank_members validate constraint bank_members_role_check;
 for p in select * from jsonb_array_elements((select value from bank_access.install_backup where kind='policies')) loop
  execute format('drop policy if exists %I on public.%I',p->>'policyname',p->>'tablename');
  execute format('create policy %I on public.%I for select to authenticated using (%s)',p->>'policyname',p->>'tablename',p->>'qual');
 end loop;
end $$;
revoke execute on function public.bank_signup_request(uuid,boolean),public.bank_signup_list(uuid),public.bank_signup_approve(uuid,uuid),public.bank_members_manage(uuid),public.bank_member_revoke(uuid,uuid,bigint),public.bank_access_context(uuid),public.bank_search_page(uuid,jsonb,integer),public.bank_search_options(uuid),public.bank_public_summary(uuid),public.bank_replacement_page(uuid,uuid,jsonb,uuid[],integer,boolean,text,uuid) from public,anon,authenticated;
commit;
