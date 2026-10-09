-- Additive migration. Original bundles, revisions and private storage stay intact.
create table public.bank_exam_drafts (
 id uuid primary key, space_id uuid not null references public.bank_spaces,
 owner_id uuid not null default auth.uid(), title text not null,
 version integer not null default 1, document jsonb not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.bank_exam_history (
 exam_id uuid not null references public.bank_exam_drafts, version integer not null,
 actor_id uuid not null, document jsonb not null, created_at timestamptz not null default now(),
 primary key(exam_id,version)
);
alter table public.bank_exam_drafts enable row level security;
alter table public.bank_exam_history enable row level security;
create policy own_exam on public.bank_exam_drafts for select to authenticated using(owner_id=auth.uid() and public.bank_member(space_id));
create policy own_history on public.bank_exam_history for select to authenticated using(exists(select 1 from public.bank_exam_drafts e where e.id=exam_id and e.owner_id=auth.uid() and public.bank_member(e.space_id)));
revoke all on public.bank_exam_drafts,public.bank_exam_history from public,anon,authenticated;
grant select on public.bank_exam_drafts,public.bank_exam_history to authenticated;

create function public.bank_exam_save(s uuid,e uuid,expected integer,doc jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old public.bank_exam_drafts; i jsonb; v integer;
begin
 if not public.bank_member(s) then raise insufficient_privilege; end if;
 if jsonb_typeof(doc->'items') is distinct from 'array' or jsonb_array_length(doc->'items')>100 or length(doc::text)>1000000 or length(coalesce(doc->>'title','')) not between 1 and 200 then raise exception '시험지 형식 오류';end if;
 if (select count(distinct x->>'questionId') from jsonb_array_elements(doc->'items') x)<>jsonb_array_length(doc->'items') then raise exception '같은 문항을 중복 담을 수 없습니다';end if;
 for i in select * from jsonb_array_elements(doc->'items') loop
  if not exists(select 1 from public.bank_catalog c where c.space_id=s and c.question_id=(i->>'questionId')::uuid and c.revision_id=(i->>'revisionId')::uuid and public.bank_read_revision(c.revision_id)) then raise insufficient_privilege;end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(e::text,0));
 select * into old from public.bank_exam_drafts where id=e for update;
 if found then
  if old.owner_id<>auth.uid() or old.space_id<>s then raise insufficient_privilege;end if;
  if old.version<>expected then raise exception '다른 창에서 수정되었습니다. 저장본을 다시 열어 확인하세요.';end if;
  v:=old.version+1;
  update public.bank_exam_drafts set title=doc->>'title',document=doc,version=v,updated_at=now() where id=e;
 else
  if expected<>0 then raise exception '시험지 버전이 없습니다';end if;v:=1;
  insert into public.bank_exam_drafts(id,space_id,title,document) values(e,s,doc->>'title',doc);
 end if;
 insert into public.bank_exam_history(exam_id,version,actor_id,document) values(e,v,auth.uid(),doc);
 return jsonb_build_object('id',e,'version',v);
end $$;

-- Group by stable source ID, never school name or question number alone.
create function public.bank_source_exams(s uuid,start_at integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return (with latest as (
 select distinct on(c.question_id) c.*,r.visibility,q.owner_email,
 coalesce(nullif(c.metadata#>>'{source,documentId}',''),e.props->>'sourceId',(select f->>'sourceId' from jsonb_array_elements(c.files) f where f->>'role'='source' limit 1)) source_id
 from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id
 join public.bank_questions q on q.id=c.question_id join public.bank_entries e on e.id=c.commit_id
 where c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id)
 and nullif(c.metadata#>>'{relations,originalQuestionId}','') is null
 order by c.question_id,c.created_at desc,c.revision_id desc
 ), grouped as (
 select source_id,(array_agg(metadata->'source' order by created_at desc))[1] source,
 count(*) question_count,count(*) filter(where visibility='approved') reviewed_count,
 min(created_at) created_at,max(created_at) updated_at,
 array_agg(distinct owner_email) contributors
 from latest where source_id is not null group by source_id order by max(created_at) desc
 limit 50 offset greatest(0,start_at)
 ) select coalesce(jsonb_agg(to_jsonb(grouped)||jsonb_build_object('progress',(select to_jsonb(p) from public.bank_source_progress p where p.space_id=s and p.source_id=grouped.source_id))),'[]'::jsonb) from grouped);
end $$;
create function public.bank_source_questions(s uuid,source_key text,start_at integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return (with latest as (
 select distinct on(c.question_id) c.revision_id,c.question_id,c.metadata,c.confirmed,c.created_at,
 jsonb_build_object('body',left(c.content->>'body',350)) content,
 (select coalesce(jsonb_agg(f),'[]') from jsonb_array_elements(c.files) f where f->>'role'='preview') files,
 r.visibility,q.owner_email
 from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id
 join public.bank_questions q on q.id=c.question_id join public.bank_entries e on e.id=c.commit_id
 where c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id)
 and coalesce(nullif(c.metadata#>>'{source,documentId}',''),e.props->>'sourceId',(select f->>'sourceId' from jsonb_array_elements(c.files) f where f->>'role'='source' limit 1))=source_key
 order by c.question_id,c.created_at desc,c.revision_id desc
 ) select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select * from latest order by coalesce(substring(metadata#>>'{source,position,page}' from '[0-9]{1,6}')::integer,0),regexp_replace(coalesce(metadata#>>'{source,originalNumber}',''),'[0-9].*$',''),coalesce(substring(metadata#>>'{source,originalNumber}' from '[0-9]{1,6}')::integer,1000000),metadata#>>'{source,originalNumber}',question_id limit 50 offset greatest(0,start_at)) t);
end $$;
revoke execute on function public.bank_exam_save(uuid,uuid,integer,jsonb),public.bank_source_exams(uuid,integer),public.bank_source_questions(uuid,text,integer) from public,anon;
grant execute on function public.bank_exam_save(uuid,uuid,integer,jsonb),public.bank_source_exams(uuid,integer),public.bank_source_questions(uuid,text,integer) to authenticated;

create or replace function public.bank_dashboard(s uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return (with latest as (
 select distinct on(c.question_id) c.question_id,c.metadata,r.visibility,q.created_at registered_at,
 coalesce(nullif(c.metadata#>>'{source,documentId}',''),e.props->>'sourceId',(select f->>'sourceId' from jsonb_array_elements(c.files) f where f->>'role'='source' limit 1)) source_id
 from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id
 join public.bank_questions q on q.id=c.question_id join public.bank_entries e on e.id=c.commit_id
 where c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id)
 order by c.question_id,c.created_at desc,c.revision_id desc)
 select jsonb_build_object('questions',count(*),'schools',count(distinct case when nullif(trim(metadata#>>'{source,school}'),'') is not null then coalesce(nullif(metadata#>>'{source,schoolId}',''),concat_ws('|',metadata#>>'{source,region}',trim(metadata#>>'{source,school}'))) end),
 'sourceExams',count(distinct source_id) filter(where nullif(metadata#>>'{relations,originalQuestionId}','') is null),
 'pending',count(*) filter(where visibility<>'approved'),'reviewed',count(*) filter(where visibility='approved'),
 'recent',count(*) filter(where registered_at>=now()-interval '7 days'),'asOf',now()) from latest);
end $$;
