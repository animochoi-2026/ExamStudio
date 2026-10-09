CREATE OR REPLACE FUNCTION public.bank_difficulty_number(m jsonb, f jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v text;a jsonb;ai text;n numeric;adjustment jsonb;criteria text;begin
 foreach v in array array[f->>'difficulty',m#>>'{difficulty,userScore}'] loop
  if v ~ '^\d+(\.\d)?$' and v::numeric between 0 and 10 then return v::numeric;end if;
 end loop;
 if coalesce(m#>>'{difficulty,reassessmentRequired}','false')='true' or coalesce(m#>>'{analysis,status}','')='stale' then return null;end if;
 a=m#>array['difficulty','rubricAssessments',m#>>'{difficulty,activeRubricAssessment}'];
 if a->>'criteriaVersion' in ('fixed-learner-access-v2','expected-10-v5-insight-references-scope-low1') and a->>'state'='accepted' and nullif(a->>'inputBasis','') is not null and a->>'inputBasis'=m#>>'{analysis,basis}' then ai=a->>'score';criteria=a->>'criteriaVersion';
 elsif m#>>'{difficulty,criteriaVersion}' in ('fixed-learner-access-v2','expected-10-v5-insight-references-scope-low1') then ai=m#>>'{difficulty,aiScore}';criteria=m#>>'{difficulty,criteriaVersion}';end if;
 if ai is null or ai !~ '^\d+(\.\d)?$' then return null;end if;
 n=ai::numeric;if n<0 or n>10 then return null;end if;
 adjustment=m#>'{difficulty,proofAdjustment}';
 if criteria='expected-10-v5-insight-references-scope-low1' and adjustment->>'version'='final-number-proof-plus2-v1' and adjustment->'rawScore'=to_jsonb(n) and adjustment#>>'{evidence,kind}' in ('construct','complete') then return least(10,n+2);end if;
 return n;
end $function$;
CREATE OR REPLACE FUNCTION public.bank_difficulty_band(m jsonb, f jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare n numeric;begin
 n=public.bank_difficulty_number(m,f);
 return case when n is null then null when n<=3 then '쉬움' when n<8 then '보통' when n<9 then '어려움' else '아주어려움' end;
end $function$;
CREATE OR REPLACE FUNCTION bank_summary.row_difficulty(revision_id uuid, m jsonb, f jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare d jsonb:=m->'difficulty';a jsonb;raw numeric;n numeric;ns text;band text;analyzed boolean:=false;criteria text;
begin
 -- Match difficulty-assessment.cjs, including active revision/basis and proof adjustment.
 if not coalesce((d->>'reassessmentRequired')::boolean,false) and coalesce(m#>>'{analysis,status}','')<>'stale' then
  a:=d#>array['rubricAssessments',d->>'activeRubricAssessment'];
  if a->>'criteriaVersion' in ('fixed-learner-access-v2','expected-10-v5-insight-references-scope-low1') and a->>'state'='accepted'
   and a->>'revisionId'=revision_id::text and nullif(a->>'inputBasis','') is not null and a->>'inputBasis'=m#>>'{analysis,basis}' then
   criteria:=a->>'criteriaVersion';raw:=bank_summary.score(a->'score');analyzed:=true;
  elsif d->>'criteriaVersion' in ('fixed-learner-access-v2','expected-10-v5-insight-references-scope-low1') then
   criteria:=d->>'criteriaVersion';raw:=bank_summary.score(d->'aiScore');analyzed:=raw is not null;
  end if;
 end if;
 n:=bank_summary.score(f->'difficulty');if n is not null then ns:='교사 검수';else
  n:=bank_summary.score(d->'userScore');if n is not null then ns:='교사 직접 입력';else
   n:=raw;if n is not null then ns:='AI 추천';
    if criteria='expected-10-v5-insight-references-scope-low1' and d#>>'{proofAdjustment,version}'='final-number-proof-plus2-v1' and d#>'{proofAdjustment,rawScore}'=to_jsonb(raw)
     and d#>>'{proofAdjustment,evidence,kind}' in('construct','complete') then n:=least(10,raw+2);if n<>raw then ns:='AI 원점수 + 증명 보정';end if;end if;
   end if;
  end if;
 end if;
 band:=case when n is null then null when n<=3 then '쉬움' when n<8 then '보통' when n<9 then '어려움' else '아주어려움' end;
 return jsonb_build_object('score',n,'raw',raw,'numberSource',ns,'band',band,'analyzed',analyzed,'criteriaVersion',criteria);
end $function$;
CREATE OR REPLACE FUNCTION bank_summary.stats_section(s uuid, u uuid, g jsonb, part text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with b as (select key,n,(key->>5)::numeric score from bank_summary.audience_buckets(s,u,'stats',g) where part='all' or key->>4=part),
 h as (select score,sum(n) n from b where score is not null group by score),
 ordered as (select *,sum(n) over(order by score) cumulative from h),
 totals as (select coalesce(sum(n),0) total,coalesce(sum(n) filter(where (key->>8)::boolean),0) analyzed,
 coalesce(sum(n) filter(where score is not null),0) numeric_count,sum(score*n) score_sum,coalesce(sum(n) filter(where score>=8),0) high from b),
 med as (select avg(score) v from ordered cross join totals cross join lateral(values(floor((numeric_count-1)/2)),(floor(numeric_count/2))) pos(i) where i>=cumulative-n and i<cumulative)
 select jsonb_build_object('total',total,'analyzed',analyzed,'numericCount',numeric_count,'average',score_sum/nullif(numeric_count,0),'median',(select v from med),
 'killerCount',coalesce((select sum(n) from b where score>=9),0),'bandCount',numeric_count,'highShare',high/nullif(numeric_count,0),
 'distribution',jsonb_build_object('쉬움',coalesce((select sum(n) from b where score<=3),0),'보통',coalesce((select sum(n) from b where score>3 and score<8),0),
 '어려움',coalesce((select sum(n) from b where score>=8 and score<9),0),'아주어려움',coalesce((select sum(n) from b where score>=9),0)),
 'compositionDistribution',(select coalesce(jsonb_object_agg(k,v),'{}') from (select case when score is null then 'unknown' when score<=3 then 'low' when score<8 then 'middle' else 'high' end k,sum(n) v from b group by 1) z),
 'numberSources',(select coalesce(jsonb_object_agg(k,v),'{}') from (select coalesce(key->>6,'미산출') k,sum(n) v from b group by 1) z),
 'bandSources',(select coalesce(jsonb_object_agg(k,v),'{}') from (select case when score is null then '미산출' else '최종 점수 기준' end k,sum(n) v from b group by 1) z),
 'questionTypes',(select coalesce(jsonb_object_agg(k,v),'{}') from (select coalesce(t#>>'{}','undefined') k,sum(n) v from b cross join lateral jsonb_array_elements(key->7) t group by 1) z)) from totals;
$function$;
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
  'composition',case when n is null then 'unknown' when n<=3 then 'low' when n<8 then 'middle' else 'high' end,
  'confirmed',coalesce(f->>'difficulty','')<>'','conflict',coalesce(legacy in('쉬움','보통','어려움','아주어려움') and legacy is distinct from band,false),
  'school_key',case when nullif(trim(src->>'school'),'') is not null then coalesce(nullif(src->>'schoolId',''),concat_ws('|',src->>'region',trim(src->>'school'))) end,
  'stats',jsonb_build_array(coalesce(nullif(src->>'school',''),'미상'),coalesce(nullif(src->>'grade',''),'미상'),coalesce(nullif(d->'scope','null'),'{}'),
   case when analyzed then coalesce(v->>'criteriaVersion',d->>'criteriaVersion') else 'new-criteria-required' end,coalesce(part,'unknown'),n,ns,types,analyzed),
  'point',case when point_key is not null then jsonb_build_array(point_key,raw,points) end);
end $function$;
DO $refresh$ DECLARE x record; BEGIN
 PERFORM pg_advisory_xact_lock(1846629137,29);
 FOR x IN SELECT space_id,id FROM public.bank_questions ORDER BY space_id,id LOOP PERFORM bank_summary.refresh_question(x.space_id,x.id); END LOOP;
 FOR x IN SELECT DISTINCT space_id,source_id FROM bank_summary.sources LOOP PERFORM bank_summary.refresh_source(x.space_id,x.source_id); END LOOP;
 FOR x IN SELECT DISTINCT space_id,kind,key FROM bank_summary.statistics LOOP PERFORM bank_summary.refresh_statistics(x.space_id,x.kind,x.key); END LOOP;
 FOR x IN SELECT id FROM public.bank_spaces LOOP PERFORM bank_summary.refresh_home(x.id); END LOOP;
END $refresh$;