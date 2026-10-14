begin;
-- Private derived files only. Originals, existing paper JSON/history and R2 keys are untouched.
create table bank_ops.pdf_objects(
 key text primary key, exam_id uuid not null, part text not null check(part in ('questions','answers')),
 fingerprint text not null, state text not null check(state in ('pending','active','garbage')),
 sha256 text, bytes bigint, created_at timestamptz not null default now(), delete_after timestamptz
);
create index pdf_objects_cleanup on bank_ops.pdf_objects(state,delete_after);
create table bank_ops.pdf_slots(
 exam_id uuid not null references public.bank_exam_drafts(id) on delete cascade,
 part text not null check(part in ('questions','answers')), active_key text, pending_key text,
 primary key(exam_id,part)
);
create table bank_ops.pdf_cleanup_config(singleton boolean primary key default true check(singleton), secret text not null);
insert into bank_ops.pdf_cleanup_config values(true,gen_random_uuid()::text||gen_random_uuid()::text);
alter table bank_ops.pdf_objects enable row level security;
alter table bank_ops.pdf_slots enable row level security;
alter table bank_ops.pdf_cleanup_config enable row level security;
revoke all on bank_ops.pdf_objects,bank_ops.pdf_slots,bank_ops.pdf_cleanup_config from public,anon,authenticated;

create function bank_ops.pdf_paper_removed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or new.archived_at is not null then
  update bank_ops.pdf_objects set state='garbage',delete_after=case when state='pending' then now()+interval '5 minutes' else now() end where exam_id=old.id;
  if tg_op<>'DELETE' then delete from bank_ops.pdf_slots where exam_id=old.id;end if;
 end if;
 return old;
end $$;
create trigger pdf_paper_removed after delete or update of archived_at on public.bank_exam_drafts for each row execute function bank_ops.pdf_paper_removed();

