-- LOCAL PROPOSAL ONLY. Apply atomically before deploying the corresponding web code.
-- Existing upload/review/delete signatures and difficulty metadata are untouched.
-- Operating freeze guards take an EARLY revision-prune space lock. Deferred
-- summary serialization cannot resolve reverse cross-space base-write locks.
-- Drain writers before this backfill or operator rebuild; mixed Storage/base
-- writes can invert table locks. Any timeout/deadlock aborts the whole transaction.
begin;
set local lock_timeout='5s';
lock table public.bank_questions,public.bank_revisions,public.bank_catalog in share row exclusive mode;
create index bank_summary_catalog_question on public.bank_catalog(space_id,question_id,created_at desc,revision_id desc);
create index bank_summary_revisions_question on public.bank_revisions(question_id,committed);
create schema bank_summary;
revoke all on schema bank_summary from public,anon,authenticated,service_role;
create table bank_summary.state(id boolean primary key default true check(id),ready boolean not null,version text not null);
insert into bank_summary.state values(true,false,'stored-web-v1');
-- Zero is the common audience. Actor rows are ONLY overrides of that common view.
create table bank_summary.questions(space_id uuid not null,question_id uuid not null,audience uuid not null,
 fact jsonb not null,primary key(space_id,question_id,audience));
create index summary_source on bank_summary.questions(space_id,audience,(fact->>'source_id'));
-- Original-list eligibility is applied BEFORE choosing its latest revision.
-- It must never replace the all-question projection used by dashboard/statistics.
create table bank_summary.originals(space_id uuid not null,question_id uuid not null,audience uuid not null,
 fact jsonb not null,primary key(space_id,question_id,audience));
create index summary_original_source on bank_summary.originals(space_id,audience,(fact->>'source_id'));
create table bank_summary.buckets(space_id uuid not null,audience uuid not null,kind text not null,key jsonb not null,n numeric not null,
 primary key(space_id,audience,kind,key));
create index summary_recent on bank_summary.buckets(space_id,audience,kind,(key->>0));
create index summary_zero_buckets on bank_summary.buckets(space_id) where n=0;
create table bank_summary.sources(space_id uuid not null,audience uuid not null,source_id text not null,value jsonb not null,updated_at timestamptz not null,
 primary key(space_id,audience,source_id));
create index summary_sources_recent on bank_summary.sources(space_id,audience,updated_at desc,source_id);
create table bank_summary.statistics(space_id uuid not null,audience uuid not null,kind text not null,key jsonb not null,value jsonb not null,primary key(space_id,audience,kind,key));
create table bank_summary.home(space_id uuid not null,audience uuid not null,value jsonb not null,primary key(space_id,audience));
create table bank_summary.dirty(transaction_id bigint not null,space_id uuid not null,question_id uuid not null,
 primary key(transaction_id,space_id,question_id));
create table bank_summary.affected(transaction_id bigint not null,space_id uuid not null,kind text not null,key jsonb not null,primary key(transaction_id,space_id,kind,key));
create table bank_summary.inventory(space_id uuid not null,question_id uuid primary key,versions bigint not null);
create table bank_summary.capacity(space_id uuid primary key,questions bigint not null,versions bigint not null);
create table bank_summary.storage(id boolean primary key check(id),objects bigint not null,bytes bigint not null,bank_bytes bigint not null,unknown bigint not null);
insert into bank_summary.storage values(true,0,0,0,0);
create table bank_summary.storage_deltas(transaction_id bigint primary key,objects bigint not null,bytes bigint not null,bank_bytes bigint not null,unknown bigint not null);
-- No direct read/write privilege to any application role, including service_role.
alter table bank_summary.questions enable row level security;
alter table bank_summary.originals enable row level security;
alter table bank_summary.buckets enable row level security;
alter table bank_summary.sources enable row level security;
alter table bank_summary.dirty enable row level security;
alter table bank_summary.affected enable row level security;
alter table bank_summary.state enable row level security;
alter table bank_summary.inventory enable row level security;
alter table bank_summary.capacity enable row level security;
alter table bank_summary.storage enable row level security;
alter table bank_summary.storage_deltas enable row level security;
alter table bank_summary.statistics enable row level security;
alter table bank_summary.home enable row level security;

