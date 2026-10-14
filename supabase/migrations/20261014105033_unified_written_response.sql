-- Read-time compatibility: preserve original question/document data and history.
create or replace function bank_query.response_format(m jsonb) returns text
language sql immutable set search_path='' as $$
 select case when nullif(btrim(m#>>'{content,responseType}'),'') is null then m#>>'{content,responseType}'
 when btrim(m#>>'{content,responseType}') ~ '^(객관식|객관형|선택형|선택식|객관식[ (].*|선택형[ (].*|single_choice|multiple_choice)$' then '선택형'
 else '서술형' end;
$$;
revoke all on function bank_query.response_format(jsonb) from public,anon,authenticated;

begin;
set local lock_timeout='5s';
-- Resolve the authorized catalog once per request, including multi-school selections.
create or replace function public.bank_replacement_candidates(s uuid,current_revision uuid,rules jsonb,selected uuid[],stage text default 'preferred_school',page integer default 0,expected_version text default null,candidate uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare catalog public.bank_catalog[]; target public.bank_catalog; tu text; school_keys text[]:='{}'; matches text[]; school text; used jsonb:='[]'; excluded uuid[]; result jsonb; conflicts jsonb; supplement boolean:=current_revision is null and rules->>'purpose'='supplement';
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if stage not in('preferred_school','other_schools') or page<0 or page>100000 or jsonb_typeof(rules) is distinct from 'object' or coalesce(cardinality(selected),0)>2000 then raise exception '조회 조건을 확인하세요.';end if;
 select array_agg(c) into catalog from bank_query.latest(s) c;
 if supplement then
  if nullif(rules->>'grade','') is null or jsonb_array_length(coalesce(rules->'units','[]'))=0 then raise exception '학년과 시험범위를 선택하세요.';end if;
  target.metadata=jsonb_build_object('source',jsonb_build_object('grade',rules->>'grade','subject',rules->>'subject','curriculumId',rules->>'curriculumId'));
  tu=nullif(rules->>'unitId','');
  if stage='other_schools' and (tu is null or not(coalesce(rules->'units','[]') ? tu)) then raise exception '설정한 범위에서 보충할 세부 단원을 선택하세요.';end if;
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
 if stage='other_schools' and tu is null then raise exception '원래 문항의 세부 단원이 확인되지 않아 타학교 범위를 확대할 수 없습니다.';end if;
 return (with school_rows as materialized(
  select c from unnest(catalog) c
  where case when stage='preferred_school' then bank_query.school_key(c.metadata)=any(school_keys)
   else not(bank_query.school_key(c.metadata)=any(school_keys)) and bank_query.unit_id(c.metadata,c.confirmed)=tu end
 ), eligible as materialized(
  select c,bank_ops.original_id(s,(c).question_id) original_id from school_rows
  where (c).metadata#>>'{source,grade}' is not distinct from target.metadata#>>'{source,grade}'
  and (stage='preferred_school' or coalesce((c).metadata#>>'{source,semester}','')='' or coalesce(target.metadata#>>'{source,semester}','')='' or (c).metadata#>>'{source,semester}'=target.metadata#>>'{source,semester}')
  and not exists(select 1 from unnest(array['subject','curriculumId']) k where coalesce((c).metadata#>>array['source',k],'')<>'' and coalesce(target.metadata#>>array['source',k],'')<>'' and (c).metadata#>>array['source',k]<>target.metadata#>>array['source',k])
  and bank_query.scope_fit((c).metadata,(c).confirmed,rules)
  and not exists(select 1 from jsonb_array_elements(coalesce(rules->'targetScopes','[]')) scope where not bank_query.scope_fit((c).metadata,(c).confirmed,scope))
  and (supplement or not(rules ? 'mockExamId') or bank_query.response_format((c).metadata)=bank_query.response_format(target.metadata))
  and (coalesce(rules->>'originalsOnly','false')<>'true' or ((c).metadata#>>'{source,kind}'='학교기출' and coalesce((c).metadata#>>'{relations,originalQuestionId}','')=''))
  and not exists(select 1 from public.bank_question_sets qs where qs.space_id=s and qs.source_document=(c).metadata#>>'{source,documentId}' and ((c).metadata#>>'{source,originalNumber}')=any(qs.original_numbers))
  and (select count(*) from public.bank_revisions h where h.question_id=(c).question_id and h.committed and public.bank_read_revision(h.id) and not exists(select 1 from public.bank_revisions child where child.parent_id=h.id and child.committed))=1
 ), available as materialized(
  select c,original_id,case when stage='other_schools' then (bank_summary.row_difficulty((c).revision_id,(c).metadata,(c).confirmed)->>'score')::numeric end score
  from eligible where not(original_id=any(coalesce(excluded,'{}'))) and not exists(select 1 from jsonb_array_elements(used) u where u->>'originalId'=original_id::text)
 ), ranked as materialized(
  select *,row_number() over(order by score desc nulls last,(c).metadata#>>'{source,academicYear}' desc nulls last,(c).metadata#>>'{source,semester}',(c).metadata#>>'{source,exam}',(c).metadata#>>'{source,documentId}',case when (c).metadata#>>'{source,originalNumber}' ~ '^[0-9]+$' then ((c).metadata#>>'{source,originalNumber}')::numeric end nulls last,(c).question_id) pos from available
 ), counts as(
  select count(*) total,md5(coalesce(string_agg((c).question_id::text||':'||(c).revision_id::text||':'||md5(coalesce((c).metadata::text,'')||coalesce((c).confirmed::text,'')),',' order by pos),'')) version from ranked
 ), shown as(
  select * from ranked where (candidate is null or (c).question_id=candidate) order by pos
  limit case when candidate is not null then 1 when stage='other_schools' then 20 else null end
  offset case when candidate is null and stage='other_schools' then page*20 else 0 end
 ) select jsonb_build_object('stage',stage,'schoolKeys',school_keys,'total',total,'page',page,'pageSize',case when stage='other_schools' then 20 else null end,'hasMore',stage='other_schools' and (page+1)*20<total,'version',version,'changed',expected_version is not null and expected_version<>version,
 'items',case when expected_version is not null and expected_version<>version then '[]'::jsonb else (select coalesce(jsonb_agg(bank_query.compact(c)||jsonb_build_object('originalId',original_id,'schoolKey',bank_query.school_key((c).metadata),'otherSchool',stage='other_schools') order by pos),'[]') from shown) end) from counts);
end $$;
revoke all on function public.bank_replacement_candidates(uuid,uuid,jsonb,uuid[],text,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.bank_replacement_candidates(uuid,uuid,jsonb,uuid[],text,integer,text,uuid) to authenticated;
commit;
