-- Additive workflow migration. No existing question/exam is deleted by applying it.
-- Preserve historical private records, but retire the private-draft transition.
create or replace function public.bank_set_visibility(r uuid,v text,reason text) returns void language plpgsql security definer set search_path='' as $$
declare q public.bank_questions;begin
 select b.* into q from public.bank_questions b join public.bank_revisions x on x.question_id=b.id where x.id=r;
 if q.id is null or not public.bank_member(q.space_id) or q.owner_id<>auth.uid() or v is distinct from 'shared_pending' then raise insufficient_privilege;end if;
 if exists(select 1 from public.bank_revisions where id=r and visibility='approved') then raise exception '확정 버전은 검수 저장 또는 새 버전으로 수정하세요.';end if;
 update public.bank_revisions set visibility=v,change_reason=left(reason,2000) where id=r;
end $$;
create function public.bank_rate_save(r uuid,value numeric) returns void
language plpgsql security definer set search_path='' as $$
declare s uuid;begin
 select q.space_id into s from public.bank_questions q join public.bank_revisions v on v.question_id=q.id where v.id=r and v.committed and not q.archived;
 if s is null or not public.bank_member(s) or not public.bank_read_revision(r) then raise insufficient_privilege;end if;
 if value is null or value<0 or value>10 or value<>round(value,1) then raise exception '0~10점, 소수점 한 자리로 입력하세요';end if;
 -- The caller can change only their own calibration sample. No role assignment,
 -- other teacher's evaluation or directly confirmed question score is changed.
 insert into public.bank_difficulty_ratings(revision_id,user_id,score,adopted,adopted_by,updated_at)
 values(r,auth.uid(),value,true,auth.uid(),now()) on conflict(revision_id,user_id)
 do update set score=excluded.score,adopted=true,adopted_by=auth.uid(),updated_at=now();
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'rating_save',r::text);
end $$;
create function public.bank_review_save(r uuid,p jsonb,expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s uuid;v public.bank_revisions;old jsonb;begin
 select q.space_id into s from public.bank_questions q join public.bank_revisions x on x.question_id=q.id where x.id=r and not q.archived;
 if s is null or not public.bank_member(s) or not public.bank_read_revision(r) then raise insufficient_privilege;end if;
 if jsonb_typeof(p) is distinct from 'object' or p-ARRAY['tags','primaryUnit','type']<>'{}'::jsonb or length(p::text)>10000
 or (p?'tags' and (jsonb_typeof(p->'tags') is distinct from 'array' or jsonb_array_length(p->'tags')>100))
 or (p?'primaryUnit' and jsonb_typeof(p->'primaryUnit') is distinct from 'string') or (p?'type' and jsonb_typeof(p->'type') is distinct from 'string')
 or exists(select 1 from jsonb_array_elements(coalesce(p->'tags','[]'::jsonb)) x where jsonb_typeof(x)<>'string') then raise exception '검수 입력 형식 오류';end if;
 select * into v from public.bank_revisions where id=r for update;
 if not v.committed or v.visibility not in ('shared_pending','approved') then raise exception '공동 문항만 검수할 수 있습니다';end if;
 if v.review_version is distinct from expected then raise sqlstate 'PT409' using message='검수 정보가 변경되었습니다. 최신 내용을 다시 확인하세요';end if;
 select confirmed into old from public.bank_catalog where revision_id=r for update;
 if old is null then raise exception '문항 데이터가 없습니다';end if;
 -- Removed UI fields remain in confirmed. Clear only an old taxonomy binding
 -- that the user explicitly replaced with a different manual label.
 if p?'primaryUnit' and coalesce(p->>'primaryUnit','') is distinct from coalesce(old->>'primaryUnit','') then p:=p||jsonb_build_object('unitId',null);end if;
 if p?'type' and coalesce(p->>'type','') is distinct from coalesce(old->>'type','') then p:=p||jsonb_build_object('typeId',null);end if;
 update public.bank_catalog set confirmed=confirmed||p||jsonb_build_object('reviewConfirmed',true) where revision_id=r;
 update public.bank_revisions set visibility='approved',review_version=review_version+1,reviewer_id=auth.uid(),reviewed_at=now() where id=r;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'review_save',jsonb_build_object('revision',r,'before',old,'patch',p)::text);
 return jsonb_build_object('version',v.review_version+1);
end $$;

create table public.bank_deleted_exams(id uuid primary key,space_id uuid not null,owner_id uuid not null,deleted_at timestamptz not null default now());
alter table public.bank_deleted_exams enable row level security;
revoke all on public.bank_deleted_exams from public,anon,authenticated;
create function public.bank_exam_lifecycle_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.bank_deleted_exams where id=new.id) then raise sqlstate 'PT409' using message='삭제된 시험지는 다시 저장할 수 없습니다. 새 사본으로 저장하세요';end if;
 return new;
end $$;
create trigger bank_exam_lifecycle_guard before insert on public.bank_exam_drafts for each row execute function public.bank_exam_lifecycle_guard();
create function public.bank_exam_delete(s uuid,e uuid,expected integer,title_confirmation text) returns void
language plpgsql security definer set search_path='' as $$
declare old public.bank_exam_drafts;begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended(e::text,0));
 select * into old from public.bank_exam_drafts where id=e for update;
 if old.id is null or old.space_id<>s or old.owner_id<>auth.uid() then raise insufficient_privilege;end if;
 if old.version is distinct from expected or old.title is distinct from title_confirmation then raise sqlstate 'PT409' using message='시험지가 변경되었습니다. 삭제 대상을 다시 확인하세요';end if;
 insert into public.bank_deleted_exams(id,space_id,owner_id) values(e,s,auth.uid());
 delete from public.bank_exam_history where exam_id=e;
 delete from public.bank_exam_drafts where id=e;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'exam_delete',e::text);
end $$;
revoke all on function public.bank_rate_save(uuid,numeric),public.bank_review_save(uuid,jsonb,integer),public.bank_exam_delete(uuid,uuid,integer,text),public.bank_exam_lifecycle_guard() from public,anon;
grant execute on function public.bank_rate_save(uuid,numeric),public.bank_review_save(uuid,jsonb,integer),public.bank_exam_delete(uuid,uuid,integer,text) to authenticated;
