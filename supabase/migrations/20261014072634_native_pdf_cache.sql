begin;
create table bank_ops.native_pdf_renderer_config(singleton boolean primary key default true check(singleton),url text,secret text not null default(gen_random_uuid()::text||gen_random_uuid()::text));
insert into bank_ops.native_pdf_renderer_config(singleton) values(true);
alter table bank_ops.native_pdf_renderer_config enable row level security;
revoke all on bank_ops.native_pdf_renderer_config from public,anon,authenticated;
create table bank_ops.native_pdf_slots(
 id uuid primary key default gen_random_uuid(), space_id uuid not null, actor_id uuid not null,
 parent_kind text not null check(parent_kind in ('exam','mock','local')), parent_id uuid not null,
 variant text not null default '', part text not null check(part in ('all','questions','answers')),
 answer_mode text not null, active_key text, pending_key text,
 expires_at timestamptz not null default (now()+interval '6 months'),
 unique(space_id,actor_id,parent_kind,parent_id,variant,part,answer_mode)
);
create table bank_ops.native_pdf_objects(
 key text primary key, slot_id uuid not null, fingerprint text not null, request_id uuid not null,
 state text not null check(state in ('pending','rendering','active','garbage')),
 created_at timestamptz not null default now(), delete_after timestamptz, bytes bigint, sha256 text
);
create index native_pdf_cleanup on bank_ops.native_pdf_objects(state,delete_after);
create index native_pdf_parent on bank_ops.native_pdf_slots(parent_kind,parent_id);
alter table bank_ops.native_pdf_slots enable row level security;
alter table bank_ops.native_pdf_objects enable row level security;
revoke all on bank_ops.native_pdf_slots,bank_ops.native_pdf_objects from public,anon,authenticated;

create function bank_ops.native_pdf_removed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or (tg_table_name='bank_exam_drafts' and to_jsonb(new)->>'archived_at' is not null) then
  update bank_ops.native_pdf_objects o set state='garbage',delete_after=case when o.state in ('pending','rendering') then now()+interval '5 minutes' else now() end
   where slot_id in(select id from bank_ops.native_pdf_slots where parent_id=old.id and parent_kind=case when tg_table_name='bank_mock_exams' then 'mock' else 'exam' end);
  delete from bank_ops.native_pdf_slots where parent_id=old.id and parent_kind=case when tg_table_name='bank_mock_exams' then 'mock' else 'exam' end;
 end if;return old;
end $$;
create trigger native_pdf_removed after delete or update of archived_at on public.bank_exam_drafts for each row execute function bank_ops.native_pdf_removed();
create trigger native_pdf_removed after delete on public.bank_mock_exams for each row execute function bank_ops.native_pdf_removed();

