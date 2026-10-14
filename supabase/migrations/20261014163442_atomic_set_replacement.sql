-- Dedicated atomic-set candidate path. Single-question recommendation policy is unchanged.
create function public.bank_set_replacement_candidates(s uuid,current_revision uuid,rules jsonb,selected uuid[],stage text default 'preferred_school',page integer default 0,expected_version text default null,candidate uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare registry jsonb; target_set jsonb; catalog public.bank_catalog[]; target public.bank_catalog;
 school_keys text[]:='{}'; matches text[]; school text; used jsonb:='[]'; excluded uuid[]; size integer; take integer;
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if stage not in('preferred_school','other_schools') or page<0 or page>100000 or jsonb_typeof(rules) is distinct from 'object' or coalesce(cardinality(selected),0)>2000 then raise exception '조회 조건을 확인하세요';end if;
 registry=public.bank_question_sets_get(s);
 select g into target_set from jsonb_array_elements(registry) g where g->>'complete'='true' and exists(select 1 from jsonb_array_elements(g->'members') m where m->>'revisionId'=current_revision::text);
 if target_set is null then raise exception '완전한 세트의 현재 문항을 선택하세요' using errcode='PT409';end if;
 size=jsonb_array_length(target_set->'members');take=greatest(1,20/size);
 select array_agg(c) into catalog from bank_query.latest(s) c;
 select * into target from unnest(catalog) c where c.revision_id=current_revision;
 if not found then raise insufficient_privilege;end if;
 for school in select jsonb_array_elements_text(coalesce(rules->'schools','[]')) loop
  select array_agg(distinct bank_query.school_key(c.metadata)) into matches from unnest(catalog) c where bank_query.school_key(c.metadata)=school or c.metadata#>>'{source,school}'=school;
  if cardinality(matches)>1 then raise exception '동명이교를 구분할 수 없습니다: %',school;end if;school_keys=school_keys||coalesce(matches,'{}');
 end loop;
 if rules ? 'mockExamId' then used=public.bank_mock_usage(s,(rules->>'mockExamId')::uuid);end if;
 select array_agg(distinct bank_ops.original_id(s,q)) into excluded from unnest(coalesce(selected,'{}')||array(select (m->>'questionId')::uuid from jsonb_array_elements(target_set->'members') m)||array(select v::uuid from jsonb_array_elements_text(coalesce(rules->'excludeIds','[]')) v)) q;
 return(with grouped as materialized(
  select g,details.items,details.count,details.allowed,details.score,details.source_year
  from jsonb_array_elements(registry) g cross join lateral(
   select count(*) count,bool_and(
    c.metadata#>>'{source,grade}' is not distinct from t.metadata#>>'{source,grade}'
    and bank_query.response_format(c.metadata)=bank_query.response_format(t.metadata)
    and not exists(select 1 from unnest(array['subject','curriculumId']) k where coalesce(c.metadata#>>array['source',k],'')<>'' and coalesce(t.metadata#>>array['source',k],'')<>'' and c.metadata#>>array['source',k]<>t.metadata#>>array['source',k])
    and bank_query.scope_fit(c.metadata,c.confirmed,rules)
    and not exists(select 1 from jsonb_array_elements(coalesce(rules->'targetScopes','[]')) scope where not bank_query.scope_fit(c.metadata,c.confirmed,scope))
    and (coalesce(rules->>'originalsOnly','false')<>'true' or (c.metadata#>>'{source,kind}'='학교기출' and coalesce(c.metadata#>>'{relations,originalQuestionId}','')=''))
    and case when stage='preferred_school' then bank_query.school_key(c.metadata)=any(school_keys)
     else not(bank_query.school_key(c.metadata)=any(school_keys)) and bank_query.unit_id(c.metadata,c.confirmed)=bank_query.unit_id(t.metadata,t.confirmed)
      and (coalesce(c.metadata#>>'{source,semester}','')='' or coalesce(t.metadata#>>'{source,semester}','')='' or c.metadata#>>'{source,semester}'=t.metadata#>>'{source,semester}') end
    and not(bank_ops.original_id(s,c.question_id)=any(coalesce(excluded,'{}')))
    and not exists(select 1 from jsonb_array_elements(used) u where u->>'originalId'=bank_ops.original_id(s,c.question_id)::text)
   ) allowed,
   avg((bank_summary.row_difficulty(c.revision_id,c.metadata,c.confirmed)->>'score')::numeric) score,
   max(c.metadata#>>'{source,academicYear}') source_year,
   jsonb_agg(bank_query.compact(c)||jsonb_build_object('questionSet',g,'originalId',bank_ops.original_id(s,c.question_id),'schoolKey',bank_query.school_key(c.metadata)) order by a.ord) items
   from jsonb_array_elements(g->'members') with ordinality a(m,ord)
   join unnest(catalog) c on c.revision_id=(m->>'revisionId')::uuid
   join unnest(catalog) t on t.revision_id=(target_set->'members'->(a.ord::integer-1)->>'revisionId')::uuid
  ) details where g->>'complete'='true' and g->>'id'<>target_set->>'id' and jsonb_array_length(g->'members')=size
 ), ranked as materialized(
  select *,row_number() over(order by case when stage='other_schools' then score end desc nulls last,source_year desc nulls last,g->>'source_document',g->>'id') pos from grouped where count=size and allowed
 ), counts as(select count(*) total,md5(coalesce(string_agg(items::text,',' order by pos),'')) version from ranked), shown as(
  select * from ranked where candidate is null or items->0->>'question_id'=candidate::text order by pos limit case when candidate is not null then 1 when stage='other_schools' then take else null end offset case when candidate is null and stage='other_schools' then page*take else 0 end
 ) select jsonb_build_object('stage',stage,'total',total,'page',page,'pageSize',take,'memberCount',size,'hasMore',stage='other_schools' and (page+1)*take<total,'version',version,'changed',expected_version is not null and expected_version<>version,'needsSchool',stage='preferred_school' and cardinality(school_keys)=0,'items',case when expected_version is not null and expected_version<>version then '[]'::jsonb else (select coalesce(jsonb_agg((items->0)||jsonb_build_object('setCandidates',items) order by pos),'[]') from shown) end) from counts);
end $$;
revoke all on function public.bank_set_replacement_candidates(uuid,uuid,jsonb,uuid[],text,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.bank_set_replacement_candidates(uuid,uuid,jsonb,uuid[],text,integer,text,uuid) to authenticated;
