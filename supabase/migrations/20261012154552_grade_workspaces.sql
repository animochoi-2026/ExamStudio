-- Shared application, request-scoped grade views. No data is moved or deleted.
-- Missing context preserves desktop clients and the anonymous global overview.
create schema if not exists bank_grade;
revoke all on schema bank_grade from public;
create function bank_grade.normalize(g text) returns text language sql immutable set search_path='' as $$
 select case regexp_replace(coalesce(g,''),'[[:space:]]','','g')
 when 'm1' then 'm1' when '중1' then 'm1' when '중학교1학년' then 'm1'
 when 'm2' then 'm2' when '중2' then 'm2' when '중학교2학년' then 'm2'
 when 'm3' then 'm3' when '중3' then 'm3' when '중학교3학년' then 'm3'
 when 'h1' then 'h1' when '고1' then 'h1' when '고등학교1학년' then 'h1'
 when 'h2' then 'h2' when '고2' then 'h2' when '고등학교2학년' then 'h2'
 when 'h3' then 'h3' when '고3' then 'h3' when '고등학교3학년' then 'h3' end;
$$;
create function bank_grade.current() returns text language plpgsql stable set search_path='' as $$
declare g text;begin
 g:=nullif(current_setting('request.headers',true),'')::jsonb->>'x-exam-grade';
 if nullif(g,'') is null then return null;end if;
 if bank_grade.normalize(g) is null then raise exception '학년을 선택하세요.' using errcode='22023';end if;
 return bank_grade.normalize(g);
end $$;
create function bank_grade.matches(g text) returns boolean language sql stable set search_path='' as $$
 select bank_grade.current() is null or bank_grade.normalize(g)=bank_grade.current();
