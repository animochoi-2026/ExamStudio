-- v1.2.1 staging and atomic cutover. No evaluation or score change on migration.
create schema bank_v121;
revoke all on schema bank_v121 from public,anon,authenticated;
create table bank_v121.jobs(
 id uuid primary key,space_id uuid not null references public.bank_spaces(id),
 policy jsonb not null,expected_count integer not null check(expected_count>0),
 status text not null default 'staging' check(status in('staging','activated','rolled_back')),
 acceptance jsonb,created_at timestamptz not null default now(),activated_at timestamptz
);
create table bank_v121.items(
 job_id uuid not null references bank_v121.jobs(id),question_id uuid not null,
 revision_id uuid not null,review_version integer not null,snapshot jsonb not null,
 result jsonb,activated_metadata jsonb,activated_confirmed jsonb,
 primary key(job_id,question_id),unique(job_id,revision_id)
);
alter table bank_v121.jobs enable row level security;
alter table bank_v121.items enable row level security;
revoke all on all tables in schema bank_v121 from public,anon,authenticated;
grant usage on schema bank_v121 to service_role;
grant all on all tables in schema bank_v121 to service_role;

-- Pure numeric parser; do not grant clients access to private summary internals.
create function bank_v121.score(v jsonb) returns numeric language plpgsql immutable set search_path='' as $$
declare t text:=v#>>'{}';n numeric;
begin
 if t is null or t !~ '^\d+(\.\d+)?$' then return null;end if;
 n:=t::numeric;return case when n between 1 and 10 then n end;
end $$;
revoke all on function bank_v121.score(jsonb) from public,anon;
grant execute on function bank_v121.score(jsonb) to authenticated,service_role;

-- Owner-authenticated result import only. It cannot activate or edit live scores.
create function public.bank_v121_import(s uuid,j uuid,p jsonb,expected integer,items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job bank_v121.jobs;v jsonb;c public.bank_catalog;r public.bank_revisions;old bank_v121.items;n integer:=0;
begin
 if auth.uid() is null or not public.bank_member(s,true) then raise insufficient_privilege;end if;
 if expected is null or expected<1 or expected>10000 or jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items)>20 or
  coalesce(p->>'promptHash','') !~ '^[a-f0-9]{64}$' or coalesce(p->>'schemaHash','') !~ '^[a-f0-9]{64}$' or coalesce(p->>'profileVersion','') !~ '^[a-f0-9]{64}$'
 then raise exception 'Invalid import envelope';end if;
 insert into bank_v121.jobs(id,space_id,policy,expected_count) values(j,s,p,expected) on conflict(id) do nothing;
 select * into strict job from bank_v121.jobs where id=j for update;
 if job.space_id<>s or job.policy is distinct from p or job.expected_count<>expected or job.status<>'staging' then raise exception 'Frozen job mismatch';end if;
 for v in select * from jsonb_array_elements(items) loop
  select * into c from public.bank_catalog where revision_id=(v->>'revisionId')::uuid;
  select * into r from public.bank_revisions where id=c.revision_id;
  if c.revision_id is null or c.question_id::text is distinct from v->>'questionId' or c.space_id<>s or not r.committed or
   r.review_version is distinct from (v->>'reviewVersion')::integer or c.metadata is distinct from v#>'{snapshot,metadata}' or
   c.confirmed is distinct from v#>'{snapshot,confirmed}' or c.content is distinct from v#>'{snapshot,content}' or c.files is distinct from v#>'{snapshot,files}' or
   exists(select 1 from public.bank_questions q where q.id=c.question_id and q.archived) or
   exists(select 1 from public.bank_revisions child where child.parent_id=r.id and child.committed)
  then raise exception 'Snapshot no longer current';end if;
  select * into old from bank_v121.items where job_id=j and question_id=c.question_id;
  if found then
   if old.revision_id<>c.revision_id or old.snapshot is distinct from v->'snapshot' or old.result is distinct from v->'result' then raise exception 'Staged item is immutable';end if;
  else
   insert into bank_v121.items(job_id,question_id,revision_id,review_version,snapshot,result) values(j,c.question_id,c.revision_id,r.review_version,v->'snapshot',v->'result');
  end if;n:=n+1;
 end loop;
 if (select count(*) from bank_v121.items where job_id=j)>expected then raise exception 'Target count exceeded';end if;
 return jsonb_build_object('imported',n,'liveScoresChanged',false);
end $$;
revoke all on function public.bank_v121_import(uuid,uuid,jsonb,integer,jsonb) from public,anon;
grant execute on function public.bank_v121_import(uuid,uuid,jsonb,integer,jsonb) to authenticated;

