-- LOCAL, NOT APPLIED TO PRODUCTION: derive all bands from the final number.
-- Source scores, legacy teacher bands and histories remain untouched. No grants.
create or replace function public.bank_difficulty_number(m jsonb,f jsonb) returns numeric language plpgsql immutable set search_path='' as $$
declare v text;a jsonb;ai text;n numeric;adjustment jsonb;criteria constant text:='expected-10-v5-insight-references-scope-low1';begin
 foreach v in array array[f->>'difficulty',m#>>'{difficulty,userScore}'] loop
  if v ~ '^\d+(\.\d)?$' and v::numeric between 0 and 10 then return v::numeric;end if;
 end loop;
 if coalesce(m#>>'{difficulty,reassessmentRequired}','false')='true' or coalesce(m#>>'{analysis,status}','')='stale' then return null;end if;
 a=m#>array['difficulty','rubricAssessments',m#>>'{difficulty,activeRubricAssessment}'];
 if a->>'criteriaVersion'=criteria and a->>'state'='accepted' and nullif(a->>'inputBasis','') is not null and a->>'inputBasis'=m#>>'{analysis,basis}' then ai=a->>'score';
 elsif m#>>'{difficulty,criteriaVersion}'=criteria then ai=m#>>'{difficulty,aiScore}';end if;
 if ai is null or ai !~ '^\d+(\.\d)?$' then return null;end if;
 n=ai::numeric;if n<0 or n>10 then return null;end if;
 adjustment=m#>'{difficulty,proofAdjustment}';
 if adjustment->>'version'='final-number-proof-plus2-v1' and adjustment->'rawScore'=to_jsonb(n) and adjustment#>>'{evidence,kind}' in ('construct','complete') then return least(10,n+2);end if;
 return n;
end $$;
create or replace function public.bank_difficulty_band(m jsonb,f jsonb) returns text language plpgsql immutable set search_path='' as $$
declare n numeric;begin
 n=public.bank_difficulty_number(m,f);
 return case when n is null then null when n<4 then '쉬움' when n<6.5 then '보통' when n<8 then '어려움' else '아주어려움' end;
end $$;
