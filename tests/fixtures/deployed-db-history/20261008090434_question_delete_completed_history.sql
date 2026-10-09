-- Keep history until the user's normal two-phase delete has removed dedicated Storage objects.
-- Completed item status plus a committed result is authoritative, even in a shared batch job.
alter table public.bank_question_deletions add column if not exists revision_ids uuid[] not null default '{}';
create or replace function public.bank_question_delete_blockers(q uuid) returns jsonb
language plpgsql set search_path='' as $fn$
declare ids uuid[]; refs text[]; details jsonb; s uuid;
begin
 select space_id into s from public.bank_questions where id=q;
 select coalesce(array_agg(id),'{}') into ids from public.bank_revisions where question_id=q;
 refs:=array_append(ids::text[],q::text);
 select jsonb_agg(jsonb_build_object('examId',id,'title',title)) into details from public.bank_exam_drafts e
 where exists(select 1 from unnest(refs) x where e.document::text like '%'||x||'%');
 if details is not null then return jsonb_build_object('blocked',true,'code','exam_reference','reason','저장된 시험지에서 사용하는 문항입니다: '||details::text,'references',details);end if;
 select jsonb_agg(jsonb_build_object('examId',exam_id,'version',version)) into details from public.bank_exam_history h
 where exists(select 1 from unnest(refs) x where h.document::text like '%'||x||'%');
 if details is not null then return jsonb_build_object('blocked',true,'code','exam_history_reference','reason','저장된 시험지 버전에서 사용하는 문항입니다: '||details::text,'references',details);end if;
 select jsonb_agg(jsonb_build_object('questionId',question_id,'revisionId',revision_id)) into details from public.bank_catalog c
 where c.question_id<>q and exists(select 1 from unnest(refs) x where c.metadata::text like '%'||x||'%');
 if details is not null then return jsonb_build_object('blocked',true,'code','question_reference','reason','다른 문항이 이 문항 또는 버전을 참조합니다: '||details::text,'references',details);end if;
 if exists(select 1 from public.bank_revisions where question_id<>q and parent_id=any(ids))
 or exists(select 1 from public.bank_maintenance_items where question_id<>q and (base_id=any(ids) or result_id=any(ids)))
 or exists(select 1 from public.bank_image_transitions where question_id<>q and (base_revision_id=any(ids) or target_revision_id=any(ids)))
 then return jsonb_build_object('blocked',true,'code','external_revision_reference','reason','다른 문항의 버전 또는 작업이 이 문항을 참조합니다. 연결을 먼저 확인하세요.');end if;
 select jsonb_agg(jsonb_build_object('jobId',i.job_id,'status',i.status,'resultId',i.result_id)) into details
 from public.bank_maintenance_items i where i.question_id=q and
 (i.status<>'complete' or not exists(select 1 from public.bank_revisions r where r.id=i.result_id and r.question_id=q and r.committed));
 if details is not null then return jsonb_build_object('blocked',true,'code','unfinished_maintenance','reason','완료되지 않은 일괄 작업이 있습니다. 완료 또는 취소 정리가 필요합니다: '||details::text,'references',details);end if;
 if exists(select 1 from public.bank_revisions where question_id=q and not committed)
 then return jsonb_build_object('blocked',true,'code','unfinished_revision','reason','업로드·변환이 끝나지 않은 버전이 있습니다. 완료 또는 취소 정리 후 삭제하세요.');end if;
 if exists(select 1 from public.bank_revision_prunes j where j.space_id=s and not j.completed and (
 exists(select 1 from public.bank_revision_prune_marks m where m.job_id=j.id and m.revision_id=any(ids))
 or exists(select 1 from jsonb_array_elements_text(coalesce(j.plan->'revisions','[]')) x where x=any(ids::text[]))
 or exists(select 1 from jsonb_array_elements(coalesce(j.plan->'files','[]')) f join public.bank_entries e on e.id::text=f->>'id'
 where e.props->>'questionId'=q::text or exists(select 1 from public.bank_revision_files l where l.file_id=e.id and l.revision_id=any(ids)))))
 then return jsonb_build_object('blocked',true,'code','active_prune','reason','이 문항의 파일 정리가 진행 중입니다. 해당 작업 완료 후 삭제하세요.');end if;
 return jsonb_build_object('blocked',false);
end $fn$;
revoke all on function public.bank_question_delete_blockers(uuid) from public,anon,authenticated;

