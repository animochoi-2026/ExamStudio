begin;
-- Separate image cache. Native history remains for read/expiry only.
create table bank_ops.image_pdf_revisions(revision_id uuid primary key,space_id uuid not null,fingerprint text not null);
alter table bank_ops.image_pdf_revisions enable row level security;
revoke all on bank_ops.image_pdf_revisions from public,anon,authenticated;
insert into bank_ops.image_pdf_revisions select revision_id,space_id,md5(jsonb_build_array(content,metadata,files,confirmed)::text) from public.bank_catalog;
create function bank_ops.image_pdf_revision_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then delete from bank_ops.image_pdf_revisions where revision_id=old.revision_id;return old;end if;
 insert into bank_ops.image_pdf_revisions values(new.revision_id,new.space_id,md5(jsonb_build_array(new.content,new.metadata,new.files,new.confirmed)::text)) on conflict(revision_id) do update set fingerprint=excluded.fingerprint,space_id=excluded.space_id;
 return new;
end $$;
revoke all on function bank_ops.image_pdf_revision_changed() from public,anon,authenticated;
create trigger image_pdf_revision_changed after insert or update of content,metadata,files,confirmed or delete on public.bank_catalog for each row execute function bank_ops.image_pdf_revision_changed();
create table bank_ops.image_pdf_slots(
 id uuid primary key default gen_random_uuid(),space_id uuid not null,actor_id uuid not null,
 parent_kind text not null check(parent_kind in('exam','mock','local')),parent_id uuid not null,
 variant text not null,part text not null,answer_mode text not null,watermark text not null,
 key text, fingerprint text,sha256 text,bytes bigint,etag text,pages integer,
 created_at timestamptz not null default now(),expires_at timestamptz not null,updated_at timestamptz,
 pending_id uuid,pending_fingerprint text,pending_request uuid,lease_until timestamptz,
 phase text check(phase in('generating','uploading','promoting')),deleted boolean not null default false,
 unique(space_id,actor_id,parent_kind,parent_id,variant,part,answer_mode,watermark)
);
create table bank_ops.image_pdf_gc(key text primary key,delete_after timestamptz not null default now());
alter table bank_ops.image_pdf_slots enable row level security;
alter table bank_ops.image_pdf_gc enable row level security;
revoke all on bank_ops.image_pdf_slots,bank_ops.image_pdf_gc from public,anon,authenticated;
create function bank_ops.image_pdf_removed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or (tg_table_name='bank_exam_drafts' and to_jsonb(new)->>'archived_at' is not null) then
  update bank_ops.image_pdf_slots set deleted=true where parent_id=old.id and parent_kind=case when tg_table_name='bank_mock_exams' then 'mock' else 'exam' end;
 end if;return old;