create function public.bank_native_pdf_service(actor uuid,job jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
<<pdf>>
declare op text:=job->>'operation';s uuid;p uuid;kind text;part text;variant text;mode text;
 saved jsonb;shape jsonb;items jsonb;refs text;fingerprint text;identity text;expiry timestamptz;requested uuid;
 slot bank_ops.native_pdf_slots;obj bank_ops.native_pdf_objects;ticket bank_security.downloads;
 result jsonb;key text;old_key text;revision_ids uuid[];
begin
 if op='renderer_config' then return (select jsonb_build_object('url',url,'secret',secret) from bank_ops.native_pdf_renderer_config where singleton);end if;
 if op='gc' then
  if job->>'secret' is distinct from (select secret from bank_ops.pdf_cleanup_config where singleton) then raise insufficient_privilege;end if;
  update bank_ops.native_pdf_objects o set state='garbage',delete_after=case when o.state in ('pending','rendering') then now()+interval '5 minutes' else now() end
   where state<>'garbage' and (not exists(select 1 from bank_ops.native_pdf_slots t where t.id=o.slot_id and t.expires_at>now()) or (o.state in ('pending','rendering') and o.created_at<now()-interval '10 minutes'));
  delete from bank_ops.native_pdf_slots where expires_at<=now();
  return (select coalesce(jsonb_agg(t.key),'[]') from(select o.key from bank_ops.native_pdf_objects o where o.state='garbage' and o.delete_after<=now() order by o.delete_after,o.key limit 30)t);
 elsif op='gc_done' then
  delete from bank_ops.native_pdf_objects o where o.key=job->>'key' and o.state='garbage';return '{}'::jsonb;
 end if;
 if actor is null then raise insufficient_privilege;end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 s:=(job->>'spaceId')::uuid;p:=(job->>'paperId')::uuid;kind:=job->>'kind';part:=job->>'part';variant:=coalesce(job->>'variant','');mode:=coalesce(job->>'answerMode','quick');requested:=(job->>'requestId')::uuid;
 if not public.bank_member(s) or kind is null or kind not in('exam','mock','local') or part is null or part not in('all','questions','answers') or mode not in('quick','detailed') or length(variant)>100 or p is null then raise insufficient_privilege;end if;
 if job->>'engine' is distinct from 'chromium-vector-v2-noto-1' then raise exception 'PDF 생성기 버전이 변경됐습니다. 새로고침하세요.';end if;
 if kind='exam' then
  saved:=public.bank_exam_get(s,p);
  select e.expires_at into expiry from public.bank_exam_drafts e where e.id=p and e.space_id=s and e.archived_at is null;
 elsif kind='mock' then
  saved:=public.bank_mock_get(s,p);
  select e.expires_at into expiry from public.bank_mock_exams e where e.id=p and e.space_id=s;
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
  shape:=job->'document';expiry:=now()+interval '6 months';
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
 shape:=shape-'version'-'id'-'updatedAt'-'status'-'answerMode';
 if part='questions' then
  shape:=jsonb_set(shape,'{items}',coalesce((select jsonb_agg(i-'solutionSnapshot' order by n) from jsonb_array_elements(items) with ordinality a(i,n)),'[]'::jsonb));mode:='quick';
 end if;
 select string_agg(c.revision_id::text||md5(jsonb_build_array(c.content,c.metadata,c.files,c.confirmed)::text),',' order by c.revision_id) into refs from public.bank_catalog c where c.space_id=s and c.revision_id=any(revision_ids);
 fingerprint:=md5('chromium-vector-v2-noto-1|'||shape::text||'|'||part||'|'||mode||'|'||identity||'|'||coalesce(refs,''));
 insert into bank_ops.native_pdf_slots(space_id,actor_id,parent_kind,parent_id,variant,part,answer_mode,expires_at) values(s,actor,kind,p,variant,part,mode,expiry) on conflict do nothing;
 select * into slot from bank_ops.native_pdf_slots t where t.space_id=s and t.actor_id=actor and t.parent_kind=kind and t.parent_id=p and t.variant=pdf.variant and t.part=pdf.part and t.answer_mode=mode for update;
 if slot.expires_at<=now() then raise exception 'PDF 보관 기간이 지났습니다.';end if;
 if op='abort' then
  update bank_ops.native_pdf_objects o set state='garbage',delete_after=now()+interval '5 minutes' where o.key=job->>'key' and o.slot_id=slot.id and o.request_id=requested and o.state in ('pending','rendering');
  update bank_ops.native_pdf_slots set pending_key=null where id=slot.id and pending_key=job->>'key';return '{}'::jsonb;
 end if;
 select * into obj from bank_ops.native_pdf_objects o where o.key=slot.active_key and o.state='active' and o.fingerprint=pdf.fingerprint;
 result:=jsonb_build_object('hit',found,'fingerprint',fingerprint,'key',obj.key,'sha256',obj.sha256,'bytes',obj.bytes);
 if op='read' then
  if obj.key is not null and not coalesce((public.bank_download_finish(s,requested,true)->>'allowed')::boolean,false) then raise insufficient_privilege;end if;return result;
 elsif op='missing' then
  update bank_ops.native_pdf_objects o set state='garbage',delete_after=now() where o.key=slot.active_key;
  update bank_ops.native_pdf_slots set active_key=null where id=slot.id;return jsonb_build_object('hit',false);
 elsif op='claim' then
  if obj.key is not null then return result;end if;
  if exists(select 1 from bank_ops.native_pdf_objects o where o.key=slot.pending_key and o.state in('pending','rendering') and o.created_at>now()-interval '10 minutes') then return jsonb_build_object('hit',false,'busy',true);end if;
  update bank_ops.native_pdf_objects o set state='garbage',delete_after=now()+interval '5 minutes' where o.key=slot.pending_key and o.state in('pending','rendering');
  key:=s::text||'/native-pdf/'||slot.id::text||'/'||gen_random_uuid()::text||'.pdf';
  insert into bank_ops.native_pdf_objects(key,slot_id,fingerprint,request_id,state) values(key,slot.id,fingerprint,requested,'pending');
  update bank_ops.native_pdf_slots set pending_key=key where id=slot.id;return jsonb_build_object('hit',false,'key',key);
 elsif op in('render','upload','commit') then
  select * into obj from bank_ops.native_pdf_objects o where o.key=slot.pending_key and o.key=job->>'key' and o.request_id=requested and o.fingerprint=pdf.fingerprint and o.state in('pending','rendering') and o.created_at>now()-interval '10 minutes';
  if not found then raise exception 'PDF 생성 중 구성이 변경됐거나 시간이 지났습니다. 다시 시도하세요.' using errcode='PT409';end if;
  if op='render' then
   if obj.state<>'pending' then raise exception '이미 PDF 생성 중입니다.' using errcode='PT409';end if;
   update bank_ops.native_pdf_objects o set state='rendering' where o.key=obj.key;
   return jsonb_build_object('key',obj.key,'identity',identity,'questionCount',coalesce((shape->>'questionCount')::int,jsonb_array_length(items)));
  elsif op='upload' then return jsonb_build_object('key',obj.key);
  end if;
  if coalesce(job->>'sha256','') !~ '^[a-f0-9]{64}$' or (job->>'bytes')::bigint not between 100 and 104857600 then raise exception 'PDF 파일 검증 실패';end if;
  if not coalesce((public.bank_download_finish(s,requested,true)->>'allowed')::boolean,false) then raise insufficient_privilege;end if;
  old_key:=slot.active_key;update bank_ops.native_pdf_objects o set state='active',sha256=job->>'sha256',bytes=(job->>'bytes')::bigint where o.key=obj.key;
  update bank_ops.native_pdf_slots set active_key=obj.key,pending_key=null where id=slot.id;
  update bank_ops.native_pdf_objects o set state='garbage',delete_after=now() where o.key=old_key;
  return jsonb_build_object('stored',true,'obsolete',old_key);
 end if;
 raise exception '지원하지 않는 PDF 작업입니다.';
end $$;
revoke all on function bank_ops.native_pdf_removed(),public.bank_native_pdf_service(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.bank_native_pdf_service(uuid,jsonb) to service_role;
commit;
