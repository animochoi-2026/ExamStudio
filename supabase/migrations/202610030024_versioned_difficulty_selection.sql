-- Only selection/display functions change. No data rewrite, grants or policies.
create or replace function public.bank_difficulty_number(m jsonb,f jsonb) returns numeric language plpgsql immutable set search_path='' as $$
declare v text;a jsonb;active_score text;begin
 a=m#>array['difficulty','rubricAssessments',m#>>'{difficulty,activeRubricAssessment}'];
 if a->>'state'='accepted' and nullif(a->>'inputBasis','') is not null and a->>'inputBasis'=m#>>'{analysis,basis}' and coalesce(m#>>'{analysis,status}','')<>'stale' then active_score=a->>'score';end if;
 foreach v in array array[f->>'difficulty',m#>>'{difficulty,userScore}',case when coalesce(m#>>'{difficulty,reassessmentRequired}','false')<>'true' then active_score end,case when coalesce(m#>>'{difficulty,reassessmentRequired}','false')<>'true' then m#>>'{difficulty,calibratedScore}' end,case when coalesce(m#>>'{difficulty,reassessmentRequired}','false')<>'true' then m#>>'{difficulty,aiScore}' end] loop
  if v ~ '^\d+(\.\d)?$' then if v::numeric between 0 and 10 then return v::numeric;end if;end if;
 end loop;return null;
end $$;
create or replace function public.bank_difficulty_band(m jsonb,f jsonb) returns text language plpgsql immutable set search_path='' as $$
declare v text;n numeric;a jsonb;begin
 v=case when f?'difficultyBand' then f->>'difficultyBand' else m#>>'{difficulty,teacherBand}' end;if v in ('쉬움','보통','어려움','아주어려움') then return v;end if;
 n=public.bank_difficulty_number(jsonb_build_object('difficulty',jsonb_build_object('userScore',m#>>'{difficulty,userScore}')),f);
 if n is not null then return case when n<4 then '쉬움' when n<6.5 then '보통' when n<8 then '어려움' else '아주어려움' end;end if;
 if coalesce(m#>>'{difficulty,reassessmentRequired}','false')='true' then return null;end if;
 a=m#>array['difficulty','rubricAssessments',m#>>'{difficulty,activeRubricAssessment}'];
 if a->>'state'='accepted' and nullif(a->>'inputBasis','') is not null and a->>'inputBasis'=m#>>'{analysis,basis}' and coalesce(m#>>'{analysis,status}','')<>'stale' then
  n=public.bank_difficulty_number(m,f);if n is not null then return case when n<4 then '쉬움' when n<6.5 then '보통' when n<8 then '어려움' else '아주어려움' end;end if;
 end if;
 v=m#>>'{difficulty,aiBand}';if v in ('쉬움','보통','어려움','아주어려움') then return v;end if;
 n=public.bank_difficulty_number(jsonb_build_object('difficulty',jsonb_build_object('aiScore',m#>>'{difficulty,aiScore}')),'{}');
 return case when n is null then null when n<4 then '쉬움' when n<6.5 then '보통' when n<8 then '어려움' else '아주어려움' end;
end $$;
