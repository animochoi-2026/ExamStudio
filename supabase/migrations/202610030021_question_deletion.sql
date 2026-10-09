-- Two-phase deletion: freeze references, remove dedicated storage objects via
-- the Storage API, then delete records. Failures remain resumable; no archive
-- operation is presented as completed deletion. Shared/source files survive.
create table public.bank_question_deletions(question_id uuid primary key,space_id uuid not null,actor_id uuid not null,token text not null,files jsonb not null default '[]',completed boolean not null default false,created_at timestamptz not null default now());
alter table public.bank_question_deletions enable row level security;
revoke all on public.bank_question_deletions from public,anon,authenticated;
create function public.bank_question_delete_plan(q uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s uuid;heads text;job public.bank_question_deletions;begin
 select space_id into s from public.bank_questions where id=q for update;
 select * into job from public.bank_question_deletions where question_id=q;
 s:=coalesce(s,job.space_id);
 if s is null or not public.bank_member(s,true) then raise insufficient_privilege;end if;
 if job.question_id is not null then return jsonb_build_object('token',job.token,'blocked',false,'resuming',true,'complete',job.completed);end if;
 if exists(select 1 from public.bank_exam_drafts e where e.document->'items' @> jsonb_build_array(jsonb_build_object('questionId',q::text)))
 or exists(select 1 from public.bank_exam_history h where h.document->'items' @> jsonb_build_array(jsonb_build_object('questionId',q::text))) then return jsonb_build_object('blocked',true,'reason','저장된 시험지 또는 버전 이력에서 사용하는 문항입니다. 참조 시험지를 먼저 확인하세요.');end if;
 if exists(select 1 from public.bank_maintenance_items where question_id=q)
 or exists(select 1 from public.bank_catalog where question_id<>q and (metadata#>>'{relations,originalQuestionId}'=q::text or metadata#>>'{relations,derivedFromQuestionId}'=q::text))
 then return jsonb_build_object('blocked',true,'reason','연결된 유사문항 또는 일괄 작업 이력이 있어 삭제할 수 없습니다.');end if;
 if exists(select 1 from public.bank_revisions where question_id=q and not committed) then return jsonb_build_object('blocked',true,'reason','업로드 중인 버전이 있습니다. 완료 후 삭제하세요.');end if;
 select md5(coalesce(string_agg(id::text||':'||review_version::text,',' order by id),'')) into heads from public.bank_revisions where question_id=q;
 return jsonb_build_object('blocked',false,'token',heads);
end $$;
create function public.bank_question_delete_claim(q uuid,expected_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare plan jsonb;s uuid;entry public.bank_entries;files jsonb:='[]';job public.bank_question_deletions;begin
 plan:=public.bank_question_delete_plan(q);
 if plan->>'blocked'='true' then raise exception '%',plan->>'reason';end if;
 if plan->>'token' is distinct from expected_token then raise sqlstate 'PT409' using message='문항이 변경되었습니다. 삭제 대상을 다시 확인하세요';end if;
 select * into job from public.bank_question_deletions where question_id=q;
 if found then return jsonb_build_object('files',job.files,'complete',job.completed,'spaceId',job.space_id);end if;
 select space_id into s from public.bank_questions where id=q;
 -- Lock potential files before rechecking shared references. A reference-insert
 -- trigger takes a share lock on the same entry, closing the storage-delete race.
 for entry in select e.* from public.bank_entries e where e.space_id=s and e.kind='file' and e.props->>'role'<>'source' and
 (e.props->>'questionId'=q::text or exists(select 1 from public.bank_revision_files f join public.bank_revisions r on r.id=f.revision_id where f.file_id=e.id and r.question_id=q)) order by e.id for update loop
  if not exists(select 1 from public.bank_revision_files f join public.bank_revisions r on r.id=f.revision_id where f.file_id=entry.id and r.question_id<>q)
  and not exists(select 1 from public.bank_catalog c where c.question_id<>q and (c.commit_id=entry.id or c.files @> jsonb_build_array(jsonb_build_object('id',entry.id::text))))
  then files:=files||jsonb_build_array(jsonb_build_object('id',entry.id,'chunks',entry.chunks));end if;
 end loop;
 insert into public.bank_question_deletions(question_id,space_id,actor_id,token,files) values(q,s,auth.uid(),expected_token,files);
 return jsonb_build_object('files',files,'spaceId',s,'complete',false);
end $$;
create function public.bank_deletion_reference_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare i jsonb;q uuid;begin
 if tg_table_name='bank_questions' then
  if exists(select 1 from public.bank_question_deletions where question_id=new.id) then raise sqlstate 'PT409' using message='삭제된 문항 ID는 다시 사용할 수 없습니다';end if;
 elsif tg_table_name='bank_revisions' then
  perform 1 from public.bank_questions where id=new.question_id for share;
  if exists(select 1 from public.bank_question_deletions where question_id=new.question_id) then raise sqlstate 'PT409' using message='삭제 중인 문항입니다';end if;
 elsif tg_table_name='bank_revision_files' then
  perform 1 from public.bank_entries where id=new.file_id for share;
  if exists(select 1 from public.bank_question_deletions j,jsonb_array_elements(j.files) f where f->>'id'=new.file_id::text) then raise sqlstate 'PT409' using message='삭제 중인 파일은 새 문항에 연결할 수 없습니다';end if;
 else
  for i in select x from jsonb_array_elements(new.document->'items') x order by x->>'questionId' loop
   q:=(i->>'questionId')::uuid;perform 1 from public.bank_questions where id=q for share;
   if not found or exists(select 1 from public.bank_question_deletions where question_id=q) then raise sqlstate 'PT409' using message='삭제 중이거나 삭제된 문항은 시험지에 저장할 수 없습니다';end if;
  end loop;
 end if;return new;
end $$;
create trigger bank_question_deletion_guard before insert on public.bank_questions for each row execute function public.bank_deletion_reference_guard();
create trigger bank_revision_deletion_guard before insert on public.bank_revisions for each row execute function public.bank_deletion_reference_guard();
create trigger bank_file_deletion_guard before insert on public.bank_revision_files for each row execute function public.bank_deletion_reference_guard();
create trigger bank_exam_reference_guard before insert or update of document on public.bank_exam_drafts for each row execute function public.bank_deletion_reference_guard();
create trigger bank_history_reference_guard before insert on public.bank_exam_history for each row execute function public.bank_deletion_reference_guard();
create function public.bank_deletion_object_allowed(object_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bank_question_deletions j,jsonb_array_elements(j.files) f where not j.completed and public.bank_member(j.space_id,true)
 and object_name ~ ('^'||j.space_id::text||'/'||(f->>'id')||'/[0-9]{3}$'));
$$;
create policy bank_confirmed_delete on storage.objects for delete to authenticated using(bucket_id='question-bank' and public.bank_deletion_object_allowed(name));
create function public.bank_question_delete_finish(q uuid,expected_token text) returns void language plpgsql security definer set search_path='' as $$
declare job public.bank_question_deletions;ids uuid[];begin
 perform 1 from public.bank_questions where id=q for update;
 select * into job from public.bank_question_deletions where question_id=q for update;
 if job.question_id is null or not public.bank_member(job.space_id,true) then raise insufficient_privilege;end if;
 if job.token is distinct from expected_token then raise sqlstate 'PT409' using message='삭제 확인이 다릅니다';end if;
 if job.completed then return;end if;
 if exists(select 1 from storage.objects o,jsonb_array_elements(job.files) f where o.bucket_id='question-bank' and o.name like job.space_id::text||'/'||(f->>'id')||'/%') then raise exception '전용 파일 삭제가 아직 끝나지 않았습니다. 다시 시도하세요';end if;
 select array_agg(id) into ids from public.bank_revisions where question_id=q;
 delete from public.bank_difficulty_ratings where revision_id=any(ids);
 delete from public.bank_scope_evidence where revision_id=any(ids);
 delete from public.bank_proposals where revision_id=any(ids);
 delete from public.bank_personal where question_id=q;
 delete from public.bank_revision_files where revision_id=any(ids);
 delete from public.bank_catalog where question_id=q;
 update public.bank_revisions set parent_id=null where id=any(ids);
 delete from public.bank_revisions where question_id=q;
 delete from public.bank_questions where id=q;
 delete from public.bank_entries where id in(select (f->>'id')::uuid from jsonb_array_elements(job.files) f);
 update public.bank_question_deletions set completed=true where question_id=q;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(job.space_id,auth.uid(),(select email from auth.users where id=auth.uid()),'question_delete',q::text);
end $$;
revoke all on function public.bank_question_delete_plan(uuid),public.bank_question_delete_claim(uuid,text),public.bank_question_delete_finish(uuid,text),public.bank_deletion_object_allowed(text),public.bank_deletion_reference_guard() from public,anon;
grant execute on function public.bank_question_delete_plan(uuid),public.bank_question_delete_claim(uuid,text),public.bank_question_delete_finish(uuid,text),public.bank_deletion_object_allowed(text) to authenticated;
