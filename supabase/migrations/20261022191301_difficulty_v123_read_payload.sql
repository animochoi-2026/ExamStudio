create function bank_v123.read_catalog(c public.bank_catalog) returns public.bank_catalog language plpgsql immutable set search_path='' as $$
declare v jsonb:=nullif(c.metadata#>'{difficulty,v123Active}','null');small jsonb;
begin
 if v is null then return c;end if;
 small:=v||jsonb_build_object('computed',jsonb_build_object('base_tier',v#>'{computed,base_tier}','problem_tier',v#>'{computed,problem_tier}','final_tier',v#>'{computed,final_tier}','promotions',v#>'{computed,promotions}','score',v#>'{computed,score}','reason',v#>'{computed,reason}','status',v#>'{computed,status}'));
 c.metadata:=jsonb_set(c.metadata,'{difficulty,v123Active}',small,false);
 return c;
end $$;
revoke all on function bank_v123.read_catalog(public.bank_catalog) from public;
grant execute on function bank_v123.read_catalog(public.bank_catalog) to anon,authenticated,service_role;
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
  select z.*,r.review_version
  from public.bank_catalog c cross join lateral (select (lean).* from (select bank_v123.read_catalog(c) lean offset 0) one) z join public.bank_revisions r on r.id=c.revision_id
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
  select z.*,r.review_version
  from public.bank_catalog c cross join lateral (select (lean).* from (select bank_v123.read_catalog(c) lean offset 0) one) z join public.bank_revisions r on r.id=c.revision_id
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
CREATE OR REPLACE FUNCTION public.bank_replacement_candidates(s uuid, current_revision uuid, rules jsonb, selected uuid[], stage text DEFAULT 'preferred_school'::text, page integer DEFAULT 0, expected_version text DEFAULT NULL::text, candidate uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare catalog public.bank_catalog[]; target public.bank_catalog; tu text; school_keys text[]:='{}'; matches text[]; school text; used jsonb:='[]'; excluded uuid[]; result jsonb; conflicts jsonb; supplement boolean:=current_revision is null and rules->>'purpose'='supplement';
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if stage not in('preferred_school','other_schools') or page<0 or page>100000 or jsonb_typeof(rules) is distinct from 'object' or coalesce(cardinality(selected),0)>2000 then raise exception '조회 조건을 확인하세요.';end if;
 select array_agg(bank_v123.read_catalog(c)) into catalog from bank_query.latest(s) c;
 if supplement then
  if nullif(rules->>'grade','') is null or jsonb_array_length(coalesce(rules->'units','[]'))=0 then raise exception '학년과 시험범위를 선택하세요.';end if;
  target.metadata=jsonb_build_object('source',jsonb_build_object('grade',rules->>'grade','subject',rules->>'subject','curriculumId',rules->>'curriculumId'));
  tu=nullif(rules->>'unitId','');
  if rules ? 'supplementBands' and (jsonb_typeof(rules->'supplementBands')<>'array' or jsonb_array_length(rules->'supplementBands')=0 or exists(select 1 from jsonb_array_elements_text(rules->'supplementBands') b where b not in('low','middle','high'))) then raise exception '하·중·상 난이도를 하나 이상 선택하세요.';end if;
  if rules ? 'otherSchoolKeys' and jsonb_typeof(rules->'otherSchoolKeys')<>'array' then raise exception '학교 필터를 확인하세요.';end if;
 else
 select * into target from unnest(catalog) c where revision_id=current_revision;
 if not found then raise exception '교체 대상이 변경되었거나 접근할 수 없습니다. 목록을 다시 여세요.' using errcode='PT409';end if;
 if exists(select 1 from public.bank_question_sets qs where qs.space_id=s and qs.source_document=target.metadata#>>'{source,documentId}' and (target.metadata#>>'{source,originalNumber}')=any(qs.original_numbers)) then raise exception '세트 문항은 개별 교체할 수 없습니다.';end if;
 tu=bank_query.unit_id(target.metadata,target.confirmed);
 end if;
 -- Legacy settings store names. Resolve them once to unambiguous source identities.
 -- Never group candidate rows by a display name alone.
 for school in select jsonb_array_elements_text(coalesce(rules->'schools','[]')) loop
  select array_agg(distinct bank_query.school_key(c.metadata)) into matches from unnest(catalog) c
  where bank_query.school_key(c.metadata)=school or c.metadata#>>'{source,school}'=school;
  if cardinality(matches)>1 then raise exception '동명이교를 구분할 수 없습니다. 학교 지역 또는 학교 ID를 확인하세요: %',school;end if;
  school_keys=school_keys||coalesce(matches,'{}');
 end loop;
 if rules ? 'mockExamId' then
  used=public.bank_mock_usage(s,(rules->>'mockExamId')::uuid);
  if candidate is not null then
   conflicts=public.bank_mock_check(s,(rules->>'mockExamId')::uuid,array[candidate]);
   if jsonb_array_length(conflicts)>0 then raise exception '다른 실전모의고사 회차에서 이미 사용된 문제입니다. 다른 문제를 선택하세요: %',(select string_agg(u->>'title',', ') from jsonb_array_elements(conflicts) u) using errcode='PT409',detail=conflicts::text;end if;
  end if;
 end if;
 select array_agg(distinct bank_ops.original_id(s,q)) into excluded from unnest(coalesce(selected,'{}')||array[target.question_id]||array(select v::uuid from jsonb_array_elements_text(coalesce(rules->'excludeIds','[]')) v)) q where q is not null;
 if stage='preferred_school' and cardinality(school_keys)=0 then
  return jsonb_build_object('items','[]'::jsonb,'total',0,'needsSchool',true,'hasMore',false,'stage',stage,'schoolKeys',school_keys);
 end if;
 if not supplement and stage='other_schools' and tu is null then raise exception '원래 문항의 세부 단원이 확인되지 않아 타학교 범위를 확대할 수 없습니다.';end if;
 return (with school_rows as materialized(
  select c from unnest(catalog) c
  where case when stage='preferred_school' then bank_query.school_key(c.metadata)=any(school_keys)
   else not(bank_query.school_key(c.metadata)=any(school_keys)) and (supplement or bank_query.unit_id(c.metadata,c.confirmed)=tu)
    and (not supplement or jsonb_array_length(coalesce(rules->'otherSchoolKeys','[]'))=0 or rules->'otherSchoolKeys' ? bank_query.school_key(c.metadata)) end
 ), eligible as materialized(
  select c,bank_ops.original_id(s,(c).question_id) original_id from school_rows
  where (c).metadata#>>'{source,grade}' is not distinct from target.metadata#>>'{source,grade}'
  and (stage='preferred_school' or coalesce((c).metadata#>>'{source,semester}','')='' or coalesce(target.metadata#>>'{source,semester}','')='' or (c).metadata#>>'{source,semester}'=target.metadata#>>'{source,semester}')
  and not exists(select 1 from unnest(array['subject','curriculumId']) k where coalesce((c).metadata#>>array['source',k],'')<>'' and coalesce(target.metadata#>>array['source',k],'')<>'' and (c).metadata#>>array['source',k]<>target.metadata#>>array['source',k])
  and bank_query.scope_fit((c).metadata,(c).confirmed,rules)
  and not exists(select 1 from jsonb_array_elements(coalesce(rules->'targetScopes','[]')) scope where not bank_query.scope_fit((c).metadata,(c).confirmed,scope))
  and (supplement or bank_query.response_format((c).metadata)=bank_query.response_format(target.metadata))
  and (coalesce(rules->>'originalsOnly','false')<>'true' or ((c).metadata#>>'{source,kind}'='학교기출' and coalesce((c).metadata#>>'{relations,originalQuestionId}','')=''))
  and not exists(select 1 from public.bank_question_sets qs where qs.space_id=s and qs.source_document=(c).metadata#>>'{source,documentId}' and ((c).metadata#>>'{source,originalNumber}')=any(qs.original_numbers))
  and (select count(*) from public.bank_revisions h where h.question_id=(c).question_id and h.committed and public.bank_read_revision(h.id) and not exists(select 1 from public.bank_revisions child where child.parent_id=h.id and child.committed))=1
 ), available as materialized(
  select c,original_id,(bank_summary.row_difficulty((c).revision_id,(c).metadata,(c).confirmed)->>'score')::numeric difficulty_score
  from eligible where not(original_id=any(coalesce(excluded,'{}'))) and not exists(select 1 from jsonb_array_elements(used) u where u->>'originalId'=original_id::text)
 ), filtered as materialized(
  select *,case when stage='other_schools' then difficulty_score end score from available
  where not supplement or not(rules ? 'supplementBands') or rules->'supplementBands' ? (case when bank_v123.display_band(bank_summary.row_difficulty((c).revision_id,(c).metadata,(c).confirmed))='killer' then 'high' else bank_v123.display_band(bank_summary.row_difficulty((c).revision_id,(c).metadata,(c).confirmed)) end)
 ), ranked as materialized(
  select *,row_number() over(order by score desc nulls last,(c).metadata#>>'{source,academicYear}' desc nulls last,(c).metadata#>>'{source,semester}',(c).metadata#>>'{source,exam}',(c).metadata#>>'{source,documentId}',case when (c).metadata#>>'{source,originalNumber}' ~ '^[0-9]+$' then ((c).metadata#>>'{source,originalNumber}')::numeric end nulls last,(c).question_id) pos from filtered
 ), counts as(
  select count(*) total,md5(coalesce(string_agg((c).question_id::text||':'||(c).revision_id::text||':'||md5(coalesce((c).metadata::text,'')||coalesce((c).confirmed::text,'')),',' order by pos),'')) version from ranked
 ), shown as(
  select * from ranked where (candidate is null or (c).question_id=candidate) order by pos
  limit case when candidate is not null then 1 when stage='other_schools' then 20 else null end
  offset case when candidate is null and stage='other_schools' then page*20 else 0 end
 ) select jsonb_build_object('stage',stage,'schoolKeys',school_keys,'total',total,'page',page,'pageSize',case when stage='other_schools' then 20 else null end,'hasMore',stage='other_schools' and (page+1)*20<total,'version',version,'changed',expected_version is not null and expected_version<>version,
 'filterSchools',case when supplement and stage='preferred_school' then (select coalesce(jsonb_agg(jsonb_build_object('key',k,'name',name) order by name,k),'[]') from (select distinct bank_query.school_key(c.metadata) k,c.metadata#>>'{source,school}' name from unnest(catalog) c where c.metadata#>>'{source,grade}'=rules->>'grade' and bank_query.scope_fit(c.metadata,c.confirmed,rules) and not(bank_query.school_key(c.metadata)=any(school_keys))) schools) else '[]'::jsonb end,
 'items',case when expected_version is not null and expected_version<>version then '[]'::jsonb else (select coalesce(jsonb_agg(bank_query.compact(c)||jsonb_build_object('originalId',original_id,'schoolKey',bank_query.school_key((c).metadata),'otherSchool',stage='other_schools') order by pos),'[]') from shown) end) from counts);
end $function$
;