end $$;
create trigger image_pdf_removed after delete or update of archived_at on public.bank_exam_drafts for each row execute function bank_ops.image_pdf_removed();
create trigger image_pdf_removed after delete on public.bank_mock_exams for each row execute function bank_ops.image_pdf_removed();
create function public.bank_image_pdf_service(actor uuid,job jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
<<pdf>>
declare op text:=job->>'operation';s uuid;p uuid;kind text;part text;variant text;mode text;
 saved jsonb;shape jsonb;items jsonb;refs text;fingerprint text;identity text;expiry timestamptz;requested uuid;
 slot bank_ops.image_pdf_slots;ticket bank_security.downloads;result jsonb;key text;revision_ids uuid[];token uuid;prefix text;
begin
 if op in('outcome','rollback') then
  select * into slot from bank_ops.image_pdf_slots t where t.id=(job->>'slot')::uuid and t.actor_id=actor for update;
  if not found then raise insufficient_privilege;end if;
  if op='rollback' and slot.phase='promoting' and slot.pending_id=(job->>'token')::uuid then
   update bank_ops.image_pdf_slots set phase='generating',lease_until=now() where id=slot.id;
  end if;
  return jsonb_build_object('sha256',slot.sha256,'phase',slot.phase,'expiresAt',slot.expires_at,'key',slot.key);
 end if;
 if op in('gc','recover','recovered','gc_done') then
  if job->>'secret' is distinct from(select secret from bank_ops.pdf_cleanup_config where singleton) then raise insufficient_privilege;end if;
  if op='gc_done' then delete from bank_ops.image_pdf_gc g where g.key=job->>'key';return '{}'::jsonb;end if;
  if op='recover' then return(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from(select * from bank_ops.image_pdf_slots where phase='promoting' and lease_until<now() limit 10)t);end if;
  if op='recovered' then
   update bank_ops.image_pdf_slots set phase='generating' where id=(job->>'slot')::uuid and pending_id=(job->>'token')::uuid and phase='promoting' and lease_until<now();
  end if;
  -- Never race an active upload/promotion. Abandoned work is collected after its lease.
  for slot in select * from bank_ops.image_pdf_slots where phase is distinct from 'promoting' and (lease_until is null or lease_until<now()) and (deleted or expires_at<=now() or pending_id is not null) for update loop
   prefix:=slot.space_id::text||'/image-pdf/'||slot.id::text||'/';
   if slot.pending_id is not null then
    insert into bank_ops.image_pdf_gc(key) values(prefix||slot.pending_id::text||'.tmp.pdf'),(prefix||slot.pending_id::text||'.bak.pdf') on conflict do nothing;
   end if;
   if slot.deleted or slot.expires_at<=now() then
    insert into bank_ops.image_pdf_gc(key) values(slot.key) on conflict do nothing;
    delete from bank_ops.image_pdf_slots where id=slot.id;
   else update bank_ops.image_pdf_slots set pending_id=null,phase=null,lease_until=null where id=slot.id;end if;
  end loop;
  return(select coalesce(jsonb_agg(g.key),'[]') from(select * from bank_ops.image_pdf_gc where delete_after<=now() limit 30)g);
 end if;
 if actor is null then raise insufficient_privilege;end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 s:=(job->>'spaceId')::uuid;p:=(job->>'paperId')::uuid;kind:=job->>'kind';part:=job->>'part';variant:=coalesce(job->>'variant','');mode:=coalesce(job->>'answerMode','quick');requested:=(job->>'requestId')::uuid;
 if not public.bank_member(s) or kind is null or kind not in('exam','mock','local') or part is null or part not in('all','questions','answers') or mode not in('quick','detailed') or length(variant)>100 or p is null then raise insufficient_privilege;end if;
 if job->>'engine' is distinct from 'browser-image-png3-v1' then raise exception 'PDF 생성기 버전이 변경됐습니다. 새로고침하세요.';end if;
 if kind='exam' then
  saved:=public.bank_exam_get(s,p);
  select least(e.expires_at,e.created_at+interval '6 months') into expiry from public.bank_exam_drafts e where e.id=p and e.space_id=s and e.archived_at is null;
 elsif kind='mock' then
  saved:=public.bank_mock_get(s,p);
  select least(e.expires_at,e.created_at+interval '6 months') into expiry from public.bank_mock_exams e where e.id=p and e.space_id=s;
 end if;
 if kind<>'local' and (saved is null or expiry is null or expiry<=now()) then raise insufficient_privilege;end if;
 if saved is not null then
  if (saved->>'version')::int is distinct from (job->>'version')::int then raise exception '시험지가 수정됐습니다. 최신 저장본을 다시 열어 주세요.' using errcode='PT409';end if;
  shape:=saved->'document';
  if kind='mock' then
   select v->'paper' into shape from jsonb_array_elements(shape->'variants') v where v->>'id'=variant;
   if shape is null then raise insufficient_privilege;end if;
  end if;
 else
  shape:=job->'document';expiry:=least(now(),coalesce(nullif(shape->>'createdAt','')::timestamptz,now()))+interval '6 months';
 end if;
 -- Unsaved output settings are explicit and user-isolated. Saved library requests
 -- omit this override and can only hit the signature of the actual saved record.
 if job ? 'document' then
  if jsonb_typeof(job->'document')<>'object' or octet_length((job->'document')::text)>1048576 then raise exception '출력 설정 크기 오류';end if;
  shape:=job->'document';
 end if;
 if shape is null or jsonb_typeof(shape)<>'object' then raise exception '출력할 문서가 없습니다.';end if;
 items:=coalesce(shape->'items','[]'::jsonb);
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)>1000 then raise exception '출력 문항 수 오류';end if;
 select coalesce(array_agg(distinct (i->>'revisionId')::uuid),'{}') into revision_ids from jsonb_array_elements(items) i where i->>'revisionId' is not null;
 select * into ticket from bank_security.downloads d where d.id=requested and d.space_id=s and d.user_id=actor and d.format='pdf'
  and d.state in ('requested','authorized') and d.requested_at>now()-interval '2 hours'
  and (case when pdf.kind='local' then d.exam_id is null else d.exam_id=p end)
  and (pdf.kind='local' or d.kind=pdf.kind);
 if not found or not revision_ids<@ticket.revision_ids or not ticket.revision_ids<@revision_ids then raise insufficient_privilege;end if;
 select identifier into identity from bank_security.identities where space_id=s and user_id=actor;
 if identity is null then raise insufficient_privilege;end if;
 shape:=shape-'version'-'id'-'updatedAt'-'status'-'answerMode'-'pdfSection'-'autoTitle';
 if part='questions' then
  shape:=jsonb_set(shape,'{items}',coalesce((select jsonb_agg(i-'solutionSnapshot' order by n) from jsonb_array_elements(items) with ordinality a(i,n)),'[]'::jsonb));mode:='quick';
 end if;
 select string_agg(c.revision_id::text||c.fingerprint,',' order by c.revision_id) into refs from bank_ops.image_pdf_revisions c where c.space_id=s and c.revision_id=any(revision_ids);
 fingerprint:=md5('browser-image-png3-v1|'||shape::text||'|'||part||'|'||mode||'|'||identity||'|'||coalesce(refs,''));

 insert into bank_ops.image_pdf_slots(space_id,actor_id,parent_kind,parent_id,variant,part,answer_mode,watermark,expires_at)
 values(s,actor,kind,p,variant,part,mode,md5(identity),expiry) on conflict do nothing;
 select * into slot from bank_ops.image_pdf_slots t where t.space_id=s and t.actor_id=actor and t.parent_kind=kind and t.parent_id=p and t.variant=pdf.variant and t.part=pdf.part and t.answer_mode=mode and t.watermark=md5(identity) for update;
 if slot.deleted or slot.expires_at<=now() then raise exception 'PDF 보관 기간이 지났습니다.';end if;
 prefix:=s::text||'/image-pdf/'||slot.id::text||'/';key:=prefix||'current.pdf';
 update bank_ops.image_pdf_slots set key=pdf.key where id=slot.id and image_pdf_slots.key is null;
 result:=jsonb_build_object('hit',slot.sha256 is not null and slot.fingerprint=fingerprint and slot.phase is distinct from 'promoting','key',key,'sha256',slot.sha256,'bytes',slot.bytes,'etag',slot.etag,'pages',slot.pages,'expiresAt',slot.expires_at,'createdAt',slot.created_at,'fingerprint',fingerprint,'previous',slot.sha256 is not null);
 if op in('claim','read') and slot.sha256 is null and not coalesce((job->>'force')::boolean,false) then
  -- Read-only transition: never claim/render/upload through the retired engine.
  saved:=public.bank_native_pdf_service(actor,job||jsonb_build_object('engine','chromium-vector-v2-noto-1','operation','read'));
  if coalesce((saved->>'hit')::boolean,false) then return saved||jsonb_build_object('legacy',true,'expiresAt',slot.expires_at);end if;
 end if;
 if op in('read','read_previous') then
  if op='read_previous' then result:=result||jsonb_build_object('hit',slot.sha256 is not null and slot.phase is distinct from 'promoting','stale',slot.fingerprint is distinct from fingerprint);end if;
  if (result->>'hit')::boolean and not coalesce((public.bank_download_finish(s,requested,true)->>'allowed')::boolean,false) then raise insufficient_privilege;end if;
  return result;
 elsif op='claim' then
  if (result->>'hit')::boolean and not coalesce((job->>'force')::boolean,false) then return result;end if;
  if slot.phase='promoting' or slot.lease_until>now() then return result||jsonb_build_object('hit',false,'busy',true);end if;
  if slot.pending_id is not null then insert into bank_ops.image_pdf_gc(key) values(prefix||slot.pending_id::text||'.tmp.pdf'),(prefix||slot.pending_id::text||'.bak.pdf') on conflict do nothing;end if;
  token:=gen_random_uuid();
  update bank_ops.image_pdf_slots set pending_id=token,pending_request=requested,pending_fingerprint=pdf.fingerprint,phase='generating',lease_until=now()+interval '3 minutes' where id=slot.id;
  return result||jsonb_build_object('hit',false,'token',token,'tempKey',prefix||token::text||'.tmp.pdf','backupKey',prefix||token::text||'.bak.pdf');
 end if;
 if slot.pending_id is distinct from (job->>'token')::uuid or slot.pending_request is distinct from requested then raise exception 'PDF 작업이 만료됐습니다. 다시 시도하세요.' using errcode='PT409';end if;
 if op='abort' then
  if slot.phase='promoting' then
   update bank_ops.image_pdf_slots set pending_fingerprint=null where id=slot.id;
   return jsonb_build_object('recovering',true);
  end if;
  insert into bank_ops.image_pdf_gc(key,delete_after) values(prefix||slot.pending_id::text||'.tmp.pdf',now()+interval '10 minutes'),(prefix||slot.pending_id::text||'.bak.pdf',now()+interval '10 minutes') on conflict do nothing;
  update bank_ops.image_pdf_slots set pending_id=null,phase=null,lease_until=null where id=slot.id;return '{}'::jsonb;
 end if;
 if slot.pending_fingerprint is distinct from fingerprint or slot.lease_until<=now() then raise exception 'PDF 생성 중 시험지가 변경됐거나 시간이 지났습니다.' using errcode='PT409';end if;
 if op='heartbeat' then
  update bank_ops.image_pdf_slots set lease_until=now()+interval '3 minutes' where id=slot.id and phase='generating';return '{}'::jsonb;
 elsif op='upload' then
  if slot.phase<>'generating' then raise exception '이미 업로드 중입니다.';end if;
  update bank_ops.image_pdf_slots set phase='uploading',lease_until=now()+interval '10 minutes' where id=slot.id;
 elsif op='promote' then
  if slot.phase<>'uploading' then raise exception '이미 파일 확인 중입니다.';end if;
  update bank_ops.image_pdf_slots set phase='promoting',lease_until=now()+interval '5 minutes' where id=slot.id;
 elsif op='commit' then
  if slot.phase<>'promoting' or coalesce(job->>'sha256','') !~ '^[a-f0-9]{64}$' or (job->>'bytes')::bigint not between 100 and 104857600 or (job->>'pages')::integer not between 1 and 2000 then raise exception 'PDF 파일 검증 실패';end if;
  if not coalesce((public.bank_download_finish(s,requested,true)->>'allowed')::boolean,false) then raise insufficient_privilege;end if;
  update bank_ops.image_pdf_slots set fingerprint=pdf.fingerprint,sha256=job->>'sha256',bytes=(job->>'bytes')::bigint,etag=job->>'etag',pages=(job->>'pages')::integer,updated_at=now(),pending_id=null,phase=null,lease_until=null where id=slot.id;
  insert into bank_ops.image_pdf_gc(key) values(prefix||slot.pending_id::text||'.tmp.pdf'),(prefix||slot.pending_id::text||'.bak.pdf') on conflict do nothing;
  -- Only superseded PDF derivatives are removed. Originals are never touched.
  update bank_ops.native_pdf_objects o set state='garbage',delete_after=now() where slot_id in(select n.id from bank_ops.native_pdf_slots n where n.space_id=s and n.actor_id=actor and n.parent_kind=kind and n.parent_id=p and n.variant=pdf.variant and n.part=pdf.part and n.answer_mode=mode);
  return jsonb_build_object('stored',true,'key',key,'expiresAt',slot.expires_at);
 else raise exception '지원하지 않는 PDF 작업입니다.';end if;
 return result||jsonb_build_object('tempKey',prefix||slot.pending_id::text||'.tmp.pdf','backupKey',prefix||slot.pending_id::text||'.bak.pdf');
end $$;
revoke all on function bank_ops.image_pdf_removed(),public.bank_image_pdf_service(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.bank_image_pdf_service(uuid,jsonb) to service_role;
do $schedule$
begin
 if to_regnamespace('cron') is not null then
  perform cron.schedule('examstudio-image-pdf-cleanup','* * * * *',$job$
   select net.http_post(url:='https://bjxxqdbftefughjkcrqj.supabase.co/functions/v1/bank-image-pdf',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:=jsonb_build_object('job',jsonb_build_object('operation','cleanup','secret',(select secret from bank_ops.pdf_cleanup_config where singleton))),timeout_milliseconds:=60000);
  $job$);
 end if;
end $schedule$;
commit;