create function public.bank_paper_pdf_service(actor uuid,job jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<pdf>>
declare op text:=job->>'operation';s uuid;e uuid;part text;paper public.bank_exam_drafts;
 slot bank_ops.pdf_slots;obj bank_ops.pdf_objects;fingerprint text;shape jsonb;refs text;key text;old_key text;result jsonb;
begin
 -- Only the authenticated Edge gateway/service role can invoke this function.
 if op='gc' then
  if job->>'secret' is distinct from (select secret from bank_ops.pdf_cleanup_config where singleton) then raise insufficient_privilege;end if;
  update bank_ops.pdf_objects o set state='garbage',delete_after=case when o.state='pending' then now()+interval '5 minutes' else now() end
   where o.state<>'garbage' and (not exists(select 1 from public.bank_exam_drafts p where p.id=o.exam_id and p.archived_at is null and p.expires_at>now())
    or (o.state='pending' and o.created_at<now()-interval '30 minutes'));
  return (select coalesce(jsonb_agg(t.key),'[]') from (select pdf_objects.key from bank_ops.pdf_objects where state='garbage' and delete_after<=now() order by delete_after,pdf_objects.key limit 20) t);
 elsif op='gc_done' then
  delete from bank_ops.pdf_objects where pdf_objects.key=job->>'key' and state='garbage';return '{}'::jsonb;
 end if;
 if actor is null then raise insufficient_privilege;end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 s:=(job->>'spaceId')::uuid;e:=(job->>'paperId')::uuid;part:=job->>'part';
 if part is null or part not in ('questions','answers') or not public.bank_member(s) then raise insufficient_privilege;end if;
 select * into paper from public.bank_exam_drafts where id=e and space_id=s and owner_id=actor for update;
 if not found or paper.archived_at is not null or paper.expires_at<=now() or paper.document->>'kind' is distinct from 'past-paper-print'
  or not bank_grade.document_matches(s,paper.document) then raise insufficient_privilege;end if;
 if op='abort' then
  update bank_ops.pdf_objects set state='garbage',delete_after=case when state='pending' then now()+interval '5 minutes' else now() end where exam_id=e and pdf_objects.part=job->>'part' and pdf_objects.key=job->>'key' and state='pending';
  update bank_ops.pdf_slots set pending_key=null where exam_id=e and pdf_slots.part=job->>'part' and pending_key=job->>'key';return '{}'::jsonb;
 end if;
 if paper.version is distinct from (job->>'version')::int then raise exception '다른 화면에서 수정되었습니다. 최신 프린트를 다시 열어 주세요.' using errcode='PT409';end if;
 shape:=paper.document-'version'-'answerMode';
 if part='questions' then
  shape:=jsonb_set(shape,'{items}',(select jsonb_agg(i-'solutionSnapshot' order by n) from jsonb_array_elements(shape->'items') with ordinality x(i,n)));
 else shape:=shape||jsonb_build_object('answerMode',coalesce(paper.document->>'answerMode','quick'));end if;
 -- Detect in-place source corrections as well as saved revision/order/print changes.
 select string_agg(c.revision_id::text||md5(jsonb_build_array(c.content,c.metadata,c.files,c.confirmed)::text),',' order by c.revision_id) into refs
  from public.bank_catalog c where c.space_id=s and c.revision_id in (select (i->>'revisionId')::uuid from jsonb_array_elements(paper.document->'items') i);
 fingerprint:=md5('past-pdf-v1|'||part||'|'||shape::text||'|'||coalesce(refs,'')||'|'||coalesce((select identifier from bank_security.identities where space_id=s and user_id=actor),''));
 insert into bank_ops.pdf_slots(exam_id,part) values(e,pdf.part) on conflict do nothing;
 select * into slot from bank_ops.pdf_slots where exam_id=e and pdf_slots.part=job->>'part' for update;
 select * into obj from bank_ops.pdf_objects where pdf_objects.key=slot.active_key and state='active' and pdf_objects.fingerprint=pdf.fingerprint;
 result:=jsonb_build_object('hit',found,'fingerprint',fingerprint,'key',obj.key,'sha256',obj.sha256,'bytes',obj.bytes);
 if op='missing' then
  update bank_ops.pdf_objects set state='garbage',delete_after=now() where pdf_objects.key=slot.active_key;
  update bank_ops.pdf_slots set active_key=null where exam_id=e and pdf_slots.part=job->>'part';return jsonb_build_object('hit',false);
 end if;
 if op='status' then return result-'key'-'sha256'-'bytes';end if;
 if not exists(select 1 from bank_security.downloads d where d.id=(job->>'requestId')::uuid and d.space_id=s and d.user_id=actor and d.exam_id=e
  and d.format='pdf' and d.kind='exam' and d.state in ('requested','authorized') and d.requested_at>now()-interval '2 hours'
  and not exists(select 1 from jsonb_array_elements(paper.document->'items') i where not (i->>'revisionId')::uuid=any(d.revision_ids))
  and not exists(select 1 from unnest(d.revision_ids) r where not exists(select 1 from jsonb_array_elements(paper.document->'items') i where i->>'revisionId'=r::text))) then raise insufficient_privilege;end if;
 if op='read' then
  if obj.key is null then return result;end if;
  if not coalesce((public.bank_download_finish(s,(job->>'requestId')::uuid,true)->>'allowed')::boolean,false) then raise insufficient_privilege;end if;
  return result;
 elsif op='claim' then
  if obj.key is not null then return result;end if;
  if exists(select 1 from bank_ops.pdf_objects where pdf_objects.key=slot.pending_key and state='pending' and created_at>now()-interval '30 minutes') then
   raise exception '다른 화면에서 PDF를 생성 중입니다. 잠시 후 다시 받아 주세요.' using errcode='PT409';end if;
  update bank_ops.pdf_objects set state='garbage',delete_after=case when state='pending' then now()+interval '5 minutes' else now() end where pdf_objects.key=slot.pending_key and state='pending';
  key:=s::text||'/paper-pdf/'||e::text||'/'||part||'/'||gen_random_uuid()::text||'.pdf';
  insert into bank_ops.pdf_objects(key,exam_id,part,fingerprint,state) values(pdf.key,e,pdf.part,pdf.fingerprint,'pending');
  update bank_ops.pdf_slots set pending_key=pdf.key where exam_id=e and pdf_slots.part=job->>'part';
  return jsonb_build_object('hit',false,'key',key,'fingerprint',fingerprint);
 elsif op='upload' then
  select * into obj from bank_ops.pdf_objects where pdf_objects.key=slot.pending_key and pdf_objects.key=job->>'key' and state='pending'
   and pdf_objects.fingerprint=pdf.fingerprint and created_at>now()-interval '30 minutes';
  if not found then raise exception 'PDF 생성 중 구성이 변경되었습니다. 다시 생성해 주세요.' using errcode='PT409';end if;
  return jsonb_build_object('key',obj.key,'fingerprint',fingerprint);
 elsif op='commit' then
  if slot.active_key=job->>'key' and obj.key=slot.active_key then return result;end if;
  if not exists(select 1 from bank_ops.pdf_objects where pdf_objects.key=slot.pending_key and pdf_objects.key=job->>'key' and state='pending'
   and pdf_objects.fingerprint=pdf.fingerprint and created_at>now()-interval '30 minutes') then raise exception 'PDF 생성 중 구성이 변경되었습니다.' using errcode='PT409';end if;
  if coalesce(job->>'sha256','') !~ '^[a-f0-9]{64}$' or (job->>'bytes')::bigint not between 5 and 104857600 then raise exception 'PDF 파일을 확인하세요.';end if;
  if not coalesce((public.bank_download_finish(s,(job->>'requestId')::uuid,true)->>'allowed')::boolean,false) then raise insufficient_privilege;end if;
  old_key:=slot.active_key;
  update bank_ops.pdf_objects set state='active',sha256=job->>'sha256',bytes=(job->>'bytes')::bigint where pdf_objects.key=slot.pending_key;
  update bank_ops.pdf_slots set active_key=pending_key,pending_key=null where exam_id=e and pdf_slots.part=job->>'part';
  update bank_ops.pdf_objects set state='garbage',delete_after=case when state='pending' then now()+interval '5 minutes' else now() end where pdf_objects.key=old_key;
  return jsonb_build_object('stored',true,'obsolete',old_key);
 end if;
 raise exception '지원하지 않는 PDF 작업입니다.';
end $$;
revoke all on function bank_ops.pdf_paper_removed(),public.bank_paper_pdf_service(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.bank_paper_pdf_service(uuid,jsonb) to service_role;
commit;
