-- Avoid per-candidate membership checks without changing visibility or selection.
begin;
set local lock_timeout='5s';
CREATE OR REPLACE FUNCTION bank_ops.bank_mock_recommendation_snapshot(s uuid, exclude_exams uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare candidates jsonb; excluded jsonb; refs jsonb;
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if exists(select 1 from unnest(exclude_exams) x where not exists(select 1 from public.bank_mock_exams e where e.id=x and e.space_id=s and e.owner_id=auth.uid())) then raise insufficient_privilege;end if;
 select coalesce(jsonb_agg(distinct i->>'questionId'),'[]') into excluded from public.bank_mock_exams e cross join lateral jsonb_array_elements(e.document->'variants') v cross join lateral jsonb_array_elements(coalesce(nullif(v#>'{paper,items}','null'::jsonb),'[]')) i where e.id=any(exclude_exams) and e.space_id=s and e.owner_id=auth.uid();
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'title',title)),'[]') into refs from public.bank_mock_exams where id=any(exclude_exams) and space_id=s and owner_id=auth.uid();
 with eligible as materialized (
  -- Membership is checked once above. For committed, unarchived questions,
  -- these are exactly bank_read_revision's remaining visibility conditions.
  select c.*,r.review_version
  from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id
  join public.bank_questions q on q.id=c.question_id
  where c.space_id=s and q.space_id=s and r.committed and not q.archived
    and (r.actor_id=auth.uid() or r.visibility in ('shared_pending','approved'))
 ), latest as materialized (
  select * from (select distinct on(question_id) * from eligible
   order by question_id,created_at desc,revision_id desc) c
  where bank_grade.matches(c.metadata#>>'{source,grade}')
 ), heads as materialized (
  select h.question_id,count(*)>1 revision_conflict
  from public.bank_revisions h
  where h.committed and exists(select 1 from latest c where c.question_id=h.question_id)
    and (h.actor_id=auth.uid() or h.visibility in ('shared_pending','approved'))
    and not exists(select 1 from public.bank_revisions child where child.parent_id=h.id and child.committed)
  group by h.question_id
 ), candidate_rows as (
  select c.*,coalesce(h.revision_conflict,false) revision_conflict from latest c
  left join heads h on h.question_id=c.question_id
 ) select coalesce(jsonb_agg(to_jsonb(c) order by c.question_id),'[]') into candidates from candidate_rows c
 where not (excluded ? c.question_id::text);
 return jsonb_build_object('id',gen_random_uuid(),'at',statement_timestamp(),'candidates',candidates,'excludeIds',excluded,'exclusions',refs);
end $function$
;
CREATE OR REPLACE FUNCTION bank_ops.bank_mock_snapshot(s uuid, schools jsonb, exclude_exams uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare candidates jsonb; excluded jsonb; refs jsonb;
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if jsonb_typeof(schools) is distinct from 'array' or jsonb_array_length(schools)=0 then raise exception '출처 학교를 선택하세요.' using errcode='22023';end if;
 if exists(select 1 from unnest(exclude_exams) x where not exists(select 1 from public.bank_mock_exams e where e.id=x and e.space_id=s and e.owner_id=auth.uid())) then raise insufficient_privilege;end if;
 select coalesce(jsonb_agg(distinct i->>'questionId'),'[]') into excluded from public.bank_mock_exams e cross join lateral jsonb_array_elements(e.document->'variants') v cross join lateral jsonb_array_elements(coalesce(nullif(v#>'{paper,items}','null'::jsonb),'[]')) i where e.id=any(exclude_exams) and e.space_id=s and e.owner_id=auth.uid();
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'title',title)),'[]') into refs from public.bank_mock_exams where id=any(exclude_exams) and space_id=s and owner_id=auth.uid();
 with eligible as materialized (
  -- Membership is checked once above. For committed, unarchived questions,
  -- these are exactly bank_read_revision's remaining visibility conditions.
  select c.*,r.review_version
  from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id
  join public.bank_questions q on q.id=c.question_id
  where c.space_id=s and q.space_id=s and r.committed and not q.archived
    and (r.actor_id=auth.uid() or r.visibility in ('shared_pending','approved'))
 ), latest as materialized (
  select * from (select distinct on(question_id) * from eligible
   order by question_id,created_at desc,revision_id desc) c
  where bank_grade.matches(c.metadata#>>'{source,grade}')
 ), heads as materialized (
  select h.question_id,count(*)>1 revision_conflict
  from public.bank_revisions h
  where h.committed and exists(select 1 from latest c where c.question_id=h.question_id)
    and (h.actor_id=auth.uid() or h.visibility in ('shared_pending','approved'))
    and not exists(select 1 from public.bank_revisions child where child.parent_id=h.id and child.committed)
  group by h.question_id
 ), candidate_rows as (
  select c.*,coalesce(h.revision_conflict,false) revision_conflict from latest c
  left join heads h on h.question_id=c.question_id
 ) select coalesce(jsonb_agg(to_jsonb(c) order by c.question_id),'[]') into candidates from candidate_rows c
 where schools ? (c.metadata#>>'{source,school}') and c.metadata#>>'{source,kind}'='학교기출' and coalesce(c.metadata#>>'{relations,originalQuestionId}','')='';
 return jsonb_build_object('id',gen_random_uuid(),'at',statement_timestamp(),'candidates',candidates,'excludeIds',excluded,'exclusions',refs);
end $function$
;
commit;
