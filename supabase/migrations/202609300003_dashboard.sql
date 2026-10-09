-- Dashboard counts only committed, accessible, active questions, not revisions.
create or replace function public.bank_dashboard(s uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege; end if;
 return (
  with visible as (
   select distinct on (c.question_id) c.question_id,c.metadata,r.visibility,q.created_at as registered_at
   from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id
   join public.bank_questions q on q.id=c.question_id
   where c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id)
   order by c.question_id,c.created_at desc,c.revision_id desc
  )
  select jsonb_build_object('questions',count(*),
   'schools',count(distinct case when nullif(trim(metadata#>>'{source,school}'),'') is not null
    then coalesce(nullif(metadata#>>'{source,schoolId}',''),concat_ws('|',metadata#>>'{source,region}',trim(metadata#>>'{source,school}'))) end),
   'reviewed',count(*) filter(where visibility='approved'),
   'recent',count(*) filter(where registered_at>=now()-interval '7 days'),
   'asOf',now()) from visible
 );
end $$;
revoke execute on function public.bank_dashboard(uuid) from public,anon;
grant execute on function public.bank_dashboard(uuid) to authenticated;
