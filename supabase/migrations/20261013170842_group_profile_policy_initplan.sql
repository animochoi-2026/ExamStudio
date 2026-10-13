begin;
alter policy own_profile on public.bank_member_profiles using(user_id=(select auth.uid()));
commit;
