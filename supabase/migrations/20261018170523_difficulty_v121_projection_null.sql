-- Preserve latest upload evidence when retired active metadata is a JSON null tombstone.
-- No catalog rows or scores are changed by this migration.
create or replace function bank_v121.projection(rid uuid,m jsonb,f jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare d jsonb:=m->'difficulty';r jsonb:=coalesce(nullif(d->'v121Active','null'),d#>'{v121Latest,record}');raw numeric;n numeric;manual numeric;stale boolean;band text;
begin
 if r is null or r='null' then return null;end if;
 stale:=coalesce(d->>'reassessmentRequired','false')='true' or coalesce(m#>>'{analysis,status}','')='stale' or
  (rid is not null and nullif(d->'v121Active','null') is not null and r->>'question_revision_id' is distinct from rid::text) or
  (d#>>'{v121Latest,inputBasis}' is not null and d#>>'{v121Latest,inputBasis}' is distinct from m#>>'{analysis,basis}');
 if not stale and r->>'final_status'='complete' then raw:=bank_v121.score(r->'final_score');end if;
 manual:=coalesce(bank_v121.score(f->'difficulty'),bank_v121.score(d->'userScore'),
  case when d->>'teacher_override_active'='true' then bank_v121.score(d->'teacher_override_score') end);
 n:=coalesce(manual,raw);
 band:=case when n is null then null when n<=3 then '쉬움' when n<8 then '보통' when n<9 then '어려움' else '아주어려움' end;
 return jsonb_build_object('score',n,'raw',raw,'numberSource',case when manual is not null then '교사 조정' else 'AI v1.2.1' end,
  'band',band,'analyzed',raw is not null,'criteriaVersion','insight-bottleneck-v1.2.1','base_tier',r#>'{computed,base_tier}',
  'promotions',r#>'{computed,promotions}','status',case when manual is not null then 'complete' when stale then 'stale' else r->>'final_status' end);
end $$;