create function bank_v121.activate(j uuid,checks jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare job bank_v121.jobs;total integer;failures integer;
begin
 select * into strict job from bank_v121.jobs where id=j for update;
 if job.status='activated' then return jsonb_build_object('status','already_activated','count',job.expected_count);end if;
 if job.status<>'staging' or checks->>'acceptancePassed' is distinct from 'true'
 or checks->>'systemError' is not null or checks->>'profileVersion' is distinct from job.policy->>'profileVersion'
 then raise exception 'Acceptance or system gate blocked';end if;
 select count(*),count(*) filter(where result->>'final_status'='failed') into total,failures from bank_v121.items where job_id=j;
 if total<>job.expected_count or failures::numeric/total>0.05 then raise exception 'Incomplete target set or failure rate above 5%%';end if;
 if exists(select 1 from bank_v121.items i where i.job_id=j and (
  i.result is null or coalesce(i.result->>'final_status','') not in('complete','failed') or
  i.result->>'question_id' is distinct from i.question_id::text or i.result->>'question_revision_id' is distinct from i.revision_id::text or
  i.result->>'spec_revision' is distinct from '1.2.1' or i.result->>'prompt_hash' is distinct from job.policy->>'promptHash' or
  i.result->>'json_schema_hash' is distinct from job.policy->>'schemaHash' or i.result->>'scorer_code_hash' is distinct from job.policy->>'scorerCodeHash' or
  i.result->>'profile_version' is distinct from job.policy->>'profileVersion' or
  coalesce(i.result->>'final_stage','') not in('1','2','3') or
  i.result->>'final_model' is distinct from case when i.result->>'final_stage'='1' then 'gpt-6-luna' else 'gpt-6.1-sol' end or
  i.result->>'final_reasoning_effort' is distinct from case when i.result->>'final_stage'='3' then 'high' else 'medium' end or
  (i.result->>'final_status'='complete' and (i.result#>>array['stage'||(i.result->>'final_stage')||'_validation_result','valid'] is distinct from 'true' or i.result#>>array['stage'||(i.result->>'final_stage')||'_validation_result','solution_validated'] is distinct from 'true')) or
  (i.result->>'final_status'='failed' and i.result->>'final_stage' is distinct from '3') or
  (i.result->>'final_status'='complete' and (coalesce(i.result->>'final_tier','') !~ '^T[0-5]$' or coalesce(bank_v121.score(i.result->'final_score'),-1) not between 1 and 10)) or
  (i.result->>'final_status'='failed' and (i.result->'final_score' is distinct from 'null'::jsonb or i.result->'final_tier' is distinct from 'null'::jsonb))
 )) then raise exception 'Invalid staged result';end if;
 -- Locks also serialize review writes and competing revision publication.
 perform 1 from public.bank_questions q join bank_v121.items i on i.question_id=q.id where i.job_id=j order by q.id for update of q;
 perform 1 from public.bank_revisions r join bank_v121.items i on i.revision_id=r.id where i.job_id=j order by r.id for update of r;
 perform 1 from public.bank_catalog c join bank_v121.items i on i.revision_id=c.revision_id where i.job_id=j order by c.revision_id for update of c;
 if exists(select 1 from bank_v121.items i left join public.bank_catalog c on c.revision_id=i.revision_id
  left join public.bank_revisions r on r.id=i.revision_id left join public.bank_questions q on q.id=i.question_id
  where i.job_id=j and (c.revision_id is null or c.space_id<>job.space_id or q.archived or not r.committed or
   r.review_version<>i.review_version or c.metadata is distinct from i.snapshot->'metadata' or c.confirmed is distinct from i.snapshot->'confirmed' or
   c.content is distinct from i.snapshot->'content' or c.files is distinct from i.snapshot->'files' or
   exists(select 1 from public.bank_revisions n where n.parent_id=r.id and n.committed))) then raise exception 'Concurrent content or review change';end if;
 update bank_v121.items i set
  activated_metadata=jsonb_set(i.snapshot->'metadata','{difficulty}',
   jsonb_strip_nulls(jsonb_build_object('scope',i.snapshot#>'{metadata,difficulty,scope}','isReference',i.snapshot#>'{metadata,difficulty,isReference}')) ||
   jsonb_build_object('auto_score',i.result->'final_score','auto_tier',i.result->'final_tier','auto_evaluation_id',j,
    'teacher_override_score',null,'teacher_override_reason',null,'teacher_override_by',null,'teacher_override_at',null,'teacher_override_active',false,
    'effective_score',i.result->'final_score','effective_score_source','v1.2.1','assessmentStatus',i.result->>'final_status',
    'criteriaVersion','insight-bottleneck-v1.2.1','v121Active',i.result),true),
  activated_confirmed=(i.snapshot->'confirmed')-'difficulty'-'difficultyBand'
 where i.job_id=j;
 update public.bank_catalog c set metadata=i.activated_metadata,confirmed=i.activated_confirmed
 from bank_v121.items i where i.job_id=j and c.revision_id=i.revision_id;
 update bank_v121.jobs set status='activated',acceptance=checks,activated_at=now() where id=j;
 return jsonb_build_object('status','activated','count',total,'failed',failures);
end $$;
revoke all on function bank_v121.activate(uuid,jsonb) from public,anon,authenticated;
grant execute on function bank_v121.activate(uuid,jsonb) to service_role;

create function bank_v121.rollback(j uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare job bank_v121.jobs;
begin
 select * into strict job from bank_v121.jobs where id=j for update;
 if job.status='rolled_back' then return jsonb_build_object('status','already_rolled_back');end if;
 if job.status<>'activated' then raise exception 'Job not activated';end if;
 perform 1 from public.bank_catalog c join bank_v121.items i on i.revision_id=c.revision_id where i.job_id=j order by c.revision_id for update of c;
 if exists(select 1 from bank_v121.items i left join public.bank_catalog c on c.revision_id=i.revision_id where i.job_id=j and
  (c.revision_id is null or c.metadata is distinct from i.activated_metadata or c.confirmed is distinct from i.activated_confirmed or c.content is distinct from i.snapshot->'content' or c.files is distinct from i.snapshot->'files' or
   exists(select 1 from public.bank_revisions n where n.parent_id=i.revision_id and n.committed))) then raise exception 'Post-activation edits preserved; rollback blocked';end if;
 update public.bank_catalog c set metadata=i.snapshot->'metadata',confirmed=i.snapshot->'confirmed' from bank_v121.items i where i.job_id=j and c.revision_id=i.revision_id;
 update bank_v121.jobs set status='rolled_back' where id=j;return jsonb_build_object('status','rolled_back','count',job.expected_count);
end $$;
revoke all on function bank_v121.rollback(uuid) from public,anon,authenticated;
grant execute on function bank_v121.rollback(uuid) to service_role;

create function bank_v121.projection(rid uuid,m jsonb,f jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare d jsonb:=m->'difficulty';r jsonb:=coalesce(nullif(d->'v121Active','null'),d#>'{v121Latest,record}');raw numeric;n numeric;manual numeric;stale boolean;band text;
begin
 if r is null or r='null' then return null;end if;
 stale:=coalesce(d->>'reassessmentRequired','false')='true' or coalesce(m#>>'{analysis,status}','')='stale' or
  (rid is not null and d->'v121Active' is not null and r->>'question_revision_id' is distinct from rid::text) or
  (d#>>'{v121Latest,inputBasis}' is not null and d#>>'{v121Latest,inputBasis}' is distinct from m#>>'{analysis,basis}');
 if not stale and r->>'final_status'='complete' then raw:=bank_v121.score(r->'final_score');end if;
 manual:=coalesce(bank_v121.score(f->'difficulty'),bank_v121.score(d->'userScore'),
  case when d->>'teacher_override_active'='true' then bank_v121.score(d->'teacher_override_score') end);
 n:=coalesce(manual,raw);
 band:=case when n is null then null when n<=3 then '쉬움' when n<8 then '보통' when n<9 then '어려움' else '아주어려움' end;
 return jsonb_build_object('score',n,'raw',raw,'numberSource',case when manual is not null then '교사 조정' else 'AI v1.2.1' end,
  'band',band,'analyzed',raw is not null,'criteriaVersion','insight-bottleneck-v1.2.1','base_tier',r#>'{computed,base_tier}',
  'promotions',r#>'{computed,promotions}','status',case when stale then 'stale' else r->>'final_status' end);
end $$;
grant usage on schema bank_v121 to authenticated;
revoke all on function bank_v121.projection(uuid,jsonb,jsonb) from public,anon;
grant execute on function bank_v121.projection(uuid,jsonb,jsonb) to authenticated,service_role;

-- Preserve the old implementation only for documents with no v1.2.1 record.
do $$begin
 execute replace(pg_get_functiondef('public.bank_difficulty_number(jsonb,jsonb)'::regprocedure),
  'FUNCTION public.bank_difficulty_number(', 'FUNCTION public.bank_difficulty_number_before_v121(');
 execute replace(pg_get_functiondef('bank_summary.row_difficulty(uuid,jsonb,jsonb)'::regprocedure),
  'FUNCTION bank_summary.row_difficulty(', 'FUNCTION bank_summary.row_difficulty_before_v121(');
end $$;
revoke all on function public.bank_difficulty_number_before_v121(jsonb,jsonb) from public,anon;
grant execute on function public.bank_difficulty_number_before_v121(jsonb,jsonb) to authenticated;
revoke all on function bank_summary.row_difficulty_before_v121(uuid,jsonb,jsonb) from public,anon,authenticated;
-- Preserve the original function OIDs and ACLs for existing callers/dependencies.
create or replace function public.bank_difficulty_number(m jsonb,f jsonb) returns numeric language sql immutable set search_path='' as $$
 select case when bank_v121.projection(null,m,f) is not null then bank_v121.score(bank_v121.projection(null,m,f)->'score')
 else public.bank_difficulty_number_before_v121(m,f) end;
$$;
revoke all on function public.bank_difficulty_number(jsonb,jsonb) from public,anon;
grant execute on function public.bank_difficulty_number(jsonb,jsonb) to authenticated;
create or replace function bank_summary.row_difficulty(revision_id uuid,m jsonb,f jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(bank_v121.projection(revision_id,m,f),bank_summary.row_difficulty_before_v121(revision_id,m,f));
$$;
revoke all on function bank_summary.row_difficulty(uuid,jsonb,jsonb) from public,anon,authenticated;
