-- Readable whole-bank candidates and exclusions from one statement snapshot.
create function public.bank_mock_recommendation_snapshot(s uuid,exclude_exams uuid[] default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare candidates jsonb; excluded jsonb; refs jsonb;
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if exists(select 1 from unnest(exclude_exams) x where not exists(select 1 from public.bank_mock_exams e where e.id=x and e.space_id=s and e.owner_id=auth.uid())) then raise insufficient_privilege;end if;
 select coalesce(jsonb_agg(distinct i->>'questionId'),'[]') into excluded from public.bank_mock_exams e cross join lateral jsonb_array_elements(e.document->'variants') v cross join lateral jsonb_array_elements(coalesce(nullif(v#>'{paper,items}','null'::jsonb),'[]')) i where e.id=any(exclude_exams) and e.space_id=s and e.owner_id=auth.uid();
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'title',title)),'[]') into refs from public.bank_mock_exams where id=any(exclude_exams) and space_id=s and owner_id=auth.uid();
 with latest as (
  select distinct on(c.question_id) c.*,r.review_version,
   (select count(*)>1 from public.bank_revisions h where h.question_id=c.question_id and h.committed and public.bank_read_revision(h.id) and not exists(select 1 from public.bank_revisions child where child.parent_id=h.id and child.committed)) revision_conflict
  from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id
  where c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id)
  order by c.question_id,c.created_at desc,c.revision_id desc
 ) select coalesce(jsonb_agg(to_jsonb(c) order by c.question_id),'[]') into candidates from latest c
 where not (excluded ? c.question_id::text);
 return jsonb_build_object('id',gen_random_uuid(),'at',statement_timestamp(),'candidates',candidates,'excludeIds',excluded,'exclusions',refs);
end $$;
revoke all on function public.bank_mock_recommendation_snapshot(uuid,uuid[]) from public,anon;
grant execute on function public.bank_mock_recommendation_snapshot(uuid,uuid[]) to authenticated;
