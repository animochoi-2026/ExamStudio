-- Read-only desktop admission check. No queue, source, revision or asset writes.
create or replace function public.bank_queue_exam_preflight(s uuid, exams jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.bank_member(s) then raise insufficient_privilege; end if;
 if jsonb_typeof(exams)<>'array' or jsonb_array_length(exams)>100 then raise exception '시험지 확인 목록을 확인하세요'; end if;
 if exists(select 1 from jsonb_array_elements(exams) e where coalesce(e->>'id','')='' or coalesce(e->>'sha256','')!~'^[a-f0-9]{64}$') then raise exception '원본 식별 정보를 확인하세요'; end if;
 return (with latest as materialized(
  select distinct on(c.question_id) c.question_id,c.metadata,c.files,c.created_at
  from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id
  where c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id) and bank_grade.matches(c.metadata#>>'{source,grade}')
  order by c.question_id,c.created_at desc,c.revision_id desc
 ), originals as materialized(
  select *,metadata->'source' src,metadata#>>'{source,documentId}' document_id from latest
  where (metadata#>>'{source,kind}'='학교기출' or (metadata#>>'{source,kind}'='기타자료' and nullif(metadata#>>'{source,school}','') is not null and nullif(metadata#>>'{source,academicYear}','') is not null and nullif(metadata#>>'{source,exam}','') is not null)) and nullif(metadata#>>'{relations,originalQuestionId}','') is null
 ), matches as(
  select e->>'id' queue_id,o.* from jsonb_array_elements(exams) e join originals o on
   (exists(select 1 from jsonb_array_elements(o.files) f where f->>'role'='source' and f->>'sha256'=e->>'sha256')
   or (not exists(select 1 from unnest(array['school','grade','academicYear','semester','exam']) k where
    coalesce(e#>>array['source',k],'')='' or regexp_replace(coalesce(o.src->>k,''),'\s+','','g')<>regexp_replace(e#>>array['source',k],'\s+','','g'))
    and (nullif(e#>>'{source,schoolId}','') is null or nullif(o.src->>'schoolId','') is null or e#>>'{source,schoolId}'=o.src->>'schoolId')))
 ), groups as(
  select queue_id,document_id,jsonb_agg(jsonb_build_object('question_id',question_id,'source',jsonb_build_object('originalNumber',src->'originalNumber','numbering',src->'numbering'))) questions
  from matches where nullif(document_id,'') is not null group by queue_id,document_id
 ), results as(
  select e->>'id' id,jsonb_build_object('id',e->>'id','sourcePresent',exists(select 1 from public.bank_entries b where b.space_id=s and b.props->>'role'='source' and b.sha256=e->>'sha256' and (b.owner_id=auth.uid() or exists(select 1 from matches m where m.queue_id=e->>'id'))),
   'sources',coalesce((select jsonb_agg(jsonb_build_object('id',g.document_id,'questions',g.questions,'progress',public.bank_source_progress_get(s,g.document_id))) from groups g where g.queue_id=e->>'id'),'[]'::jsonb)) value
  from jsonb_array_elements(exams) e
 ) select coalesce(jsonb_agg(value),'[]'::jsonb) from results);
end $$;
revoke all on function public.bank_queue_exam_preflight(uuid,jsonb) from public,anon;
grant execute on function public.bank_queue_exam_preflight(uuid,jsonb) to authenticated;
