-- Additive, no stored assessment or confirmed value is rewritten.
create function public.bank_difficulty_number(m jsonb,f jsonb) returns numeric language plpgsql immutable set search_path='' as $$
declare v text;begin
 foreach v in array array[f->>'difficulty',m#>>'{difficulty,userScore}',case when coalesce(m#>>'{difficulty,reassessmentRequired}','false')<>'true' then m#>>'{difficulty,calibratedScore}' end,case when coalesce(m#>>'{difficulty,reassessmentRequired}','false')<>'true' then m#>>'{difficulty,aiScore}' end] loop
  if v ~ '^\d+(\.\d)?$' then if v::numeric between 0 and 10 then return v::numeric;end if;end if;
 end loop;return null;
end $$;
create function public.bank_difficulty_band(m jsonb,f jsonb) returns text language plpgsql immutable set search_path='' as $$
declare v text;n numeric;begin
 v=case when f?'difficultyBand' then f->>'difficultyBand' else m#>>'{difficulty,teacherBand}' end;if v in ('쉬움','보통','어려움','아주어려움') then return v;end if;
 n=public.bank_difficulty_number(jsonb_build_object('difficulty',jsonb_build_object('userScore',m#>>'{difficulty,userScore}')),f);
 if n is not null then return case when n<4 then '쉬움' when n<6.5 then '보통' when n<8 then '어려움' else '아주어려움' end;end if;
 if coalesce(m#>>'{difficulty,reassessmentRequired}','false')='true' then return null;end if;
 v=m#>>'{difficulty,aiBand}';if v in ('쉬움','보통','어려움','아주어려움') then return v;end if;
 n=public.bank_difficulty_number(jsonb_build_object('difficulty',jsonb_build_object('aiScore',m#>>'{difficulty,aiScore}')),'{}');
 return case when n is null then null when n<4 then '쉬움' when n<6.5 then '보통' when n<8 then '어려움' else '아주어려움' end;
end $$;
create function public.bank_difficulty_save(r uuid,p jsonb,expected integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare s uuid;v public.bank_revisions;prior jsonb;begin
 select q.space_id into s from public.bank_questions q join public.bank_revisions x on x.question_id=q.id where x.id=r and not q.archived;
 if s is null or not public.bank_member(s) or not public.bank_read_revision(r) then raise insufficient_privilege;end if;
 if jsonb_typeof(p) is distinct from 'object' or p-array['difficultyBand','difficulty','originalPoints','originalPointsReviewed']<>'{}'::jsonb then raise exception '난이도 검수 입력 오류';end if;
 if p?'difficultyBand' and p->'difficultyBand'<>'null'::jsonb and coalesce(p->>'difficultyBand','') not in ('쉬움','보통','어려움','아주어려움') then raise exception '난이도 구간 오류';end if;
 if p?'difficulty' and p->'difficulty'<>'null'::jsonb then
  if coalesce(p->>'difficulty','') !~ '^\d+(\.\d)?$' then raise exception '난이도 점수 형식 오류';end if;
  if (p->>'difficulty')::numeric not between 0 and 10 then raise exception '난이도 점수 범위 오류';end if;
 end if;
 if p?'originalPoints' and p->'originalPoints'<>'null'::jsonb then
  if coalesce(p->>'originalPoints','') !~ '^\d+(\.\d{1,2})?$' then raise exception '원본 배점 형식 오류';end if;
  if (p->>'originalPoints')::numeric<=0 or (p->>'originalPoints')::numeric>1000 then raise exception '원본 배점 범위 오류';end if;
 end if;
 if p?'originalPointsReviewed' and jsonb_typeof(p->'originalPointsReviewed')<>'boolean' then raise exception '배점 검수 형식 오류';end if;
 select * into v from public.bank_revisions where id=r for update;
 if not v.committed or v.visibility not in ('shared_pending','approved') then raise insufficient_privilege;end if;
 if v.review_version is distinct from expected then raise sqlstate 'PT409' using message='다른 편집이 저장되었습니다. 최신 정보를 다시 확인하세요';end if;
 select confirmed into prior from public.bank_catalog where revision_id=r for update;
 update public.bank_catalog set confirmed=confirmed||p where revision_id=r;
 update public.bank_revisions set review_version=review_version+1 where id=r;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'difficulty_evidence',jsonb_build_object('revision',r,'before',prior,'patch',p)::text);
 return jsonb_build_object('version',v.review_version+1);
end $$;
-- Extend the existing current-revision query before pagination; preserve its
-- permissions, source/type filters and ordering.
do $$ declare definition text;needle text;begin
 select pg_get_functiondef('public.bank_search_current(uuid,jsonb,integer)'::regprocedure) into definition;
 needle='from latest c where';if position(needle in definition)=0 then raise exception 'bank_search_current migration anchor missing';end if;
 definition=replace(definition,needle,needle||' (coalesce(filters->>''difficultyBand'','''')='''' or public.bank_difficulty_band(c.metadata,c.confirmed)=filters->>''difficultyBand'') and ');
 needle='coalesce(nullif(c.confirmed->>''difficulty'',''''),nullif(c.metadata#>>''{difficulty,userScore}'',''''),nullif(c.metadata#>>''{difficulty,aiScore}'',''''))::numeric';
 if position(needle in definition)=0 then raise exception 'difficulty numeric migration anchor missing';end if;
 definition=replace(definition,needle,'public.bank_difficulty_number(c.metadata,c.confirmed)');execute definition;
end $$;
create function public.bank_difficulty_rows(s uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (
  select distinct on(c.question_id) c.question_id,c.revision_id,c.metadata,c.confirmed
  from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id
  where c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id)
  order by c.question_id,c.created_at desc,c.revision_id desc
 ) t);
end $$;
revoke all on function public.bank_difficulty_number(jsonb,jsonb),public.bank_difficulty_band(jsonb,jsonb),public.bank_difficulty_save(uuid,jsonb,integer),public.bank_difficulty_rows(uuid) from public,anon;
grant execute on function public.bank_difficulty_number(jsonb,jsonb),public.bank_difficulty_band(jsonb,jsonb),public.bank_difficulty_save(uuid,jsonb,integer),public.bank_difficulty_rows(uuid) to authenticated;
