-- Shared pending questions can be checked by any approved bank member.
-- Private drafts and archived questions retain their existing restrictions.
create or replace function public.bank_read_revision(r uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.bank_revisions v join public.bank_questions q on q.id=v.question_id
  where v.id=r and public.bank_member(q.space_id)
   and (not q.archived or public.bank_member(q.space_id,true)
    or exists(select 1 from public.bank_exam_drafts e where e.space_id=q.space_id and e.owner_id=auth.uid()
      and e.document->'items' @> jsonb_build_array(jsonb_build_object('revisionId',r::text)))
    or exists(select 1 from public.bank_exam_history h join public.bank_exam_drafts e on e.id=h.exam_id
      where e.space_id=q.space_id and e.owner_id=auth.uid()
       and h.document->'items' @> jsonb_build_array(jsonb_build_object('revisionId',r::text))))
   and (v.actor_id=auth.uid() or (v.committed and v.visibility in ('shared_pending','approved')))
 );
$$;

create or replace function public.bank_scope_confirm(r uuid,e jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare s uuid;v public.bank_revisions;begin
 select q.space_id into s from public.bank_questions q join public.bank_revisions x on x.question_id=q.id where x.id=r and not q.archived;
 if s is null or not public.bank_member(s) or not public.bank_read_revision(r) then raise insufficient_privilege;end if;
 select * into v from public.bank_revisions where id=r for update;
 if not v.committed then raise exception '완료된 문항 버전만 검수할 수 있습니다.';end if;
 if e->>'taxonomyVersion' is distinct from 'middle-school-2022-v1'
  or e->>'confirmed' is distinct from 'true'
  or jsonb_typeof(e->'conditionUnitIds') is distinct from 'array'
  or jsonb_typeof(e->'solutions') is distinct from 'array'
  or jsonb_array_length(e->'solutions')=0 or length(e::text)>50000
 then raise exception '확인한 조건·풀이 개념을 입력하세요';end if;
 if not exists(select 1 from jsonb_array_elements(e->'solutions') x where x->>'verified'='true' and x->>'complete'='true' and length(trim(x->>'text'))>0)
 then raise exception '완성된 풀이를 하나 이상 확인하세요';end if;
 insert into public.bank_scope_evidence values(r,e,auth.uid(),now())
 on conflict(revision_id) do update set evidence=excluded.evidence,reviewer_id=excluded.reviewer_id,updated_at=now();
 update public.bank_catalog set confirmed=confirmed||jsonb_build_object('scopeEvidence',e||jsonb_build_object('status','confirmed')) where revision_id=r;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target)
 values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'scope_confirm',jsonb_build_object('revision',r,'taxonomyVersion',e->>'taxonomyVersion','solutions',jsonb_array_length(e->'solutions'))::text);
end $$;

-- A teacher may complete review for one committed pending revision by explicitly
-- confirming sharing and difficulty. This grants no taxonomy, rating-adoption,
-- archive, or membership administration rights.
create function public.bank_teacher_complete(r uuid,expected integer,score numeric,sharing_confirmed boolean)
returns void language plpgsql security definer set search_path='' as $$
declare s uuid;v public.bank_revisions;prior jsonb;begin
 select q.space_id into s from public.bank_questions q join public.bank_revisions x on x.question_id=q.id
 where x.id=r and not q.archived;
 if s is null or not public.bank_member(s) or not public.bank_read_revision(r) then raise insufficient_privilege;end if;
 if sharing_confirmed is distinct from true then raise exception '공동 이용 가능 여부를 직접 확인하세요';end if;
 if score is null or score<0 or score>10 or score<>round(score,1) then raise exception '난이도는 0~10점, 소수점 한 자리로 확인하세요';end if;
 select * into v from public.bank_revisions where id=r for update;
 if not v.committed or v.review_version<>expected then raise sqlstate 'PT409' using message='검수 정보가 변경되었습니다. 새로고침 후 다시 확인하세요';end if;
 if v.visibility='approved' then return;end if;
 if v.visibility<>'shared_pending' then raise exception '공동 검수 요청 문항만 완료할 수 있습니다';end if;
 select confirmed into prior from public.bank_catalog where revision_id=r for update;
 if prior is null then raise exception '문항 데이터가 없습니다';end if;
 update public.bank_catalog set confirmed=confirmed||jsonb_build_object('difficulty',to_char(score,'FM999990.0'),'sharingAllowed',true,'reviewConfirmed',true)
 where revision_id=r;
 update public.bank_revisions set visibility='approved',review_version=review_version+1,reviewer_id=auth.uid(),reviewed_at=now(),change_reason='교사 공동 검수 완료' where id=r;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target)
 values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'teacher_review_complete',jsonb_build_object('revision',r,'score',score,'previousDifficulty',prior->>'difficulty')::text);
end $$;
revoke execute on function public.bank_teacher_complete(uuid,integer,numeric,boolean) from public,anon;
grant execute on function public.bank_teacher_complete(uuid,integer,numeric,boolean) to authenticated;

create function public.bank_review_identity(r uuid) returns text
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.bank_read_revision(r) then raise insufficient_privilege;end if;
 return (select u.email from public.bank_revisions v join auth.users u on u.id=v.reviewer_id where v.id=r);
end $$;
revoke execute on function public.bank_review_identity(uuid) from public,anon;
grant execute on function public.bank_review_identity(uuid) to authenticated;
