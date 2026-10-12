CREATE OR REPLACE FUNCTION public.bank_exam_save(s uuid, e uuid, expected integer, doc jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old public.bank_exam_drafts; i jsonb; v integer; clean jsonb; past boolean:=coalesce(doc->>'kind','')='past-paper-print';
begin
 if not public.bank_member(s) then raise insufficient_privilege; end if;
 if e is null or expected is null or expected<0 or jsonb_typeof(doc)<>'object'
    or jsonb_typeof(doc->'items') is distinct from 'array'
    or (not past and (jsonb_array_length(doc->'items')>100 or length(doc::text)>1000000))
    or length(coalesce(doc->>'title','')) not between 1 and 200
    or coalesce(doc->>'status','draft') not in ('draft','completed')
    or coalesce(doc->>'answerMode','quick') not in ('quick','detailed')
    or (doc ? 'id' and doc->>'id' is distinct from e::text) then raise exception '시험지 형식 오류' using errcode='22023'; end if;
 if not past and (select count(distinct x->>'questionId') from jsonb_array_elements(doc->'items') x)<>jsonb_array_length(doc->'items') then raise exception '같은 문항을 중복 담을 수 없습니다' using errcode='22023';end if;
 if past and (jsonb_typeof(doc->'pastPrint') is distinct from 'object'
    or jsonb_typeof(doc#>'{pastPrint,sourceIds}') is distinct from 'array'
    or jsonb_typeof(doc#>'{rules,units}') is distinct from 'array'
    or coalesce(doc#>>'{pastPrint,from}','') !~ '^[0-9]{4}$' or coalesce(doc#>>'{pastPrint,to}','') !~ '^[0-9]{4}$'
    or (doc#>>'{pastPrint,from}')::int>(doc#>>'{pastPrint,to}')::int)
 then raise exception '기출프린트 설정을 확인하세요.' using errcode='22023';end if;
 if doc ? 'print' and (doc#>>'{print,paper}' is distinct from 'A4' or (doc#>>'{print,columns}')::integer is distinct from 2) then raise exception '지원하지 않는 인쇄 양식입니다' using errcode='22023';end if;
 for i in select * from jsonb_array_elements(doc->'items') loop
  if past and (coalesce(i->>'year','') !~ '^[0-9]{4}$'
    or (i->>'year')::int not between (doc#>>'{pastPrint,from}')::int and (doc#>>'{pastPrint,to}')::int
    or not (doc#>'{pastPrint,sourceIds}' ? (i->>'sourceId'))
    or not exists(select 1 from public.bank_catalog c where c.space_id=s and c.revision_id=(i->>'revisionId')::uuid
      and c.metadata#>>'{source,documentId}'=i->>'sourceId' and c.metadata#>>'{source,academicYear}'=i->>'year'))
  then raise exception '기출프린트의 원본 시험지 연결을 확인하세요.' using errcode='22023';end if;
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
  if old.archived_at is not null then raise exception '삭제한 시험지는 복구한 뒤 수정하세요.' using errcode='PT409';end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION public.bank_download_begin(s uuid, request_id uuid, fmt text, revisions uuid[], request_kind text DEFAULT 'exam'::text, paper_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 declare old bank_security.downloads;ids uuid[];questions uuid[];sources text[];code text;begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if not exists(select 1 from bank_security.settings where space_id=s) then raise exception '다운로드 설정을 확인할 수 없습니다.';end if;
 if fmt is null or request_kind is null or request_id is null or array_position(revisions,null) is not null or fmt not in ('pdf','docx','hwpx','backup') or request_kind not in ('question','exam','mock','backup','local') or (cardinality(revisions)>(case when fmt='backup' and public.bank_member(s,true) then 100000 else 1000 end) and not (
 fmt='pdf' and request_kind='exam' and exists(select 1 from public.bank_exam_drafts e
 where e.id=paper_id and e.space_id=s and e.owner_id=auth.uid() and e.archived_at is null and e.document->>'kind'='past-paper-print'
 and not exists(select 1 from unnest(revisions) r where not exists(select 1 from jsonb_array_elements(e.document->'items') i where i->>'revisionId'=r::text))
 and not exists(select 1 from jsonb_array_elements(e.document->'items') i where not (i->>'revisionId')::uuid=any(revisions))
 ))) or revisions is null then raise exception '다운로드 요청을 확인하세요.';end if;
 select coalesce(array_agg(distinct x order by x),'{}') into ids from unnest(revisions) x where x is not null;
 if cardinality(ids)=0 and request_kind<>'local' then raise exception '출력 문항이 없습니다.';end if;
 if exists(select 1 from unnest(ids) id where not exists(select 1 from public.bank_catalog c where c.space_id=s and c.revision_id=id and public.bank_read_revision(id))) then raise insufficient_privilege;end if;
 if paper_id is not null and not exists(select 1 from public.bank_exam_drafts where id=paper_id and space_id=s and owner_id=auth.uid()) and not exists(select 1 from public.bank_mock_exams where id=paper_id and space_id=s and owner_id=auth.uid()) then raise insufficient_privilege;end if;
 perform 1 from public.bank_spaces where id=s for share;
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 insert into bank_security.accounts(space_id,user_id) values(s,auth.uid()) on conflict do nothing;
 perform 1 from bank_security.accounts where space_id=s and user_id=auth.uid() for update;
 if not bank_security.allowed(s,auth.uid()) then raise insufficient_privilege;end if;
 select * into old from bank_security.downloads where id=request_id;
 if found then
  if old.space_id<>s or old.user_id<>auth.uid() or old.format<>fmt or old.revision_ids<>ids or old.kind<>request_kind or old.exam_id is distinct from paper_id then raise insufficient_privilege;end if;
  if old.state<>'requested' then raise exception '새 다운로드 요청으로 다시 시도하세요.';end if;
 else
  select coalesce(array_agg(distinct c.metadata#>>'{source,documentId}'),'{}') into sources from public.bank_catalog c join bank_security.sources(s) source on source.source_id=c.metadata#>>'{source,documentId}' where c.revision_id=any(ids);
  select array_agg(distinct question_id order by question_id) into questions from public.bank_catalog where revision_id=any(ids);
  insert into bank_security.downloads(id,space_id,user_id,format,kind,exam_id,revision_ids,question_ids,source_ids) values(request_id,s,auth.uid(),fmt,request_kind,paper_id,ids,coalesce(questions,'{}'),sources);
 end if;
 code:=bank_security.watermark(s,auth.uid());
 return jsonb_build_object('requestId',request_id,'identifier',code);
end $function$
;

