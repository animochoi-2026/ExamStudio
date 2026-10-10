-- Read-only school directory. Existing source RPCs and summary caches are unchanged.
-- registered_at is bank_questions.created_at, captured by bank_summary.fact;
-- it is not the latest revision/review date or the exam's academic year.
create function public.bank_school_sources(s uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform bank_summary.assert_ready(s);
 return (with visible as (
  select p.fact from bank_summary.originals p
  where p.space_id=s and p.audience='00000000-0000-0000-0000-000000000000'
   and not exists(select 1 from bank_summary.originals a where a.space_id=s and a.question_id=p.question_id and a.audience=auth.uid())
  union all
  select a.fact from bank_summary.originals a where a.space_id=s and a.audience=auth.uid()
 ), registered as (
  select fact->>'source_id' source_id,max((fact->>'registered_at')::timestamptz) last_registered_at
  from visible group by fact->>'source_id'
 ) select coalesce(jsonb_agg(bank_summary.source_value(s,e.value)||jsonb_build_object('last_registered_at',r.last_registered_at)
    order by e.updated_at desc,e.source_id),'[]'::jsonb)
 from bank_summary.effective_sources(s,auth.uid()) e left join registered r on r.source_id=e.source_id
 where (e.value->>'question_count')::integer>0);
end $$;
revoke all on function public.bank_school_sources(uuid) from public,anon;
grant execute on function public.bank_school_sources(uuid) to authenticated;
