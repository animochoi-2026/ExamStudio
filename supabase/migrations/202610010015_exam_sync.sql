-- Keep each teacher's print layout on the server. Existing exam IDs and history stay intact.
create index if not exists bank_exam_owner_recent on public.bank_exam_drafts(space_id,owner_id,updated_at desc,id);

create or replace function public.bank_exam_save(s uuid,e uuid,expected integer,doc jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old public.bank_exam_drafts; i jsonb; v integer; clean jsonb;
begin
 if not public.bank_member(s) then raise insufficient_privilege; end if;
 if e is null or expected is null or expected<0 or jsonb_typeof(doc)<>'object'
    or jsonb_typeof(doc->'items') is distinct from 'array'
    or jsonb_array_length(doc->'items')>100 or length(doc::text)>1000000
    or length(coalesce(doc->>'title','')) not between 1 and 200
    or coalesce(doc->>'status','draft') not in ('draft','completed')
    or coalesce(doc->>'answerMode','quick') not in ('quick','detailed')
    or (doc ? 'id' and doc->>'id' is distinct from e::text) then raise exception '시험지 형식 오류' using errcode='22023'; end if;
 if (select count(distinct x->>'questionId') from jsonb_array_elements(doc->'items') x)<>jsonb_array_length(doc->'items') then raise exception '같은 문항을 중복 담을 수 없습니다' using errcode='22023';end if;
 if doc ? 'print' and (doc#>>'{print,paper}' is distinct from 'A4' or (doc#>>'{print,columns}')::integer is distinct from 2) then raise exception '지원하지 않는 인쇄 양식입니다' using errcode='22023';end if;
 for i in select * from jsonb_array_elements(doc->'items') loop
  if coalesce((i->>'workspaceMm')::numeric,0) not between 0 and 200
     or coalesce(i->>'breakBefore','') not in ('','page','column')
     or not exists(select 1 from public.bank_catalog c where c.space_id=s and c.question_id=(i->>'questionId')::uuid and c.revision_id=(i->>'revisionId')::uuid and public.bank_read_revision(c.revision_id))
  then raise exception '문항 버전·배치 또는 접근 권한을 확인하세요' using errcode='42501';end if;
 end loop;
 clean:=doc - 'version';
 perform pg_advisory_xact_lock(hashtextextended(e::text,0));
 select * into old from public.bank_exam_drafts where id=e for update;
 if found then
  if old.owner_id<>auth.uid() or old.space_id<>s then raise insufficient_privilege;end if;
  -- A lost response can resend an already committed snapshot. It must not make another history row.
  if old.version<>expected then
   if old.version=expected+1 and old.document - 'version'=clean then return jsonb_build_object('id',e,'version',old.version,'updatedAt',old.updated_at,'replayed',true);end if;
   raise exception '다른 기기에서 시험지를 수정했습니다. 최신본을 확인하거나 별도 사본으로 저장하세요.' using errcode='PT409';
  end if;
  if old.document - 'version'=clean then return jsonb_build_object('id',e,'version',old.version,'updatedAt',old.updated_at,'unchanged',true);end if;
  v:=old.version+1;
  update public.bank_exam_drafts set title=doc->>'title',document=clean,version=v,updated_at=now() where id=e returning updated_at into old.updated_at;
 else
  if expected<>0 then raise exception '시험지 버전이 없습니다' using errcode='PT409';end if;v:=1;
  insert into public.bank_exam_drafts(id,space_id,title,document) values(e,s,doc->>'title',clean) returning updated_at into old.updated_at;
 end if;
 insert into public.bank_exam_history(exam_id,version,actor_id,document) values(e,v,auth.uid(),clean);
 return jsonb_build_object('id',e,'version',v,'updatedAt',old.updated_at);
end $$;

create function public.bank_exam_list(s uuid,start_at integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
  select e.id,e.title,e.version,e.created_at,e.updated_at,
   coalesce(e.document->>'status','draft') status,jsonb_array_length(e.document->'items') item_count,
   (select f from public.bank_catalog c cross join lateral jsonb_array_elements(c.files) f
    where c.revision_id=(e.document#>>'{items,0,revisionId}')::uuid and c.space_id=s and f->>'role'='preview'
      and public.bank_read_revision(c.revision_id) limit 1) preview
  from public.bank_exam_drafts e where e.space_id=s and e.owner_id=auth.uid()
  order by e.updated_at desc,e.id limit 30 offset greatest(0,start_at)
 ) x),'[]'::jsonb);
end $$;

create function public.bank_exam_get(s uuid,e uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare found_exam public.bank_exam_drafts;
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 select * into found_exam from public.bank_exam_drafts where id=e and space_id=s and owner_id=auth.uid();
 if not found then raise insufficient_privilege;end if;
 return jsonb_build_object('id',found_exam.id,'title',found_exam.title,'version',found_exam.version,
  'created_at',found_exam.created_at,'updated_at',found_exam.updated_at,'document',found_exam.document);
end $$;

create function public.bank_exam_latest(s uuid,q uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare current_id uuid;
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 select c.revision_id into current_id from public.bank_catalog c
 join public.bank_revisions r on r.id=c.revision_id
 join public.bank_questions b on b.id=c.question_id
 where c.space_id=s and c.question_id=q and r.committed and not b.archived and public.bank_read_revision(c.revision_id)
 order by c.created_at desc,c.revision_id desc limit 1;
 return current_id;
end $$;

revoke execute on function public.bank_exam_list(uuid,integer),public.bank_exam_get(uuid,uuid),public.bank_exam_latest(uuid,uuid) from public,anon;
grant execute on function public.bank_exam_list(uuid,integer),public.bank_exam_get(uuid,uuid),public.bank_exam_latest(uuid,uuid) to authenticated;