$$;
create function bank_grade.document_matches(s uuid,d jsonb) returns boolean language sql stable set search_path='' as $$
 select bank_grade.current() is null or
 case when nullif(d->>'workspaceGrade','') is not null then bank_grade.matches(d->>'workspaceGrade')
 else
 exists(select 1 from jsonb_array_elements_text(coalesce(d#>'{rules,units}','[]')) u where split_part(u,'-',1)=bank_grade.current())
 or exists(select 1 from jsonb_array_elements(coalesce(d->'variants','[]')) v cross join lateral jsonb_array_elements_text(coalesce(v->'units','[]')) u where split_part(u,'-',1)=bank_grade.current())
 or exists(select 1 from public.bank_catalog c where c.space_id=s and public.bank_read_revision(c.revision_id)
 and bank_grade.matches(c.metadata#>>'{source,grade}') and (
 exists(select 1 from jsonb_array_elements(coalesce(d->'items','[]')) i where i->>'revisionId'=c.revision_id::text)
 or exists(select 1 from jsonb_array_elements(coalesce(d->'variants','[]')) v cross join lateral jsonb_array_elements(coalesce(v#>'{paper,items}','[]')) i where i->>'revisionId'=c.revision_id::text)))
 end;
$$;
-- Internal helpers run under the caller's existing RPC permission checks.
revoke all on all functions in schema bank_grade from public,anon,authenticated;

CREATE OR REPLACE FUNCTION bank_query.latest(s uuid)
 RETURNS SETOF bank_catalog
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select latest.* from (select distinct on(c.question_id) c.* from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id
 where c.space_id=s and public.bank_member(s) and r.committed and not q.archived and public.bank_read_revision(c.revision_id)
 order by c.question_id,c.created_at desc,c.revision_id desc) latest
 where bank_grade.matches(latest.metadata#>>'{source,grade}');
$function$
;

CREATE OR REPLACE FUNCTION public.bank_source_questions(s uuid, source_key text, start_at integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin
if not public.bank_member(s) then raise insufficient_privilege;end if;
return (with latest as (
select distinct on(c.question_id) c.revision_id,c.question_id,c.metadata,c.confirmed,c.created_at,
jsonb_build_object('body',left(c.content->>'body',350)) content,
(select coalesce(jsonb_agg(f),'[]') from jsonb_array_elements(c.files) f where f->>'role'='preview') files,
r.visibility,q.owner_email,
coalesce(nullif(c.metadata#>>'{source,documentId}',''),e.props->>'sourceId',(select f->>'sourceId' from jsonb_array_elements(c.files) f where f->>'role'='source' limit 1)) source_id
from bank_query.latest(s) c join public.bank_revisions r on r.id=c.revision_id
join public.bank_questions q on q.id=c.question_id join public.bank_entries e on e.id=c.commit_id
where bank_grade.matches(c.metadata#>>'{source,grade}') and c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id)
order by c.question_id,c.created_at desc,c.revision_id desc
) select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select * from latest where source_id=source_key and nullif(metadata#>>'{relations,originalQuestionId}','') is null order by coalesce(substring(metadata#>>'{source,position,page}' from '[0-9]{1,6}')::integer,0),regexp_replace(coalesce(metadata#>>'{source,originalNumber}',''),'[0-9].*$',''),coalesce(substring(metadata#>>'{source,originalNumber}' from '[0-9]{1,6}')::integer,1000000),metadata#>>'{source,originalNumber}',question_id limit 50 offset greatest(0,start_at)) t);end $function$
;

CREATE OR REPLACE FUNCTION public.bank_search_current(s uuid, filters jsonb DEFAULT '{}'::jsonb, start_at integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return (with latest as (
 select distinct on(c.question_id) c.*,r.visibility,r.review_version,q.owner_email,
 (select count(*)>1 from public.bank_revisions h where h.question_id=c.question_id and h.committed and public.bank_read_revision(h.id) and not exists(select 1 from public.bank_revisions child where child.parent_id=h.id and child.committed)) revision_conflict,
 (bank_summary.row_difficulty(c.revision_id,c.metadata,c.confirmed)->>'score')::numeric score,
 (bank_summary.row_difficulty(c.revision_id,c.metadata,c.confirmed)->>'band') score_band
 from bank_query.latest(s) c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id
 where bank_grade.matches(c.metadata#>>'{source,grade}') and c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id)
 order by c.question_id,c.created_at desc,c.revision_id desc
 ), filtered as (
 select revision_id,question_id,space_id,commit_id,metadata,confirmed,created_at,visibility,review_version,owner_email,revision_conflict,
 jsonb_build_object('body',left(content->>'body',350)) content,
 (select coalesce(jsonb_agg(f),'[]') from jsonb_array_elements(files) f where f->>'role'='preview') files
 from latest c where (coalesce(filters->>'difficultyBand','')='' or c.score_band=filters->>'difficultyBand') and
 (coalesce(filters->>'text','')='' or (metadata::text||content::text||confirmed::text) ilike '%'||(filters->>'text')||'%')
 and(coalesce(filters->>'school','')='' or metadata#>>'{source,school}'=filters->>'school')
 and(coalesce(filters->>'academicYear','')='' or metadata#>>'{source,academicYear}'=filters->>'academicYear')
 and(coalesce(filters->>'grade','')='' or metadata#>>'{source,grade}'=filters->>'grade')
 and(coalesce(filters->>'semester','')='' or metadata#>>'{source,semester}'=filters->>'semester')
 and(coalesce(filters->>'unit','')='' or coalesce(nullif(confirmed->>'primaryUnit',''),metadata#>>'{classification,primaryUnit,name}')=filters->>'unit')
 and public.bank_type_matches(metadata,confirmed,filters->>'type')
 and(coalesce(filters->>'owner','')='' or owner_email=filters->>'owner')
 and(coalesce(filters->>'status','')='' or visibility=filters->>'status')
 and(not(filters?'min') or score>=(filters->>'min')::numeric)
 and(not(filters?'max') or score<=(filters->>'max')::numeric)
 order by created_at desc,revision_id desc limit 50 offset greatest(0,start_at)
 ) select coalesce(jsonb_agg(to_jsonb(filtered)),'[]') from filtered);
end $function$
;

CREATE OR REPLACE FUNCTION public.bank_exam_list(s uuid, start_at integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
  select e.id,e.title,e.version,e.created_at,e.updated_at,
   coalesce(e.document->>'status','draft') status,jsonb_array_length(e.document->'items') item_count,
   (select f from public.bank_catalog c cross join lateral jsonb_array_elements(c.files) f
    where c.revision_id=(e.document#>>'{items,0,revisionId}')::uuid and c.space_id=s and f->>'role'='preview'
      and public.bank_read_revision(c.revision_id) limit 1) preview
  from public.bank_exam_drafts e where bank_grade.document_matches(s,e.document) and e.space_id=s and e.owner_id=auth.uid() and e.archived_at is null
  order by e.updated_at desc,e.id limit 30 offset greatest(0,start_at)
 ) x),'[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.bank_school_sources(s uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform bank_summary.assert_ready(s);
 return (with visible as (
  select p.fact from bank_summary.originals p
  where p.space_id=s and p.audience='00000000-0000-0000-0000-000000000000'
   and not exists(select 1 from bank_summary.originals a where a.space_id=s and a.question_id=p.question_id and a.audience=auth.uid())
  union all
  select a.fact from bank_summary.originals a where a.space_id=s and a.audience=auth.uid()
 ), registered as (
  select fact->>'source_id' source_id,max((fact->>'registered_at')::timestamptz) last_registered_at
  from visible group by fact->>'source_id'
 ) select coalesce(jsonb_agg(bank_summary.source_value(s,e.value)||jsonb_build_object('last_registered_at',r.last_registered_at)
    order by e.updated_at desc,e.source_id),'[]'::jsonb)
 from bank_summary.effective_sources(s,auth.uid()) e left join registered r on r.source_id=e.source_id
 where bank_grade.matches(e.value#>>'{source,grade}') and (e.value->>'question_count')::integer>0);
end $function$
;

CREATE OR REPLACE FUNCTION public.bank_mock_schools(s uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return coalesce((select jsonb_agg(school order by school) from (select distinct c.metadata#>>'{source,school}' school from bank_query.latest(s) c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id where bank_grade.matches(c.metadata#>>'{source,grade}') and c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id) and nullif(trim(c.metadata#>>'{source,school}'),'') is not null and c.metadata#>>'{source,kind}'='학교기출' and coalesce(c.metadata#>>'{relations,originalQuestionId}','')='') x),'[]');
end $function$
;

CREATE OR REPLACE FUNCTION public.bank_difficulty_summary(s uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform bank_summary.assert_ready(s);
 return (with visible as(select p.* from bank_summary.statistics p where p.space_id=s and p.audience='00000000-0000-0000-0000-000000000000'
  and not exists(select 1 from bank_summary.statistics a where a.space_id=s and a.audience=auth.uid() and a.kind=p.kind and a.key=p.key)
  union all select a.* from bank_summary.statistics a where a.space_id=s and a.audience=auth.uid())
  select jsonb_build_object('groups',coalesce(jsonb_agg(value order by key) filter(where kind='stats' and (value#>>'{all,total}')::numeric>0),'[]'),
   'signals',coalesce(jsonb_agg(value order by key) filter(where kind='point' and value<>'null'::jsonb),'[]')) from visible where bank_grade.matches(case when kind='stats' then value->>'grade' else value#>>'{group,2}' end));
end $function$
;

CREATE OR REPLACE FUNCTION public.bank_exam_archived_list(s uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
  select id,title,version,archived_at from public.bank_exam_drafts
  where bank_grade.document_matches(s,document) and space_id=s and owner_id=auth.uid() and archived_at is not null
  order by archived_at desc,id limit 100
 ) x),'[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.bank_mock_list(s uuid, start_at integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,version,updated_at,jsonb_array_length(document->'variants') variant_count from public.bank_mock_exams where bank_grade.document_matches(s,document) and space_id=s and owner_id=auth.uid() order by updated_at desc,id limit 30 offset greatest(0,start_at)) x),'[]');
end $function$
;

CREATE OR REPLACE FUNCTION public.bank_mock_recommendation_snapshot(s uuid, exclude_exams uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare candidates jsonb; excluded jsonb; refs jsonb;
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if exists(select 1 from unnest(exclude_exams) x where not exists(select 1 from public.bank_mock_exams e where e.id=x and e.space_id=s and e.owner_id=auth.uid())) then raise insufficient_privilege;end if;
 select coalesce(jsonb_agg(distinct i->>'questionId'),'[]') into excluded from public.bank_mock_exams e cross join lateral jsonb_array_elements(e.document->'variants') v cross join lateral jsonb_array_elements(coalesce(nullif(v#>'{paper,items}','null'::jsonb),'[]')) i where e.id=any(exclude_exams) and e.space_id=s and e.owner_id=auth.uid();
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'title',title)),'[]') into refs from public.bank_mock_exams where id=any(exclude_exams) and space_id=s and owner_id=auth.uid();
 with latest as (
  select distinct on(c.question_id) c.*,r.review_version,
   (select count(*)>1 from public.bank_revisions h where h.question_id=c.question_id and h.committed and public.bank_read_revision(h.id) and not exists(select 1 from public.bank_revisions child where child.parent_id=h.id and child.committed)) revision_conflict
  from bank_query.latest(s) c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id
  where bank_grade.matches(c.metadata#>>'{source,grade}') and c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id)
  order by c.question_id,c.created_at desc,c.revision_id desc
 ) select coalesce(jsonb_agg(to_jsonb(c) order by c.question_id),'[]') into candidates from latest c
 where not (excluded ? c.question_id::text);
 return jsonb_build_object('id',gen_random_uuid(),'at',statement_timestamp(),'candidates',candidates,'excludeIds',excluded,'exclusions',refs);
end $function$
;

CREATE OR REPLACE FUNCTION public.bank_mock_snapshot(s uuid, schools jsonb, exclude_exams uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare candidates jsonb; excluded jsonb; refs jsonb;
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if jsonb_typeof(schools) is distinct from 'array' or jsonb_array_length(schools)=0 then raise exception '출처 학교를 선택하세요.' using errcode='22023';end if;
 if exists(select 1 from unnest(exclude_exams) x where not exists(select 1 from public.bank_mock_exams e where e.id=x and e.space_id=s and e.owner_id=auth.uid())) then raise insufficient_privilege;end if;
 select coalesce(jsonb_agg(distinct i->>'questionId'),'[]') into excluded from public.bank_mock_exams e cross join lateral jsonb_array_elements(e.document->'variants') v cross join lateral jsonb_array_elements(coalesce(nullif(v#>'{paper,items}','null'::jsonb),'[]')) i where e.id=any(exclude_exams) and e.space_id=s and e.owner_id=auth.uid();
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'title',title)),'[]') into refs from public.bank_mock_exams where id=any(exclude_exams) and space_id=s and owner_id=auth.uid();
 with latest as (
  select distinct on(c.question_id) c.*,r.review_version,
   (select count(*)>1 from public.bank_revisions h where h.question_id=c.question_id and h.committed and public.bank_read_revision(h.id) and not exists(select 1 from public.bank_revisions child where child.parent_id=h.id and child.committed)) revision_conflict
  from bank_query.latest(s) c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id
  where bank_grade.matches(c.metadata#>>'{source,grade}') and c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id)
  order by c.question_id,c.created_at desc,c.revision_id desc
 ) select coalesce(jsonb_agg(to_jsonb(c) order by c.question_id),'[]') into candidates from latest c
 where schools ? (c.metadata#>>'{source,school}') and c.metadata#>>'{source,kind}'='학교기출' and coalesce(c.metadata#>>'{relations,originalQuestionId}','')='';
 return jsonb_build_object('id',gen_random_uuid(),'at',statement_timestamp(),'candidates',candidates,'excludeIds',excluded,'exclusions',refs);
end $function$
;

CREATE OR REPLACE FUNCTION public.bank_source_exams(s uuid, start_at integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform bank_summary.assert_ready(s);
 return (select coalesce(jsonb_agg(bank_summary.source_value(s,value) order by updated_at desc,source_id),'[]') from
  (select * from bank_summary.effective_sources(s,auth.uid()) where bank_grade.matches(value#>>'{source,grade}') and (value->>'question_count')::int>0 order by updated_at desc,source_id limit 50 offset greatest(0,start_at)) t);
end $function$
;

create function public.bank_exam_candidates(s uuid,schools jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if public.bank_member(s) is not true then raise insufficient_privilege;end if;
 if jsonb_typeof(schools) is distinct from 'array' or jsonb_array_length(schools)=0 then raise exception '출처 학교를 선택하세요.' using errcode='22023';end if;
 return (with selected as materialized(select c.* from bank_query.latest(s) c where schools ? (c.metadata#>>'{source,school}')),
 candidates as(select c.question_id,c.revision_id,c.space_id,c.metadata,c.confirmed,c.created_at,r.visibility,r.review_version,q.owner_email,
  (select count(*)>1 from public.bank_revisions h where h.question_id=c.question_id and h.committed and public.bank_read_revision(h.id) and not exists(select 1 from public.bank_revisions child where child.parent_id=h.id and child.committed)) revision_conflict,
  jsonb_build_object('body',left(c.content->>'body',350)) content,
  (select coalesce(jsonb_agg(f),'[]') from jsonb_array_elements(c.files) f where f->>'role'='preview') files
 from selected c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id)
 select coalesce(jsonb_agg(to_jsonb(c) order by c.question_id),'[]') from candidates c);
end $$;
revoke all on function public.bank_exam_candidates(uuid,jsonb) from public,anon;
grant execute on function public.bank_exam_candidates(uuid,jsonb) to authenticated;
create function bank_grade.home(s uuid) returns jsonb language sql stable set search_path='' as $$
 with latest as materialized(select c.*,r.visibility,(bank_summary.row_difficulty(c.revision_id,c.metadata,c.confirmed)->>'score')::numeric score
 from bank_query.latest(s) c join public.bank_revisions r on r.id=c.revision_id),
 sources as materialized(select * from bank_summary.effective_sources(s,auth.uid()) where bank_grade.matches(value#>>'{source,grade}') and (value->>'question_count')::int>0),
 totals as(select count(*) questions,count(*) filter(where visibility='approved') reviewed,count(*) filter(where visibility<>'approved') pending,
 count(*) filter(where score<=3) low,count(*) filter(where score>3 and score<8) middle,count(*) filter(where score>=8) high,
 count(*) filter(where score is null) unknown,count(*) filter(where score>=9) killer from latest)
 select jsonb_build_object('dashboard',jsonb_build_object('summaryVersion','stored-web-v1','asOf',now(),'questions',questions,'reviewed',reviewed,'pending',pending,
 'schools',(select count(distinct value#>>'{source,school}') from sources),'sourceExams',(select count(*) from sources),
 'difficulty',jsonb_build_object('total',questions,'counts',jsonb_build_object('low',low,'middle',middle,'high',high,'unknown',unknown,'deferred',0),'killerCount',killer,'labelDisagreements',0)),
 'recentSchools',(select coalesce(jsonb_agg(school order by updated desc),'[]') from (select value#>>'{source,school}' school,max(updated_at) updated from sources group by 1 order by 2 desc limit 12) x),
 'recentSources',(select coalesce(jsonb_agg(value order by updated_at desc,source_id),'[]') from (select * from sources order by updated_at desc,source_id limit 6) x))
 from totals;
$$;
revoke all on function bank_grade.home(uuid) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.bank_exam_get(s uuid, e uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare found_exam public.bank_exam_drafts;
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 select * into found_exam from public.bank_exam_drafts where id=e and space_id=s and owner_id=auth.uid() and bank_grade.document_matches(s,document);
 if not found then raise insufficient_privilege;end if;
 return jsonb_build_object('id',found_exam.id,'title',found_exam.title,'version',found_exam.version,
  'created_at',found_exam.created_at,'updated_at',found_exam.updated_at,'document',found_exam.document);
end $function$
;
CREATE OR REPLACE FUNCTION public.bank_mock_get(s uuid, e uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 select jsonb_build_object('document',document,'version',version,'id',id) into result from public.bank_mock_exams where id=e and space_id=s and owner_id=auth.uid() and bank_grade.document_matches(s,document);
 if result is null then raise insufficient_privilege;end if;return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.bank_dashboard(s uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb;begin
 perform bank_summary.assert_ready(s);v:=case when bank_grade.current() is null then bank_summary.home_value(s,auth.uid())->'dashboard' else bank_grade.home(s)->'dashboard' end;
 if v is null then raise sqlstate '55000' using message='저장 집계 준비가 완료되지 않았습니다';end if;
 -- The legacy, time-relative recent counter is not used by the home screen.
 return v||jsonb_build_object('recent',coalesce((select sum(n) from bank_summary.buckets where space_id=s and kind='registered' and audience in('00000000-0000-0000-0000-000000000000'::uuid,auth.uid()) and (key->>0)::timestamptz>=now()-interval '7 days'),0),'asOf',now());
end $function$
;

CREATE OR REPLACE FUNCTION public.bank_home_summary(s uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb;begin
 perform bank_summary.assert_ready(s);v:=case when bank_grade.current() is null then bank_summary.home_value(s,auth.uid()) else bank_grade.home(s) end;
 if v is null then raise sqlstate '55000' using message='저장 집계 준비가 완료되지 않았습니다';end if;
 return v||jsonb_build_object('dashboard',v->'dashboard'||jsonb_build_object('asOf',now()),'recentSources',
  (select coalesce(jsonb_agg(bank_summary.source_value(s,x) order by ord),'[]') from jsonb_array_elements(v->'recentSources') with ordinality t(x,ord)));
end $function$
;
