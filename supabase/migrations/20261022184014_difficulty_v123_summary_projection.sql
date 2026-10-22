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
   case when analyzed then coalesce(v->>'criteriaVersion',d->>'criteriaVersion') else 'new-criteria-required' end,coalesce(part,'unknown'),n,ns,types,analyzed),
  'point',case when point_key is not null then jsonb_build_array(point_key,raw,points) end);
end $function$;

create or replace function public.bank_difficulty_band(m jsonb,f jsonb) returns text language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
 if nullif(m#>'{difficulty,v123Active}','null') is not null then return bank_v123.projection(null,m,f)->>'band';end if;
 n:=public.bank_difficulty_number(m,f);
 return case when n is null then null when n<=3 then '쉬움' when n<8 then '보통' when n<9 then '어려움' else '아주어려움' end;
end $$;
