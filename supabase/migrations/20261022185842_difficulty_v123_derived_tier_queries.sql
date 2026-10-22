-- Read-only display projection; frozen values never recalculated.
create function bank_v123.display_band(v jsonb) returns text language sql immutable set search_path='' as $$ select case when v->>'displayMappingVersion'='tier-display-v123-1' then v->>'compositionBand' when v->>'score' is null then 'unknown' when (v->>'score')::numeric<=3 then 'low' when (v->>'score')::numeric<8 then 'middle' when (v->>'score')::numeric<9 then 'high' else 'killer' end $$;
revoke all on function bank_v123.display_band(jsonb) from public;
grant execute on function bank_v123.display_band(jsonb) to anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.bank_search_page(s uuid, filters jsonb DEFAULT '{}'::jsonb, start_at integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if start_at<0 or start_at>100000 then raise exception '페이지를 확인하세요.';end if;
 return (with current_rows as materialized(select c.*,r.visibility,q.owner_email,bank_summary.row_difficulty(c.revision_id,c.metadata,c.confirmed) d from bank_query.latest(s) c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id),
 filtered as materialized(select c from current_rows c where
 (coalesce(filters->>'compositionBand','')='' or (filters->>'compositionBand'='killer' and bank_v123.display_band(d)='killer') or (filters->>'compositionBand'<>'killer' and (case when bank_v123.display_band(d)='killer' then 'high' else bank_v123.display_band(d) end)=filters->>'compositionBand'))
 and(coalesce(filters->>'text','')='' or (metadata::text||content::text||confirmed::text) ilike '%'||(filters->>'text')||'%')
 and(coalesce(filters->>'school','')='' or metadata#>>'{source,school}'=filters->>'school')
 and(coalesce(filters->>'academicYear','')='' or metadata#>>'{source,academicYear}'=filters->>'academicYear')
 and(coalesce(filters->>'grade','')='' or metadata#>>'{source,grade}'=filters->>'grade')
 and(coalesce(filters->>'semester','')='' or metadata#>>'{source,semester}'=filters->>'semester')
 and(coalesce(filters->>'unit','')='' or exists(select 1 from bank_query.units u where u.id=bank_query.unit_id(metadata,confirmed) and (u.title=filters->>'unit' or u.id=filters->>'unit')))
 and public.bank_type_matches(metadata,confirmed,filters->>'type')
 and(coalesce(filters->>'owner','')='' or owner_email=filters->>'owner')
 and(coalesce(filters->>'status','')='' or visibility=filters->>'status')),
 page_rows as(select c from filtered order by (c).created_at desc,(c).revision_id desc limit 50 offset start_at)
 select jsonb_build_object('total',(select count(*) from filtered),'items',(select coalesce(jsonb_agg(bank_query.compact(b) order by (p.c).created_at desc,(p.c).revision_id desc),'[]') from page_rows p join public.bank_catalog b on b.revision_id=(p.c).revision_id)));
end $function$
;
CREATE OR REPLACE FUNCTION public.bank_question_page(s uuid, filters jsonb DEFAULT '{}'::jsonb, start_at integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if start_at<0 or start_at>100000 then raise exception '페이지를 확인하세요.';end if;
 return (with current_rows as materialized(select c.*,r.visibility,q.owner_email,bank_summary.row_difficulty(c.revision_id,c.metadata,c.confirmed) d from bank_query.latest(s) c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id),
 filtered as materialized(select c from current_rows c where
 (coalesce(filters->>'compositionBand','')='' or (filters->>'compositionBand'='killer' and bank_v123.display_band(d)='killer') or (filters->>'compositionBand'<>'killer' and (case when bank_v123.display_band(d)='killer' then 'high' else bank_v123.display_band(d) end)=filters->>'compositionBand'))
 and(coalesce(filters->>'text','')='' or (metadata::text||content::text||confirmed::text) ilike '%'||(filters->>'text')||'%')
 and(coalesce(filters->>'school','')='' or metadata#>>'{source,school}'=filters->>'school')
 and(coalesce(filters->>'academicYear','')='' or metadata#>>'{source,academicYear}'=filters->>'academicYear')
 and(coalesce(filters->>'grade','')='' or metadata#>>'{source,grade}'=filters->>'grade')
 and(coalesce(filters->>'semester','')='' or metadata#>>'{source,semester}'=filters->>'semester')
 and(coalesce(filters->>'unit','')='' or exists(select 1 from bank_query.units u where u.id=bank_query.unit_id(metadata,confirmed) and (u.title=filters->>'unit' or u.id=filters->>'unit')))
 and public.bank_type_matches(metadata,confirmed,filters->>'type')
 and(coalesce(filters->>'owner','')='' or owner_email=filters->>'owner')
 and(coalesce(filters->>'status','')='' or visibility=filters->>'status')),
 page_rows as(select c from filtered order by (c).created_at desc,(c).revision_id desc limit 20 offset start_at)
 select jsonb_build_object('total',(select count(*) from filtered),'items',(select coalesce(jsonb_agg(bank_query.compact(b) order by (p.c).created_at desc,(p.c).revision_id desc),'[]') from page_rows p join public.bank_catalog b on b.revision_id=(p.c).revision_id)));
end $function$
;
CREATE OR REPLACE FUNCTION bank_grade.home(s uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with latest as materialized(select c.*,r.visibility,bank_v123.display_band(bank_summary.row_difficulty(c.revision_id,c.metadata,c.confirmed)) display_band
 from bank_query.latest(s) c join public.bank_revisions r on r.id=c.revision_id),
 sources as materialized(select * from bank_summary.effective_sources(s,auth.uid()) where bank_grade.matches(value#>>'{source,grade}') and (value->>'question_count')::int>0),
 totals as(select count(*) questions,count(*) filter(where visibility='approved') reviewed,count(*) filter(where visibility<>'approved') pending,
 count(*) filter(where display_band='low') low,count(*) filter(where display_band='middle') middle,count(*) filter(where display_band in('high','killer')) high,
 count(*) filter(where display_band='unknown') unknown,count(*) filter(where display_band='killer') killer from latest)
 select jsonb_build_object('dashboard',jsonb_build_object('summaryVersion','stored-web-v1','asOf',now(),'questions',questions,'reviewed',reviewed,'pending',pending,
 'schools',(select count(distinct value#>>'{source,school}') from sources),'sourceExams',(select count(*) from sources),
 'difficulty',jsonb_build_object('total',questions,'counts',jsonb_build_object('low',low,'middle',middle,'high',high,'unknown',unknown,'deferred',0),'killerCount',killer,'labelDisagreements',0)),
 'recentSchools',(select coalesce(jsonb_agg(school order by updated desc),'[]') from (select value#>>'{source,school}' school,max(updated_at) updated from sources group by 1 order by 2 desc limit 12) x),
 'recentSources',(select coalesce(jsonb_agg(value order by updated_at desc,source_id),'[]') from (select * from sources order by updated_at desc,source_id limit 6) x))
 from totals;
$function$
;
CREATE OR REPLACE FUNCTION bank_summary.composition(s uuid, u uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with b as (select * from bank_summary.buckets_for(s,u,'composition')) select jsonb_build_object('total',coalesce(sum(n),0),
 'counts',jsonb_build_object('low',coalesce(sum(n) filter(where key->>0='low'),0),'middle',coalesce(sum(n) filter(where key->>0='middle'),0),
 'high',coalesce(sum(n) filter(where key->>0='high'),0),'unknown',coalesce(sum(n) filter(where key->>0='unknown'),0),'deferred',0),
 -- A subset of high, kept outside counts so total never double-counts it.
 'killerCount',coalesce(sum(n) filter(where key->>1='아주어려움'),0),
 'labelDisagreements',coalesce(sum(n) filter(where (key->>4)::boolean),0)) from b;
$function$
;
CREATE OR REPLACE FUNCTION bank_summary.fact(c bank_catalog, r bank_revisions, q bank_questions)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare m jsonb:=c.metadata;f jsonb:=c.confirmed;d jsonb:=m->'difficulty';src jsonb:=m->'source';v jsonb;
 raw numeric;n numeric;ns text;part text;legacy text;band text;k text;points numeric;point_key jsonb;types jsonb;analyzed boolean;
begin
 v:=bank_summary.row_difficulty(c.revision_id,m,f);
 n:=(v->>'score')::numeric;raw:=(v->>'raw')::numeric;ns:=v->>'numberSource';band:=v->>'band';analyzed:=(v->>'analyzed')::boolean;
 legacy:=case when f?'difficultyBand' then f->>'difficultyBand' else d->>'teacherBand' end;
 part:=src#>>'{numbering,section}';
 if part='unknown' then part:=null;
 elsif part is null or part not in('objective','written') then
  part:=case m#>>'{content,responseType}' when '서술형' then 'written' when '선택형' then 'objective' else split_part(public.bank_printed_key(src),':',1) end;
 end if;
 k:=coalesce(nullif(src->>'documentId',''),(select props->>'sourceId' from public.bank_entries where id=c.commit_id),
  (select x->>'sourceId' from jsonb_array_elements(c.files) x where x->>'role'='source' limit 1));
 if nullif(m#>>'{relations,originalQuestionId}','') is not null then k:=null;end if;
 select coalesce(jsonb_agg(coalesce(nullif(x->>'name',''),x->>'id')),'[]') into types from jsonb_array_elements(coalesce(nullif(m#>'{classification,types}','null'),'[]')) x;
 begin points:=coalesce(f->>'originalPoints',src->>'originalPoints')::numeric;exception when invalid_text_representation then points:=null;end;
 if nullif(src->>'documentId','') is not null and part is not null and raw is not null and points>0 then
  point_key:=jsonb_build_array(src->'documentId',src->'school',src->'grade',src->'academicYear',src->'semester',src->'exam',part);
 end if;
 return jsonb_build_object('revision_id',c.revision_id,'source_id',k,'source',src,'created_at',c.created_at,'registered_at',q.created_at,
  'owner_email',q.owner_email,'visibility',r.visibility,'score',n,'raw',raw,'numberSource',ns,'band',band,
  'composition',case when v->>'displayMappingVersion'='tier-display-v123-1' then case when v->>'compositionBand'='killer' then 'high' else v->>'compositionBand' end when n is null then 'unknown' when n<=3 then 'low' when n<8 then 'middle' else 'high' end,
  'confirmed',coalesce(f->>'difficulty','')<>'','conflict',coalesce(legacy in('쉬움','보통','어려움','아주어려움') and legacy is distinct from band,false),
  'school_key',case when nullif(trim(src->>'school'),'') is not null then coalesce(nullif(src->>'schoolId',''),concat_ws('|',src->>'region',trim(src->>'school'))) end,
  'stats',jsonb_build_array(coalesce(nullif(src->>'school',''),'미상'),coalesce(nullif(src->>'grade',''),'미상'),coalesce(nullif(d->'scope','null'),'{}'),
   case when analyzed then coalesce(v->>'criteriaVersion',d->>'criteriaVersion') else 'new-criteria-required' end,coalesce(part,'unknown'),n,ns,types,analyzed,band,case when bank_v123.display_band(v)='killer' then 'high' else bank_v123.display_band(v) end),
  'point',case when point_key is not null then jsonb_build_array(point_key,raw,points) end);
end $function$
;
CREATE OR REPLACE FUNCTION bank_summary.stats_section(s uuid, u uuid, g jsonb, part text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with b as (select key,n,(key->>5)::numeric score,coalesce(key->>9,case when (key->>5)::numeric<=3 then '쉬움' when (key->>5)::numeric<8 then '보통' when (key->>5)::numeric<9 then '어려움' when (key->>5)::numeric>=9 then '아주어려움' end) band from bank_summary.audience_buckets(s,u,'stats',g) where part='all' or key->>4=part),
 h as (select score,sum(n) n from b where score is not null group by score),
 ordered as (select *,sum(n) over(order by score) cumulative from h),
 totals as (select coalesce(sum(n),0) total,coalesce(sum(n) filter(where (key->>8)::boolean),0) analyzed,
 coalesce(sum(n) filter(where score is not null),0) numeric_count,sum(score*n) score_sum,coalesce(sum(n) filter(where band in('어려움','아주어려움')),0) high from b),
 med as (select avg(score) v from ordered cross join totals cross join lateral(values(floor((numeric_count-1)/2)),(floor(numeric_count/2))) pos(i) where i>=cumulative-n and i<cumulative)
 select jsonb_build_object('total',total,'analyzed',analyzed,'numericCount',numeric_count,'average',score_sum/nullif(numeric_count,0),'median',(select v from med),
 'killerCount',coalesce((select sum(n) from b where band='아주어려움'),0),'bandCount',numeric_count,'highShare',high/nullif(numeric_count,0),
 'distribution',jsonb_build_object('쉬움',coalesce((select sum(n) from b where band='쉬움'),0),'보통',coalesce((select sum(n) from b where band='보통'),0),
 '어려움',coalesce((select sum(n) from b where band='어려움'),0),'아주어려움',coalesce((select sum(n) from b where band='아주어려움'),0)),
 'compositionDistribution',(select coalesce(jsonb_object_agg(k,v),'{}') from (select coalesce(key->>10,case when score is null then 'unknown' when band='쉬움' then 'low' when band='보통' then 'middle' else 'high' end) k,sum(n) v from b group by 1) z),
 'numberSources',(select coalesce(jsonb_object_agg(k,v),'{}') from (select coalesce(key->>6,'미산출') k,sum(n) v from b group by 1) z),
 'bandSources',(select coalesce(jsonb_object_agg(k,v),'{}') from (select case when score is null then '미산출' else '최종 점수 기준' end k,sum(n) v from b group by 1) z),
 'questionTypes',(select coalesce(jsonb_object_agg(k,v),'{}') from (select coalesce(t#>>'{}','undefined') k,sum(n) v from b cross join lateral jsonb_array_elements(key->7) t group by 1) z)) from totals;
$function$
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
 select array_agg(c) into catalog from bank_query.latest(s) c;
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
