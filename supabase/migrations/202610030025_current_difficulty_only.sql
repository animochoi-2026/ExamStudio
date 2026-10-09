-- Current AI recommendations use only the adopted v5 criteria. Teacher values
-- and historical exam snapshots are separate and remain unchanged. No grants.
create or replace function public.bank_difficulty_number(m jsonb,f jsonb) returns numeric language plpgsql immutable set search_path='' as $$
declare v text;a jsonb;ai text;criteria constant text:='expected-10-v5-insight-references-scope-low1';begin
 if coalesce(m#>>'{difficulty,reassessmentRequired}','false')<>'true' and coalesce(m#>>'{analysis,status}','')<>'stale' then
  a=m#>array['difficulty','rubricAssessments',m#>>'{difficulty,activeRubricAssessment}'];
  if a->>'criteriaVersion'=criteria and a->>'state'='accepted' and nullif(a->>'inputBasis','') is not null and a->>'inputBasis'=m#>>'{analysis,basis}' then ai=a->>'score';
  elsif m#>>'{difficulty,criteriaVersion}'=criteria then ai=m#>>'{difficulty,aiScore}';end if;
 end if;
 foreach v in array array[f->>'difficulty',m#>>'{difficulty,userScore}',ai] loop
  if v ~ '^\d+(\.\d)?$' then if v::numeric between 0 and 10 then return v::numeric;end if;end if;
 end loop;return null;
end $$;
create or replace function public.bank_difficulty_band(m jsonb,f jsonb) returns text language plpgsql immutable set search_path='' as $$
declare v text;n numeric;begin
 v=case when f?'difficultyBand' then f->>'difficultyBand' else m#>>'{difficulty,teacherBand}' end;
 if v in ('쉬움','보통','어려움','아주어려움') then return v;end if;
 n=public.bank_difficulty_number(m,f);
 return case when n is null then null when n<4 then '쉬움' when n<6.5 then '보통' when n<8 then '어려움' else '아주어려움' end;
end $$;