create function bank_summary.score(v jsonb) returns numeric language plpgsql immutable set search_path='' as $$
declare t text;n numeric;begin
 if v is null or v='null'::jsonb then return null;end if;
 t:=trim(v#>>'{}');
 if jsonb_typeof(v)='number' then n:=t::numeric;if n between 0 and 10 and n=round(n,1) then return n;end if;
 elsif t~'^\d+(\.\d)?$' and t::numeric between 0 and 10 then return t::numeric;end if;
 return null;
end $$;
-- Pure row-aware display score shared by stored facts and ordinary row search.
-- No table reads, writes, AI calls or metadata normalization/persistence.
create function bank_summary.row_difficulty(revision_id uuid,m jsonb,f jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare d jsonb:=m->'difficulty';a jsonb;raw numeric;n numeric;ns text;band text;analyzed boolean:=false;
begin
 -- Match difficulty-assessment.cjs, including active revision/basis and proof adjustment.
 if not coalesce((d->>'reassessmentRequired')::boolean,false) and coalesce(m#>>'{analysis,status}','')<>'stale' then
  a:=d#>array['rubricAssessments',d->>'activeRubricAssessment'];
  if a->>'criteriaVersion'='expected-10-v5-insight-references-scope-low1' and a->>'state'='accepted'
   and a->>'revisionId'=revision_id::text and nullif(a->>'inputBasis','') is not null and a->>'inputBasis'=m#>>'{analysis,basis}' then
   raw:=bank_summary.score(a->'score');analyzed:=true;
  elsif d->>'criteriaVersion'='expected-10-v5-insight-references-scope-low1' then
   raw:=bank_summary.score(d->'aiScore');analyzed:=raw is not null;
  end if;
 end if;
 n:=bank_summary.score(f->'difficulty');if n is not null then ns:='교사 검수';else
  n:=bank_summary.score(d->'userScore');if n is not null then ns:='교사 직접 입력';else
   n:=raw;if n is not null then ns:='AI 추천';
    if d#>>'{proofAdjustment,version}'='final-number-proof-plus2-v1' and d#>'{proofAdjustment,rawScore}'=to_jsonb(raw)
     and d#>>'{proofAdjustment,evidence,kind}' in('construct','complete') then n:=least(10,raw+2);if n<>raw then ns:='AI 원점수 + 증명 보정';end if;end if;
   end if;
  end if;
 end if;
 band:=case when n is null then null when n<4 then '쉬움' when n<6.5 then '보통' when n<8 then '어려움' else '아주어려움' end;
 return jsonb_build_object('score',n,'raw',raw,'numberSource',ns,'band',band,'analyzed',analyzed);
end $$;
create function bank_summary.fact(c public.bank_catalog,r public.bank_revisions,q public.bank_questions) returns jsonb
language plpgsql stable set search_path='' as $$
declare m jsonb:=c.metadata;f jsonb:=c.confirmed;d jsonb:=m->'difficulty';src jsonb:=m->'source';v jsonb;
 raw numeric;n numeric;ns text;part text;legacy text;band text;k text;points numeric;point_key jsonb;types jsonb;analyzed boolean;
begin
 v:=bank_summary.row_difficulty(c.revision_id,m,f);
 n:=(v->>'score')::numeric;raw:=(v->>'raw')::numeric;ns:=v->>'numberSource';band:=v->>'band';analyzed:=(v->>'analyzed')::boolean;
 legacy:=case when f?'difficultyBand' then f->>'difficultyBand' else d->>'teacherBand' end;
 part:=src#>>'{numbering,section}';
 if part='unknown' then part:=null;
 elsif part is null or part not in('objective','written') then
  part:=case m#>>'{content,responseType}' when '서술형' then 'written' when '선택형' then 'objective' else split_part(public.bank_printed_key(src),':',1) end;
 end if;
 k:=coalesce(nullif(src->>'documentId',''),(select props->>'sourceId' from public.bank_entries where id=c.commit_id),
  (select x->>'sourceId' from jsonb_array_elements(c.files) x where x->>'role'='source' limit 1));
 if nullif(m#>>'{relations,originalQuestionId}','') is not null then k:=null;end if;
 select coalesce(jsonb_agg(coalesce(nullif(x->>'name',''),x->>'id')),'[]') into types from jsonb_array_elements(coalesce(nullif(m#>'{classification,types}','null'),'[]')) x;
 begin points:=coalesce(f->>'originalPoints',src->>'originalPoints')::numeric;exception when invalid_text_representation then points:=null;end;
 if nullif(src->>'documentId','') is not null and part is not null and raw is not null and points>0 then
  point_key:=jsonb_build_array(src->'documentId',src->'school',src->'grade',src->'academicYear',src->'semester',src->'exam',part);
 end if;
 return jsonb_build_object('revision_id',c.revision_id,'source_id',k,'source',src,'created_at',c.created_at,'registered_at',q.created_at,
  'owner_email',q.owner_email,'visibility',r.visibility,'score',n,'raw',raw,'numberSource',ns,'band',band,
  'composition',case when n is null then 'unknown' when n<=3 then 'low' when n<8 then 'middle' else 'high' end,
  'confirmed',coalesce(f->>'difficulty','')<>'','conflict',coalesce(legacy in('쉬움','보통','어려움','아주어려움') and legacy is distinct from band,false),
  'school_key',case when nullif(trim(src->>'school'),'') is not null then coalesce(nullif(src->>'schoolId',''),concat_ws('|',src->>'region',trim(src->>'school'))) end,
  'stats',jsonb_build_array(coalesce(nullif(src->>'school',''),'미상'),coalesce(nullif(src->>'grade',''),'미상'),coalesce(nullif(d->'scope','null'),'{}'),
   case when analyzed then 'expected-10-v5-insight-references-scope-low1' else 'new-criteria-required' end,coalesce(part,'unknown'),n,ns,types,analyzed),
  'point',case when point_key is not null then jsonb_build_array(point_key,raw,points) end);
end $$;
-- Preserve operating row-search signature, pagination, columns and ACL.
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
 from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id
 where c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id)
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
end $function$;
create function bank_summary.add_bucket(s uuid,u uuid,k text,v jsonb,delta numeric) returns void language sql volatile set search_path='' as $$
 insert into bank_summary.buckets values(s,u,k,v,delta) on conflict(space_id,audience,kind,key) do update set n=bank_summary.buckets.n+excluded.n;
$$;
create function bank_summary.fact_buckets(f jsonb) returns table(kind text,key jsonb) language sql immutable set search_path='' as $$
 select 'composition',jsonb_build_array(f->'composition',f->'band',f->'numberSource',f->'score',f->'conflict') where f is not null union all
 select 'status',jsonb_build_array(f->'visibility') where f is not null union all
 select 'registered',jsonb_build_array(f->'registered_at') where f is not null union all
 select 'school',jsonb_build_array(f->'school_key') where f->>'school_key' is not null union all
 select 'source',jsonb_build_array(f->'source_id') where f->>'source_id' is not null union all
 select 'stats',f->'stats' where f is not null union all select 'point',f->'point' where f->'point'<>'null'::jsonb;
$$;
create function bank_summary.add_fact(s uuid,u uuid,f jsonb,delta integer) returns void language plpgsql set search_path='' as $$
declare x record;begin
 for x in select * from bank_summary.fact_buckets(f) loop perform bank_summary.add_bucket(s,u,x.kind,x.key,delta);end loop;
end $$;
create function bank_summary.effective_sources(s uuid,u uuid) returns setof bank_summary.sources
language sql stable as $$
 select p.* from bank_summary.sources p where p.space_id=s and p.audience='00000000-0000-0000-0000-000000000000'
  and not exists(select 1 from bank_summary.sources a where a.space_id=s and a.audience=u and a.source_id=p.source_id)
 union all select a.* from bank_summary.sources a where a.space_id=s and a.audience=u;
$$;
create function bank_summary.source_snapshot(s uuid,u uuid,k text) returns jsonb language sql stable set search_path='' as $$
  with selected as (
   select p.fact from bank_summary.originals p where p.space_id=s and p.audience='00000000-0000-0000-0000-000000000000' and p.fact->>'source_id'=k
    and (u='00000000-0000-0000-0000-000000000000' or not exists(select 1 from bank_summary.originals a where a.space_id=s and a.question_id=p.question_id and a.audience=u))
   union all select a.fact from bank_summary.originals a where a.space_id=s and a.audience=u and u<>'00000000-0000-0000-0000-000000000000' and a.fact->>'source_id'=k
  ), scored as (
   -- Match bank_source_questions: latest ALL rows, then source/variant filter.
   select p.fact from bank_summary.questions p where p.space_id=s and p.audience='00000000-0000-0000-0000-000000000000' and p.fact->>'source_id'=k
    and (u='00000000-0000-0000-0000-000000000000' or not exists(select 1 from bank_summary.questions a where a.space_id=s and a.question_id=p.question_id and a.audience=u))
   union all select a.fact from bank_summary.questions a where a.space_id=s and a.audience=u and u<>'00000000-0000-0000-0000-000000000000' and a.fact->>'source_id'=k
  ) select jsonb_build_object('source_id',k,'source',(array_agg(fact->'source' order by fact->>'created_at' desc,fact->>'revision_id' desc))[1],
    'question_count',count(*),'reviewed_count',count(*) filter(where fact->>'visibility'='approved'),
    'created_at',min(fact->>'created_at'),'updated_at',max(fact->>'created_at'),
    'contributors',coalesce(jsonb_agg(distinct fact->>'owner_email'),'[]'),
    'difficulty',(select jsonb_build_object('total',count(*),'numericCount',count(*) filter(where fact->>'score' is not null),
     'average',avg((fact->>'score')::numeric),'confirmedCount',count(*) filter(where fact->>'score' is not null and (fact->>'confirmed')::boolean)) from scored)) from selected;
$$;
create function bank_summary.refresh_source(s uuid,k text) returns void language plpgsql set search_path='' as $$
declare u uuid;v jsonb;begin
 for u in select '00000000-0000-0000-0000-000000000000'::uuid union
  select audience from bank_summary.originals where space_id=s and fact->>'source_id'=k union
  select a.audience from bank_summary.originals a join bank_summary.originals p on p.space_id=a.space_id and p.question_id=a.question_id and p.audience='00000000-0000-0000-0000-000000000000'
   where a.space_id=s and a.audience<>'00000000-0000-0000-0000-000000000000' and p.fact->>'source_id'=k union
  select audience from bank_summary.questions where space_id=s and fact->>'source_id'=k union
  select a.audience from bank_summary.questions a join bank_summary.questions p on p.space_id=a.space_id and p.question_id=a.question_id and p.audience='00000000-0000-0000-0000-000000000000'
   where a.space_id=s and a.audience<>'00000000-0000-0000-0000-000000000000' and p.fact->>'source_id'=k union
  select audience from bank_summary.sources where space_id=s and source_id=k loop
  -- Actor cache rows are full overrides for this source, including an empty tombstone.
  v:=bank_summary.source_snapshot(s,u,k);
  if u='00000000-0000-0000-0000-000000000000' and (v->>'question_count')::int=0 then delete from bank_summary.sources where space_id=s and audience=u and source_id=k;
  else insert into bank_summary.sources values(s,u,k,v,coalesce((v->>'updated_at')::timestamptz,'epoch'))
   on conflict(space_id,audience,source_id) do update set value=excluded.value,updated_at=excluded.updated_at;end if;
  -- Remove redundant overrides after a private revision disappears/moves away.
  if u<>'00000000-0000-0000-0000-000000000000' and not exists(
    select 1 from bank_summary.originals a left join bank_summary.originals p on p.space_id=a.space_id and p.question_id=a.question_id and p.audience='00000000-0000-0000-0000-000000000000'
    where a.space_id=s and a.audience=u and (a.fact->>'source_id'=k or p.fact->>'source_id'=k)
    union all select 1 from bank_summary.questions a left join bank_summary.questions p on p.space_id=a.space_id and p.question_id=a.question_id and p.audience='00000000-0000-0000-0000-000000000000'
    where a.space_id=s and a.audience=u and (a.fact->>'source_id'=k or p.fact->>'source_id'=k)) then
   delete from bank_summary.sources where space_id=s and audience=u and source_id=k;
  end if;
 end loop;
end $$;
create function bank_summary.selected(s uuid,qid uuid,originals_only boolean default false) returns table(audience uuid,fact jsonb) language sql stable set search_path='' as $$
 with candidates as (select c,r,q from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id
  where c.space_id=s and c.question_id=qid and not q.archived and r.committed
   and (not originals_only or nullif(c.metadata#>>'{relations,originalQuestionId}','') is null)),
 audiences as (select '00000000-0000-0000-0000-000000000000'::uuid u union select distinct (r).actor_id from candidates where (r).visibility='private'),
 chosen as (select u,bank_summary.fact(c,r,q) f from audiences cross join lateral
  (select * from candidates where (r).visibility in('approved','shared_pending') or (r).actor_id=u order by (c).created_at desc,(c).revision_id desc limit 1) x),
 common as (select f from chosen where u='00000000-0000-0000-0000-000000000000')
 select u,f from chosen where u='00000000-0000-0000-0000-000000000000' or f is distinct from (select f from common);
$$;
create function bank_summary.group_key(k jsonb) returns jsonb language sql immutable set search_path='' as $$ select jsonb_build_array(k->0,k->1,k->2,k->3); $$;
create index summary_stats_group on bank_summary.buckets(space_id,kind,bank_summary.group_key(key),audience) where kind='stats';
create index summary_point_group on bank_summary.buckets(space_id,kind,(key->0),audience) where kind='point';
create function bank_summary.refresh_question(s uuid,qid uuid) returns jsonb language plpgsql set search_path='' as $$
declare old_common jsonb;new_common jsonb;x record;keys jsonb;old_rows jsonb;new_rows jsonb;old_originals jsonb;new_originals jsonb;begin
 select jsonb_agg(jsonb_build_array(audience,fact) order by audience) into old_rows from bank_summary.questions where space_id=s and question_id=qid;
 select jsonb_agg(jsonb_build_array(audience,fact) order by audience) into new_rows from bank_summary.selected(s,qid);
 select jsonb_agg(jsonb_build_array(audience,fact) order by audience) into old_originals from bank_summary.originals where space_id=s and question_id=qid;
 select jsonb_agg(jsonb_build_array(audience,fact) order by audience) into new_originals from bank_summary.selected(s,qid,true);
 if old_rows is not distinct from new_rows and old_originals is not distinct from new_originals then return '[]';end if;
 with changed as (select fact from bank_summary.questions where space_id=s and question_id=qid union all select fact from bank_summary.selected(s,qid)),
 original_changes as (select fact from bank_summary.originals where space_id=s and question_id=qid union all select fact from bank_summary.selected(s,qid,true)),
 affected as (select jsonb_build_array('source',fact->'source_id') k from original_changes where fact->>'source_id' is not null union
 select jsonb_build_array('source',fact->'source_id') from changed where fact->>'source_id' is not null union
 select jsonb_build_array('stats',bank_summary.group_key(fact->'stats')) from changed union
 select jsonb_build_array('point',fact#>'{point,0}') from changed where fact->'point'<>'null'::jsonb)
 select jsonb_agg(k) into keys from affected;
 if old_rows is distinct from new_rows then
  select fact into old_common from bank_summary.questions where space_id=s and question_id=qid and audience='00000000-0000-0000-0000-000000000000';
  for x in select * from bank_summary.questions where space_id=s and question_id=qid order by audience loop
   perform bank_summary.add_fact(s,x.audience,x.fact,-1);
   if x.audience<>'00000000-0000-0000-0000-000000000000' then perform bank_summary.add_fact(s,x.audience,old_common,1);end if;
  end loop;
  delete from bank_summary.questions where space_id=s and question_id=qid;
  insert into bank_summary.questions select s,qid,audience,fact from bank_summary.selected(s,qid);
  select fact into new_common from bank_summary.questions where space_id=s and question_id=qid and audience='00000000-0000-0000-0000-000000000000';
  for x in select * from bank_summary.questions where space_id=s and question_id=qid order by audience loop
   perform bank_summary.add_fact(s,x.audience,x.fact,1);
   if x.audience<>'00000000-0000-0000-0000-000000000000' then perform bank_summary.add_fact(s,x.audience,new_common,-1);end if;
  end loop;
 end if;
 if old_originals is distinct from new_originals then
  delete from bank_summary.originals where space_id=s and question_id=qid;
  insert into bank_summary.originals select s,qid,audience,fact from bank_summary.selected(s,qid,true);
 end if;
 return coalesce(keys,'[]');
end $$;
create function bank_summary.mark() returns trigger language plpgsql security definer set search_path='' as $$
declare qid uuid;s uuid;begin
 if tg_table_name='bank_entries' then
  insert into bank_summary.dirty select txid_current(),space_id,question_id from public.bank_catalog where commit_id=new.id on conflict do nothing;return null;
 end if;
 if tg_table_name='bank_questions' then qid:=coalesce(new.id,old.id);s:=coalesce(new.space_id,old.space_id);
 elsif tg_table_name='bank_catalog' then qid:=coalesce(new.question_id,old.question_id);s:=coalesce(new.space_id,old.space_id);
 else qid:=coalesce(new.question_id,old.question_id);select space_id into s from public.bank_questions where id=qid;
  if s is null then select space_id into s from bank_summary.questions where question_id=qid limit 1;end if;
 end if;
 if s is not null then insert into bank_summary.dirty values(txid_current(),s,qid) on conflict do nothing;end if;return null;
end $$;
create function bank_summary.flush() returns trigger language plpgsql security definer set search_path='' as $$
declare x record;keys jsonb;old_count bigint;new_count bigint;old_versions bigint;new_versions bigint;begin
 if not exists(select 1 from bank_summary.dirty where transaction_id=txid_current()) and not exists(select 1 from bank_summary.storage_deltas where transaction_id=txid_current()) then return null;end if;
 -- At deferred commit phase only. Do NOT lock base question/revision/catalog rows.
 -- One ordering point across spaces avoids summary lock inversion in multi-question transactions.
 perform pg_advisory_xact_lock(1846629137,29);
 for x in select * from bank_summary.dirty where transaction_id=txid_current() order by space_id,question_id loop
  select count(*),coalesce(sum(versions),0) into old_count,old_versions from bank_summary.inventory where question_id=x.question_id;
  select count(*) into new_count from public.bank_questions where id=x.question_id;
  select count(*) into new_versions from public.bank_revisions where question_id=x.question_id and committed;
  if old_count<>new_count or old_versions<>new_versions then
   insert into bank_summary.capacity values(x.space_id,new_count-old_count,new_versions-old_versions)
    on conflict(space_id) do update set questions=bank_summary.capacity.questions+excluded.questions,versions=bank_summary.capacity.versions+excluded.versions;
   delete from bank_summary.inventory where question_id=x.question_id;
   if new_count>0 then insert into bank_summary.inventory values(x.space_id,x.question_id,new_versions);end if;
  end if;
  keys:=bank_summary.refresh_question(x.space_id,x.question_id);
  insert into bank_summary.affected select txid_current(),x.space_id,value->>0,value->1 from jsonb_array_elements(keys) on conflict do nothing;
 end loop;
 for x in select space_id,kind,key from bank_summary.affected where transaction_id=txid_current() order by space_id,kind,key loop
  if x.kind='source' then perform bank_summary.refresh_source(x.space_id,x.key#>>'{}');else perform bank_summary.refresh_statistics(x.space_id,x.kind,x.key);end if;
 end loop;
 delete from bank_summary.buckets where n=0;
 for x in select distinct space_id from bank_summary.affected where transaction_id=txid_current() loop perform bank_summary.refresh_home(x.space_id);end loop;
 delete from bank_summary.affected where transaction_id=txid_current();
 update bank_summary.storage z set objects=z.objects+d.objects,bytes=z.bytes+d.bytes,bank_bytes=z.bank_bytes+d.bank_bytes,unknown=z.unknown+d.unknown from bank_summary.storage_deltas d where d.transaction_id=txid_current();
 delete from bank_summary.storage_deltas where transaction_id=txid_current();
 delete from bank_summary.dirty where transaction_id=txid_current();return null;
end $$;
create function bank_summary.mark_storage() returns trigger language plpgsql security definer set search_path='' as $$
declare x record;delta bigint;known boolean;size bigint;begin
 for x in select old.bucket_id bucket,old.metadata metadata,-1::bigint delta where tg_op<>'INSERT' union all
  select new.bucket_id,new.metadata,1::bigint where tg_op<>'DELETE' loop
  known:=coalesce(x.metadata->>'size'~'^[0-9]+$',false);size:=case when known then (x.metadata->>'size')::bigint else 0 end;delta:=x.delta;
  insert into bank_summary.storage_deltas values(txid_current(),delta,size*delta,case when x.bucket='question-bank' then size*delta else 0 end,case when known then 0 else delta end)
   on conflict(transaction_id) do update set objects=bank_summary.storage_deltas.objects+excluded.objects,bytes=bank_summary.storage_deltas.bytes+excluded.bytes,
    bank_bytes=bank_summary.storage_deltas.bank_bytes+excluded.bank_bytes,unknown=bank_summary.storage_deltas.unknown+excluded.unknown;
 end loop;return null;
end $$;
create trigger summary_mark_storage after insert or update or delete on storage.objects for each row execute function bank_summary.mark_storage();
create constraint trigger summary_flush_storage after insert or update or delete on storage.objects deferrable initially deferred for each row execute function bank_summary.flush();
create trigger summary_mark_questions after insert or update or delete on public.bank_questions for each row execute function bank_summary.mark();
create trigger summary_mark_revisions after insert or update or delete on public.bank_revisions for each row execute function bank_summary.mark();
create trigger summary_mark_catalog after insert or update or delete on public.bank_catalog for each row execute function bank_summary.mark();
create trigger summary_mark_entries after update of props on public.bank_entries for each row execute function bank_summary.mark();
create constraint trigger summary_flush_questions after insert or update or delete on public.bank_questions deferrable initially deferred for each row execute function bank_summary.flush();
create constraint trigger summary_flush_revisions after insert or update or delete on public.bank_revisions deferrable initially deferred for each row execute function bank_summary.flush();
create constraint trigger summary_flush_catalog after insert or update or delete on public.bank_catalog deferrable initially deferred for each row execute function bank_summary.flush();
create constraint trigger summary_flush_entries after update on public.bank_entries deferrable initially deferred for each row execute function bank_summary.flush();

create function bank_summary.assert_ready(s uuid) returns void language plpgsql stable set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if not exists(select 1 from bank_summary.state where ready and version='stored-web-v1') then raise sqlstate '55000' using message='저장 집계 준비가 완료되지 않았습니다';end if;
end $$;
create function bank_summary.buckets_for(s uuid,u uuid,k text) returns table(key jsonb,n numeric) language sql stable set search_path='' as $$
 select key,sum(n) from bank_summary.buckets where space_id=s and kind=k and audience in('00000000-0000-0000-0000-000000000000'::uuid,u) group by key having sum(n)>0;
$$;
create function bank_summary.visible_buckets(s uuid,k text) returns table(key jsonb,n numeric) language sql stable set search_path='' as $$
 select * from bank_summary.buckets_for(s,auth.uid(),k);
$$;
create function bank_summary.audience_buckets(s uuid,u uuid,k text,g jsonb) returns table(key jsonb,n numeric) language sql stable set search_path='' as $$
 select key,sum(n) from bank_summary.buckets where space_id=s and kind=k and audience in('00000000-0000-0000-0000-000000000000'::uuid,u)
  and case when k='stats' then bank_summary.group_key(key)=g else key->0=g end group by key having sum(n)>0;
$$;
create function bank_summary.stats_section(s uuid,u uuid,g jsonb,part text) returns jsonb language sql stable set search_path='' as $$
 with b as (select key,n,(key->>5)::numeric score from bank_summary.audience_buckets(s,u,'stats',g) where part='all' or key->>4=part),
 h as (select score,sum(n) n from b where score is not null group by score),
 ordered as (select *,sum(n) over(order by score) cumulative from h),
 totals as (select coalesce(sum(n),0) total,coalesce(sum(n) filter(where (key->>8)::boolean),0) analyzed,
 coalesce(sum(n) filter(where score is not null),0) numeric_count,sum(score*n) score_sum,coalesce(sum(n) filter(where score>=8),0) high from b),
 med as (select avg(score) v from ordered cross join totals cross join lateral(values(floor((numeric_count-1)/2)),(floor(numeric_count/2))) pos(i) where i>=cumulative-n and i<cumulative)
 select jsonb_build_object('total',total,'analyzed',analyzed,'numericCount',numeric_count,'average',score_sum/nullif(numeric_count,0),'median',(select v from med),
 'bandCount',numeric_count,'highShare',high/nullif(numeric_count,0),
 'distribution',jsonb_build_object('쉬움',coalesce((select sum(n) from b where score<4),0),'보통',coalesce((select sum(n) from b where score>=4 and score<6.5),0),
 '어려움',coalesce((select sum(n) from b where score>=6.5 and score<8),0),'아주어려움',high),
 'compositionDistribution',(select coalesce(jsonb_object_agg(k,v),'{}') from (select case when score is null then 'unknown' when score<=3 then 'low' when score<8 then 'middle' else 'high' end k,sum(n) v from b group by 1) z),
 'numberSources',(select coalesce(jsonb_object_agg(k,v),'{}') from (select coalesce(key->>6,'미산출') k,sum(n) v from b group by 1) z),
 'bandSources',(select coalesce(jsonb_object_agg(k,v),'{}') from (select case when score is null then '미산출' else '최종 점수 기준' end k,sum(n) v from b group by 1) z),
 'questionTypes',(select coalesce(jsonb_object_agg(k,v),'{}') from (select coalesce(t#>>'{}','undefined') k,sum(n) v from b cross join lateral jsonb_array_elements(key->7) t group by 1) z)) from totals;
$$;
create function bank_summary.statistic_value(s uuid,u uuid,kind text,g jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare v jsonb;begin
 if kind='stats' then return jsonb_build_object('school',g->0,'grade',g->1,'scope',g->2,'criteriaVersion',g->3,
  'all',bank_summary.stats_section(s,u,g,'all'),'objective',bank_summary.stats_section(s,u,g,'objective'),'written',bank_summary.stats_section(s,u,g,'written'),'unknown',bank_summary.stats_section(s,u,g,'unknown'));end if;
 with b as(select key,n,(key->>1)::numeric raw,(key->>2)::numeric points from bank_summary.audience_buckets(s,u,'point',g)),
 totals as(select sum(n) sample,count(distinct points) distinct_points from b),
 pairs as(select coalesce(sum(a.n*b.n),0) comparable,coalesce(sum(a.n*b.n) filter(where (a.raw-b.raw)*(a.points-b.points)<0),0) discordant from b a join b b on a.key<b.key and a.raw<>b.raw and a.points<>b.points)
 select case when sample>=5 and distinct_points>=2 and comparable>0 then jsonb_build_object('group',g,'sample',sample,'comparable',comparable,'discordant',discordant,'ratio',discordant/comparable,'action','internal_reference_only') end into v from totals,pairs;
 return v;
end $$;
create function bank_summary.refresh_statistics(s uuid,target_kind text,g jsonb) returns void language plpgsql set search_path='' as $$
declare u uuid;v jsonb;begin
 for u in select '00000000-0000-0000-0000-000000000000'::uuid union
  select audience from bank_summary.buckets b where b.space_id=s and b.kind=target_kind and case when target_kind='stats' then bank_summary.group_key(b.key)=g else b.key->0=g end union
  select audience from bank_summary.statistics t where t.space_id=s and t.kind=target_kind and t.key=g loop
  v:=bank_summary.statistic_value(s,u,target_kind,g);
  if u='00000000-0000-0000-0000-000000000000' and (v is null or target_kind='stats' and (v#>>'{all,total}')::numeric=0)
   or u<>'00000000-0000-0000-0000-000000000000' and not exists(select 1 from bank_summary.buckets b where b.space_id=s and b.audience=u and b.kind=target_kind and b.n<>0 and case when target_kind='stats' then bank_summary.group_key(b.key)=g else b.key->0=g end) then
   delete from bank_summary.statistics t where t.space_id=s and t.audience=u and t.kind=target_kind and t.key=g;
  else insert into bank_summary.statistics values(s,u,target_kind,g,coalesce(v,'null')) on conflict(space_id,audience,kind,key) do update set value=excluded.value;end if;
 end loop;
end $$;
create function bank_summary.composition(s uuid,u uuid default auth.uid()) returns jsonb language sql stable set search_path='' as $$
 with b as (select * from bank_summary.buckets_for(s,u,'composition')) select jsonb_build_object('total',coalesce(sum(n),0),
 'counts',jsonb_build_object('low',coalesce(sum(n) filter(where key->>0='low'),0),'middle',coalesce(sum(n) filter(where key->>0='middle'),0),
 'high',coalesce(sum(n) filter(where key->>0='high'),0),'unknown',coalesce(sum(n) filter(where key->>0='unknown'),0),'deferred',0),
 -- A subset of high, kept outside counts so total never double-counts it.
 'killerCount',coalesce(sum(n) filter(where (key->>3)::numeric>=9),0),
 'labelDisagreements',coalesce(sum(n) filter(where (key->>4)::boolean),0)) from b;
$$;
create function bank_summary.home_snapshot(s uuid,u uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare v jsonb;dash jsonb;begin
  select jsonb_build_object('questions',coalesce(sum(n),0),'pending',coalesce(sum(n) filter(where key->>0<>'approved'),0),'reviewed',coalesce(sum(n) filter(where key->>0='approved'),0)) into dash from bank_summary.buckets_for(s,u,'status');
  dash:=dash||jsonb_build_object('schools',(select count(*) from bank_summary.buckets_for(s,u,'school')),
   'sourceExams',(select count(*) from bank_summary.buckets_for(s,u,'source')),'difficulty',bank_summary.composition(s,u),'summaryVersion','stored-web-v1');
  v:=jsonb_build_object('dashboard',dash,
   'recentSources',(select coalesce(jsonb_agg(value order by updated_at desc,source_id),'[]') from (select * from bank_summary.effective_sources(s,u) where (value->>'question_count')::int>0 order by updated_at desc,source_id limit 6) x),
   'recentSchools',(select coalesce(jsonb_agg(school order by latest desc,school),'[]') from (select value#>>'{source,school}' school,max(updated_at) latest from bank_summary.effective_sources(s,u) where (value->>'question_count')::int>0 and nullif(value#>>'{source,school}','') is not null group by value#>>'{source,school}') x));
 return v;
end $$;
create function bank_summary.refresh_home(s uuid) returns void language plpgsql set search_path='' as $$
declare u uuid;v jsonb;dash jsonb;begin
 for u in select '00000000-0000-0000-0000-000000000000'::uuid union
  select distinct audience from bank_summary.questions where space_id=s union select distinct audience from bank_summary.originals where space_id=s union select audience from bank_summary.home where space_id=s loop
  if u<>'00000000-0000-0000-0000-000000000000' and not exists(select 1 from bank_summary.questions where space_id=s and audience=u) and not exists(select 1 from bank_summary.originals where space_id=s and audience=u) then
   delete from bank_summary.home where space_id=s and audience=u;continue;end if;
  v:=bank_summary.home_snapshot(s,u);
  insert into bank_summary.home values(s,u,v) on conflict(space_id,audience) do update set value=excluded.value;
 end loop;
end $$;
create function bank_summary.home_value(s uuid,u uuid) returns jsonb language sql stable set search_path='' as $$
 select value from bank_summary.home where space_id=s and audience in('00000000-0000-0000-0000-000000000000'::uuid,u) order by audience='00000000-0000-0000-0000-000000000000' limit 1;
$$;
create or replace function public.bank_dashboard(s uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb;begin
 perform bank_summary.assert_ready(s);v:=bank_summary.home_value(s,auth.uid())->'dashboard';
 if v is null then raise sqlstate '55000' using message='저장 집계 준비가 완료되지 않았습니다';end if;
 -- The legacy, time-relative recent counter is not used by the home screen.
 return v||jsonb_build_object('recent',coalesce((select sum(n) from bank_summary.buckets where space_id=s and kind='registered' and audience in('00000000-0000-0000-0000-000000000000'::uuid,auth.uid()) and (key->>0)::timestamptz>=now()-interval '7 days'),0),'asOf',now());
end $$;
create function bank_summary.source_value(s uuid,v jsonb) returns jsonb language sql stable set search_path='' as $$
 select v||jsonb_build_object('progress',coalesce((select to_jsonb(p) from public.bank_source_progress p where space_id=s and source_id=v->>'source_id'),'{}')||
 jsonb_build_object('numbering',(select numbering from public.bank_source_numbering where space_id=s and source_id=v->>'source_id'),
 'expected_count',(select expected_count from public.bank_source_progress where space_id=s and source_id=v->>'source_id')));
$$;
create or replace function public.bank_source_exams(s uuid,start_at integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform bank_summary.assert_ready(s);
 return (select coalesce(jsonb_agg(bank_summary.source_value(s,value) order by updated_at desc,source_id),'[]') from
  (select * from bank_summary.effective_sources(s,auth.uid()) where (value->>'question_count')::int>0 order by updated_at desc,source_id limit 50 offset greatest(0,start_at)) t);
end $$;
create function public.bank_source_difficulty(s uuid,source_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb;begin
 perform bank_summary.assert_ready(s);
 select value->'difficulty' into v from bank_summary.sources where space_id=s and source_id=source_key and audience in('00000000-0000-0000-0000-000000000000'::uuid,auth.uid()) order by audience='00000000-0000-0000-0000-000000000000' limit 1;
 -- A visible original list can have zero current rows when its newer revision
 -- is derived. This is an exact empty result, not an unavailable summary.
 if not exists(select 1 from bank_summary.effective_sources(s,auth.uid()) where source_id=source_key and (value->>'question_count')::integer>0) then v:=null;end if;
 if v is null then raise insufficient_privilege;end if;return v;
end $$;
create function public.bank_home_summary(s uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb;begin
 perform bank_summary.assert_ready(s);v:=bank_summary.home_value(s,auth.uid());
 if v is null then raise sqlstate '55000' using message='저장 집계 준비가 완료되지 않았습니다';end if;
 return v||jsonb_build_object('dashboard',v->'dashboard'||jsonb_build_object('asOf',now()),'recentSources',
  (select coalesce(jsonb_agg(bank_summary.source_value(s,x) order by ord),'[]') from jsonb_array_elements(v->'recentSources') with ordinality t(x,ord)));
end $$;
-- Materialized display summaries. No browser aggregation or per-question rows.
create function public.bank_difficulty_summary(s uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform bank_summary.assert_ready(s);
 return (with visible as(select p.* from bank_summary.statistics p where p.space_id=s and p.audience='00000000-0000-0000-0000-000000000000'
  and not exists(select 1 from bank_summary.statistics a where a.space_id=s and a.audience=auth.uid() and a.kind=p.kind and a.key=p.key)
  union all select a.* from bank_summary.statistics a where a.space_id=s and a.audience=auth.uid())
  select jsonb_build_object('groups',coalesce(jsonb_agg(value order by key) filter(where kind='stats' and (value#>>'{all,total}')::numeric>0),'[]'),
   'signals',coalesce(jsonb_agg(value order by key) filter(where kind='point' and value<>'null'::jsonb),'[]')) from visible);
end $$;
create or replace function public.bank_project_usage(s uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb;begin
 if not public.bank_member(s,true) then raise insufficient_privilege;end if;
 perform bank_summary.assert_ready(s);
 select jsonb_build_object('measuredAt',clock_timestamp(),'databaseBytes',(select coalesce(sum(pg_database_size(datname)),0) from pg_catalog.pg_database),
  'storageBytes',bytes,'storageObjects',objects,'storageUnknownSizeObjects',unknown,'bankStorageBytes',bank_bytes,
  'questions',coalesce((select questions from bank_summary.capacity where space_id=s),0),'committedVersions',coalesce((select versions from bank_summary.capacity where space_id=s),0)) into v from bank_summary.storage;
 return v;
end $$;

-- Operator-only recovery. Rebuild is a controlled full scan, never a read fallback.
create function bank_summary.rebuild() returns void language plpgsql set search_path='' as $$
declare x record;begin
 lock table public.bank_questions,public.bank_revisions,public.bank_catalog in share row exclusive mode;
 lock table storage.objects in share row exclusive mode;
 perform pg_advisory_xact_lock(1846629137,29);
 update bank_summary.state set ready=false;
 truncate bank_summary.questions,bank_summary.originals,bank_summary.buckets,bank_summary.sources,bank_summary.statistics,bank_summary.home,bank_summary.inventory,bank_summary.capacity;
 insert into bank_summary.inventory select q.space_id,q.id,count(r.id) filter(where r.committed) from public.bank_questions q left join public.bank_revisions r on r.question_id=q.id group by q.space_id,q.id;
 insert into bank_summary.capacity select space_id,count(*),sum(versions) from bank_summary.inventory group by space_id;
 update bank_summary.storage set (objects,bytes,bank_bytes,unknown)=(select count(*),coalesce(sum(case when metadata->>'size'~'^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0),
  coalesce(sum(case when bucket_id='question-bank' and metadata->>'size'~'^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0),
  count(*) filter(where metadata->>'size' is null or metadata->>'size'!~'^[0-9]+$') from storage.objects);
 for x in select distinct space_id,id from public.bank_questions order by space_id,id loop perform bank_summary.refresh_question(x.space_id,x.id);end loop;
 for x in select distinct space_id,fact->>'source_id' k from bank_summary.originals where fact->>'source_id' is not null loop perform bank_summary.refresh_source(x.space_id,x.k);end loop;
 for x in select distinct space_id,kind,case when kind='stats' then bank_summary.group_key(key) else key->0 end g from bank_summary.buckets where kind in('stats','point') loop perform bank_summary.refresh_statistics(x.space_id,x.kind,x.g);end loop;
 delete from bank_summary.buckets where n=0;
 for x in select id from public.bank_spaces loop perform bank_summary.refresh_home(x.id);end loop;
 -- A repair may follow operator writes in this same transaction. The rebuilt
 -- snapshot already includes them; its queued deltas must not be applied twice.
 delete from bank_summary.dirty where transaction_id=txid_current();
 delete from bank_summary.affected where transaction_id=txid_current();
 delete from bank_summary.storage_deltas where transaction_id=txid_current();
 update bank_summary.state set ready=true;
end $$;
create function bank_summary.audit() returns jsonb language sql stable set search_path='' as $$
 with expected as (select q.space_id,q.id question_id,x.* from public.bank_questions q cross join lateral bank_summary.selected(q.space_id,q.id) x),
 original_expected as (select q.space_id,q.id question_id,x.* from public.bank_questions q cross join lateral bank_summary.selected(q.space_id,q.id,true) x),
 original_projection_diff as ((select * from original_expected except select * from bank_summary.originals) union all (select * from bank_summary.originals except select * from original_expected)),
 projection_diff as ((select * from expected except select * from bank_summary.questions) union all (select * from bank_summary.questions except select * from expected)),
 contributions as (select space_id,audience,fact,1 delta from expected union all
  select a.space_id,a.audience,p.fact,-1 from expected a join expected p on p.space_id=a.space_id and p.question_id=a.question_id and p.audience='00000000-0000-0000-0000-000000000000' where a.audience<>'00000000-0000-0000-0000-000000000000'),
 expected_buckets as (select space_id,audience,b.kind,b.key,sum(delta)::numeric n from contributions cross join lateral bank_summary.fact_buckets(fact) b group by space_id,audience,b.kind,b.key having sum(delta)<>0),
 bucket_diff as ((select * from expected_buckets except select * from bank_summary.buckets) union all (select * from bank_summary.buckets except select * from expected_buckets)),
 source_keys as (select space_id,audience,fact->>'source_id' k from original_expected where fact->>'source_id' is not null union
  select a.space_id,a.audience,p.fact->>'source_id' from original_expected a join original_expected p on p.space_id=a.space_id and p.question_id=a.question_id and p.audience='00000000-0000-0000-0000-000000000000' where a.audience<>'00000000-0000-0000-0000-000000000000' and p.fact->>'source_id' is not null union
  select space_id,audience,fact->>'source_id' from expected where fact->>'source_id' is not null union
  select a.space_id,a.audience,p.fact->>'source_id' from expected a join expected p on p.space_id=a.space_id and p.question_id=a.question_id and p.audience='00000000-0000-0000-0000-000000000000' where a.audience<>'00000000-0000-0000-0000-000000000000' and p.fact->>'source_id' is not null),
 expected_sources as (select space_id,audience,k source_id,bank_summary.source_snapshot(space_id,audience,k) value from source_keys),
 source_diff as ((select * from expected_sources except select space_id,audience,source_id,value from bank_summary.sources) union all
  (select space_id,audience,source_id,value from bank_summary.sources except select * from expected_sources)),
 statistic_keys as (select distinct space_id,audience,kind,case when kind='stats' then bank_summary.group_key(key) else key->0 end key from expected_buckets where kind in('stats','point')),
 statistic_values as (select *,bank_summary.statistic_value(space_id,audience,kind,key) value from statistic_keys),
 expected_statistics as (select space_id,audience,kind,key,coalesce(value,'null'::jsonb) value from statistic_values where audience<>'00000000-0000-0000-0000-000000000000' or value is not null and (kind='point' or (value#>>'{all,total}')::numeric>0)),
 statistic_diff as ((select * from expected_statistics except select * from bank_summary.statistics) union all (select * from bank_summary.statistics except select * from expected_statistics)),
 physical as (select q.space_id,q.id question_id,count(r.id) filter(where r.committed) versions from public.bank_questions q left join public.bank_revisions r on r.question_id=q.id group by q.space_id,q.id),
 inventory_diff as ((select * from physical except select * from bank_summary.inventory) union all (select * from bank_summary.inventory except select * from physical)),
 capacities as (select space_id,count(*) questions,sum(versions) versions from physical group by space_id),
 capacity_diff as (select 1 from capacities e full join bank_summary.capacity a using(space_id) where coalesce(e.questions,0)<>coalesce(a.questions,0) or coalesce(e.versions,0)<>coalesce(a.versions,0)),
 home_keys as (select id space_id,'00000000-0000-0000-0000-000000000000'::uuid audience from public.bank_spaces union select distinct space_id,audience from expected union select distinct space_id,audience from original_expected),
 expected_home as (select space_id,audience,bank_summary.home_snapshot(space_id,audience) value from home_keys),
 home_diff as ((select * from expected_home except select * from bank_summary.home) union all (select * from bank_summary.home except select * from expected_home)),
 storage_expected as (select count(*) objects,coalesce(sum(case when metadata->>'size'~'^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0) bytes,
 coalesce(sum(case when bucket_id='question-bank' and metadata->>'size'~'^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0) bank_bytes,count(*) filter(where metadata->>'size' is null or metadata->>'size'!~'^[0-9]+$') unknown from storage.objects)
 select jsonb_build_object('projectionDifferences',(select count(*) from projection_diff),'originalProjectionDifferences',(select count(*) from original_projection_diff),'bucketDifferences',(select count(*) from bucket_diff),
 'sourceDifferences',(select count(*) from source_diff),'statisticDifferences',(select count(*) from statistic_diff),'inventoryDifferences',(select count(*) from inventory_diff),
 'homeDifferences',(select count(*) from home_diff),'capacityDifferences',(select count(*) from capacity_diff),'storageDifferences',(select count(*) from storage_expected e cross join bank_summary.storage a where (e.objects,e.bytes,e.bank_bytes,e.unknown) is distinct from (a.objects,a.bytes,a.bank_bytes,a.unknown)),
 'ready',(select ready from bank_summary.state),'dirtyTransactions',(select count(distinct transaction_id) from bank_summary.dirty),'checkedAt',now());
$$;
create function bank_summary.new_space() returns trigger language plpgsql security definer set search_path='' as $$ begin perform bank_summary.refresh_home(new.id);return null;end $$;
create trigger summary_new_space after insert on public.bank_spaces for each row execute function bank_summary.new_space();
select bank_summary.rebuild();
revoke all on all functions in schema bank_summary from public,anon,authenticated,service_role;
revoke all on function public.bank_home_summary(uuid),public.bank_source_difficulty(uuid,text),public.bank_difficulty_summary(uuid) from public,anon;
grant execute on function public.bank_home_summary(uuid),public.bank_source_difficulty(uuid,text),public.bank_difficulty_summary(uuid) to authenticated;
commit;