create or replace function public.bank_question_delete_plan(q uuid) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare s uuid;heads text;job public.bank_question_deletions;blocked jsonb;
begin
 select space_id into s from public.bank_questions where id=q;
 if s is null then select space_id into s from public.bank_question_deletions where question_id=q;end if;
 if s is null or not public.bank_member(s,true) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended('revision-prune:'||s::text,0));
 perform 1 from public.bank_questions where id=q for update;
 select * into job from public.bank_question_deletions where question_id=q;
 if job.completed then return jsonb_build_object('token',job.token,'blocked',false,'resuming',true,'complete',true);end if;
 blocked:=public.bank_question_delete_blockers(q);
 if blocked->>'blocked'='true' then return blocked;end if;
 if job.question_id is not null then return jsonb_build_object('token',job.token,'blocked',false,'resuming',true,'complete',false);end if;
 select md5(jsonb_build_object(
 'question',(select to_jsonb(x) from public.bank_questions x where id=q),
 'revisions',(select jsonb_agg(to_jsonb(x) order by id) from public.bank_revisions x where question_id=q),
 'catalog',(select jsonb_agg(to_jsonb(x) order by revision_id) from public.bank_catalog x where question_id=q),
 'maintenance',(select jsonb_agg(to_jsonb(x) order by job_id) from public.bank_maintenance_items x where question_id=q),
 'transitions',(select jsonb_agg(to_jsonb(x) order by id) from public.bank_image_transitions x where question_id=q)
 )::text) into heads;
 return jsonb_build_object('blocked',false,'token',heads);
end $fn$;

CREATE OR REPLACE FUNCTION public.bank_question_delete_claim(q uuid, expected_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  and not exists(select 1 from public.bank_catalog c where c.question_id<>q and c.metadata::text like '%'||entry.id::text||'%')
  and not exists(select 1 from public.bank_image_transitions t where t.question_id<>q and to_jsonb(t)::text like '%'||entry.id::text||'%')
  and not exists(select 1 from public.bank_exam_drafts e where e.document::text like '%'||entry.id::text||'%')
  and not exists(select 1 from public.bank_exam_history h where h.document::text like '%'||entry.id::text||'%')
  then files:=files||jsonb_build_array(jsonb_build_object('id',entry.id,'chunks',entry.chunks));end if;
 end loop;
 insert into public.bank_question_deletions(question_id,space_id,actor_id,token,files,revision_ids) values(q,s,auth.uid(),expected_token,files,coalesce((select array_agg(id order by id) from public.bank_revisions where question_id=q),'{}'));
 return jsonb_build_object('files',files,'spaceId',s,'complete',false);
end $function$
;
CREATE OR REPLACE FUNCTION public.bank_question_delete_finish(q uuid, expected_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare job public.bank_question_deletions;ids uuid[];s uuid;blocked jsonb;begin
 select space_id into s from public.bank_question_deletions where question_id=q;
 if s is null or not public.bank_member(s,true) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended('revision-prune:'||s::text,0));
 perform 1 from public.bank_questions where id=q for update;
 select * into job from public.bank_question_deletions where question_id=q for update;
 if job.question_id is null or not public.bank_member(job.space_id,true) then raise insufficient_privilege;end if;
 if job.token is distinct from expected_token then raise sqlstate 'PT409' using message='삭제 확인이 다릅니다';end if;
 if job.completed then return;end if;
 if exists(select 1 from storage.objects o,jsonb_array_elements(job.files) f where o.bucket_id='question-bank' and o.name like job.space_id::text||'/'||(f->>'id')||'/%') then raise exception '전용 파일 삭제가 아직 끝나지 않았습니다. 다시 시도하세요';end if;
 blocked:=public.bank_question_delete_blockers(q);
 if blocked->>'blocked'='true' then raise sqlstate 'PT409' using message=blocked->>'reason';end if;
 select array_agg(id) into ids from public.bank_revisions where question_id=q;
 -- Only the confirmed question is removed. Shared batch jobs and their other items survive.
 delete from public.bank_maintenance_items where question_id=q;
 delete from public.bank_image_transitions where question_id=q;
 delete from public.bank_revision_prune_marks where revision_id=any(ids);
 update public.bank_question_deletions set revision_ids=coalesce(ids,revision_ids) where question_id=q;
 delete from public.bank_difficulty_ratings where revision_id=any(ids);
 delete from public.bank_scope_evidence where revision_id=any(ids);
 delete from public.bank_proposals where revision_id=any(ids);
 delete from public.bank_personal where question_id=q;
 delete from public.bank_revision_files where revision_id=any(ids);
 delete from public.bank_catalog where question_id=q;
 -- Delete the whole self-referencing set in one statement; never UPDATE retired revisions.
 delete from public.bank_revisions where question_id=q;
 delete from public.bank_questions where id=q;
 delete from public.bank_entries where id in(select (f->>'id')::uuid from jsonb_array_elements(job.files) f);
 update public.bank_question_deletions set completed=true where question_id=q;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(job.space_id,auth.uid(),(select email from auth.users where id=auth.uid()),'question_delete',q::text);
end $function$
;
CREATE OR REPLACE FUNCTION public.bank_revision_prune_freeze_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb:=to_jsonb(new);s uuid;refs text[]:='{}';frefs text[]:='{}';x jsonb;scan_metadata jsonb;inherited_metadata jsonb;audit_path text[];audit_value jsonb;begin
 -- Same space serialization for ALL reference writers closes claim/pin races.
 s:=nullif(v->>'space_id','')::uuid;
 if s is null and v ? 'question_id' then select space_id into s from public.bank_questions where id=(v->>'question_id')::uuid;end if;
 if s is null and v ? 'exam_id' then select space_id into s from public.bank_exam_drafts where id=(v->>'exam_id')::uuid;end if;
 if s is null and v ? 'revision_id' then select q.space_id into s from public.bank_revisions r join public.bank_questions q on q.id=r.question_id where r.id=(v->>'revision_id')::uuid;end if;
 if tg_table_schema='storage' then
 if new.bucket_id<>'question-bank' or new.name !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/' then return new;end if;
 s:=split_part(new.name,'/',1)::uuid;frefs:=array_append(frefs,split_part(new.name,'/',2));
 end if;
 if s is not null then perform pg_advisory_xact_lock(hashtextextended('revision-prune:'||s::text,0));end if;
 foreach x in array ARRAY[to_jsonb(v->>'revision_id'),to_jsonb(v->>'base_id'),to_jsonb(v->>'result_id')] loop
 if x is not null then refs:=array_append(refs,x#>>'{}');end if;
 end loop;
 if tg_table_name='bank_revisions' then
 refs:=array_append(refs,new.id::text);
 if tg_op<>'UPDATE' then refs:=array_append(refs,new.parent_id::text);
 elsif new.parent_id is distinct from old.parent_id then refs:=array_append(refs,new.parent_id::text);end if;
 end if;
 if tg_table_name='bank_entries' then frefs:=array_append(frefs,new.id::text);refs:=array_append(refs,new.props->>'revisionId');end if;
 if v ? 'file_id' then frefs:=array_append(frefs,v->>'file_id');end if;
 if v ? 'commit_id' then frefs:=array_append(frefs,v->>'commit_id');end if;
 for x in select * from jsonb_array_elements(coalesce(v->'files','[]')) loop frefs:=array_append(frefs,x->>'id');end loop;
 for x in select * from jsonb_array_elements(coalesce(v#>'{document,items}','[]')) loop refs:=array_append(refs,x->>'revisionId');end loop;
 if v ? 'metadata' then
  -- Scan a copy only; NEW.metadata and every stored audit record stay intact.
  scan_metadata:=v->'metadata';
  if tg_table_schema='public' and tg_table_name='bank_catalog' and tg_op='INSERT' then
   select parent_catalog.metadata into inherited_metadata
   from public.bank_revisions child
   join public.bank_questions question on question.id=child.question_id
   join public.bank_revisions parent on parent.id=child.parent_id
    and parent.question_id=child.question_id and parent.committed
   join public.bank_catalog parent_catalog on parent_catalog.revision_id=parent.id
    and parent_catalog.question_id=child.question_id
    and parent_catalog.space_id=question.space_id
   where child.id=(v->>'revision_id')::uuid and not child.committed
    and child.question_id=(v->>'question_id')::uuid
    and question.space_id=(v->>'space_id')::uuid;
   if found then
    for audit_path in select p from (values
     (array['difficulty','assessment','revisionBinding','revisionId']),
     (array['difficulty','assessment','revisionBinding','fromRevisionId']),
     (array['difficulty','proofAdjustment','baseRevisionId'])
    ) allowed(p) loop
     audit_value:=scan_metadata#>audit_path;
     if jsonb_typeof(audit_value)='string'
      and audit_value is not distinct from inherited_metadata#>audit_path
      and exists(select 1 from public.bank_revision_prune_marks mark
       join public.bank_revisions audit_revision on audit_revision.id=mark.revision_id
       where mark.revision_id::text=audit_value#>>'{}'
        and audit_revision.question_id=(v->>'question_id')::uuid)
     then scan_metadata:=scan_metadata#-audit_path;end if;
    end loop;
   end if;
  end if;
 for x in select jsonb_path_query(scan_metadata,'$.**') loop
 if jsonb_typeof(x)='string' then
 if tg_op='UPDATE' then
 if not exists(select 1 from jsonb_path_query(coalesce(to_jsonb(old)->'metadata','{}'),'$.**') previous(value) where previous.value=x) then refs:=array_append(refs,x#>>'{}');end if;
 else refs:=array_append(refs,x#>>'{}');end if;
 end if;
 end loop;
 end if;
 if tg_table_schema='storage' and exists(select 1 from public.bank_question_deletions d,jsonb_array_elements(d.files) f where f->>'id'=any(frefs)) then raise sqlstate 'PT409' using message='삭제 중인 파일은 다시 업로드할 수 없습니다';end if;
 if exists(select 1 from public.bank_revision_prune_marks where revision_id::text=any(refs))
 or exists(select 1 from public.bank_revision_prunes j,jsonb_array_elements(j.plan->'files') f where f->>'id'=any(frefs))
 then raise sqlstate 'PT409' using message='Revision payload frozen or retired';end if;
 if tg_table_name='bank_question_deletions' and exists(select 1 from public.bank_revision_prune_marks m join public.bank_revisions r on r.id=m.revision_id join public.bank_revision_prunes j on j.id=m.job_id where r.question_id=(v->>'question_id')::uuid and not j.completed)
 then raise sqlstate 'PT409' using message='Revision retirement is still running';end if;
 return new;
end $function$
;
create or replace function public.bank_question_delete_write_guard() returns trigger
language plpgsql security definer set search_path='' as $fn$
declare v jsonb:=to_jsonb(new);s uuid;refs text[];
begin
 s:=nullif(v->>'space_id','')::uuid;
 if s is null and v ? 'question_id' then select space_id into s from public.bank_questions where id=(v->>'question_id')::uuid;end if;
 if s is null and v ? 'revision_id' then select q.space_id into s from public.bank_revisions r join public.bank_questions q on q.id=r.question_id where r.id=(v->>'revision_id')::uuid;end if;
 if s is null and v ? 'exam_id' then select space_id into s from public.bank_exam_drafts where id=(v->>'exam_id')::uuid;end if;
 if s is not null then perform pg_advisory_xact_lock(hashtextextended('revision-prune:'||s::text,0));end if;
 select coalesce(array_agg(distinct x#>>'{}'),'{}') into refs from jsonb_path_query(v,'$.**') x
 where jsonb_typeof(x)='string' and (x#>>'{}') ~ '^[0-9a-f]{8}-[0-9a-f-]{27}$';
 if exists(select 1 from public.bank_question_deletions d where
 d.question_id::text=any(refs) or d.revision_ids::text[] && refs
 or exists(select 1 from public.bank_revisions r where r.question_id=d.question_id and r.id::text=any(refs))
 or exists(select 1 from jsonb_array_elements(d.files) f where f->>'id'=any(refs)))
 then raise sqlstate 'PT409' using message='삭제 중이거나 삭제된 문항·버전·파일에는 새 작업이나 참조를 저장할 수 없습니다';end if;
 return new;
end $fn$;
revoke all on function public.bank_question_delete_write_guard() from public,anon,authenticated;

create or replace trigger bank_delete_write_freeze before insert or update on public.bank_questions for each row execute function public.bank_question_delete_write_guard();
create or replace trigger bank_delete_write_freeze before insert or update on public.bank_revisions for each row execute function public.bank_question_delete_write_guard();
create or replace trigger bank_delete_write_freeze before insert or update on public.bank_catalog for each row execute function public.bank_question_delete_write_guard();
create or replace trigger bank_delete_write_freeze before insert or update on public.bank_entries for each row execute function public.bank_question_delete_write_guard();
create or replace trigger bank_delete_write_freeze before insert or update on public.bank_revision_files for each row execute function public.bank_question_delete_write_guard();
create or replace trigger bank_delete_write_freeze before insert or update on public.bank_maintenance_items for each row execute function public.bank_question_delete_write_guard();
create or replace trigger bank_delete_write_freeze before insert or update on public.bank_image_transitions for each row execute function public.bank_question_delete_write_guard();
create or replace trigger bank_delete_write_freeze before insert or update on public.bank_revision_prune_marks for each row execute function public.bank_question_delete_write_guard();
create or replace trigger bank_delete_write_freeze before insert or update on public.bank_exam_drafts for each row execute function public.bank_question_delete_write_guard();
create or replace trigger bank_delete_write_freeze before insert or update on public.bank_exam_history for each row execute function public.bank_question_delete_write_guard();
create or replace trigger bank_delete_write_freeze before insert or update on public.bank_difficulty_ratings for each row execute function public.bank_question_delete_write_guard();
create or replace trigger bank_delete_write_freeze before insert or update on public.bank_scope_evidence for each row execute function public.bank_question_delete_write_guard();
create or replace trigger bank_delete_write_freeze before insert or update on public.bank_proposals for each row execute function public.bank_question_delete_write_guard();
create or replace trigger bank_delete_write_freeze before insert on public.bank_revision_prunes for each row execute function public.bank_question_delete_write_guard();
