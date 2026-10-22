-- Authorized final 1266 only. No activation in migration; immutable staging and rollback.
create schema bank_v123;
revoke all on schema bank_v123 from public,anon,authenticated;
create table bank_v123.policy(id boolean primary key default true check(id),enabled boolean not null default false,
 manifest_hash text not null,desktop_version text not null,metadata jsonb not null);
create table bank_v123.batches(id uuid primary key,space_id uuid not null references public.bank_spaces(id),
 candidate_hash text not null check(candidate_hash='9d854707e80f0f459b4baa5f3dc44daea1be015ca9ae3ec8af2869b294566e88'),
 common_hash text not null check(common_hash='32150b5cb2399497f597fc9546d1ce72509bb194ddd80b3ff3af0962b8bad452'),
 code_rc text not null check(code_rc='1b45f5ec96ee6609ba811f90f265ed519cebee71'),
 expected_count int not null default 1266 check(expected_count=1266),
 status text not null default 'staging' check(status in ('staging','activated','rolled_back')),
 created_at timestamptz not null default now(),snapshot_at timestamptz,activated_at timestamptz,
 ratings_snapshot jsonb,previous_policy jsonb,deployment_evidence jsonb,checks jsonb);
create table bank_v123.items(batch_id uuid not null references bank_v123.batches(id),question_id uuid not null,revision_id uuid not null,
 review_version int not null,expected_metadata jsonb not null,expected_confirmed jsonb not null,
 result jsonb not null,result_hash text not null,snapshot jsonb,activated_metadata jsonb,
 primary key(batch_id,question_id),unique(batch_id,revision_id));
alter table bank_v123.policy enable row level security;
alter table bank_v123.batches enable row level security;
alter table bank_v123.items enable row level security;
revoke all on all tables in schema bank_v123 from public,anon,authenticated;
grant usage on schema bank_v123 to service_role;
grant all on all tables in schema bank_v123 to service_role;
insert into bank_v123.policy(id,manifest_hash,desktop_version,metadata) values(true,
'32150b5cb2399497f597fc9546d1ce72509bb194ddd80b3ff3af0962b8bad452','0.4.57',
'{"evaluation_manifest_hash":"32150b5cb2399497f597fc9546d1ce72509bb194ddd80b3ff3af0962b8bad452","base_evaluation_manifest_hash":"4643246252e2e848db13268f9f7446016d57bd32d3ceebee4bb539296029aa80","difficulty_output_budget_policy_version":"provider-default-or-model-max-no-artificial-cap-r1","application_output_cap":"none","output_limit_parameter_omitted":true,"low_cap_first_pass":false,"retry_full_request_with_higher_cap":false,"spec_revision":"difficulty-v1.2.3-rc1"}');

create function bank_v123.projection(rid uuid,m jsonb,f jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare d jsonb:=m->'difficulty';r jsonb:=d->'v123Active';raw numeric;n numeric;manual numeric;stale boolean;band text;composition text;
begin
 if r is null or r='null' then return null;end if;
 stale:=coalesce(d->>'reassessmentRequired','false')='true' or (rid is not null and r->>'question_revision_id' is distinct from rid::text);
 if not stale and r->>'final_status'='complete' then raw:=bank_v121.score(r->'final_score');end if;
 manual:=coalesce(bank_v121.score(f->'difficulty'),bank_v121.score(d->'userScore'),
 case when d->>'teacher_override_active'='true' then bank_v121.score(d->'teacher_override_score') end);
 n:=coalesce(manual,raw);
 composition:=case when n is null then 'unknown' when manual is not null then bank_v121.display_band(null,n,true)
 else coalesce('{"T0":"low","T1":"low","T2":"middle","T3":"middle","T4":"high","T5":"killer"}'::jsonb->>(r->>'final_tier'),'unknown') end;
 band:=case composition when 'low' then '쉬움' when 'middle' then '보통' when 'high' then '어려움' when 'killer' then '아주어려움' end;
 return jsonb_build_object('score',n,'raw',raw,'numberSource',case when manual is not null then '교사 조정' else 'AI v1.2.3' end,
 'band',band,'analyzed',raw is not null,'criteriaVersion','difficulty-v1.2.3','base_tier',r#>'{computed,base_tier}',
 'promotions',r#>'{computed,promotions}','status',case when manual is not null then 'complete' when stale then 'stale' else r->>'final_status' end,
 'finalTier',r->'final_tier','compositionBand',composition,'displayMappingVersion','tier-display-v123-1',
 'evaluationManifest',r->'common_evaluation_manifest_hash','activationBatchId',r->'activation_batch_id');
end $$;
grant usage on schema bank_v123 to anon,authenticated;
grant execute on function bank_v123.projection(uuid,jsonb,jsonb) to anon,authenticated,service_role;
create function public.bank_v123_policy(s uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.bank_member(s) then raise insufficient_privilege;end if;
 return (select metadata||jsonb_build_object('production_activation_enabled',enabled,'minimumDesktopVersion',desktop_version) from bank_v123.policy where id);
end $$;
revoke all on function public.bank_v123_policy(uuid) from public,anon;
grant execute on function public.bank_v123_policy(uuid) to authenticated;

create function bank_v123.prepare_snapshot(b uuid) returns jsonb language plpgsql set search_path='' as $$
declare job bank_v123.batches;
begin
 select * into strict job from bank_v123.batches where id=b for update;
 if job.status<>'staging' or job.snapshot_at is not null then raise exception 'Snapshot must be new';end if;
 if job.ratings_snapshot is distinct from (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.bank_difficulty_ratings t) then raise exception 'Teacher ratings changed before snapshot';end if;
 lock table public.bank_questions,public.bank_revisions,public.bank_catalog,public.bank_difficulty_ratings in share row exclusive mode;
 if (select count(*) from bank_v123.items where batch_id=b)<>1266 then raise exception 'Incomplete candidate';end if;
 if (select count(*) from public.bank_catalog c join public.bank_questions q on q.id=c.question_id join public.bank_revisions r on r.id=c.revision_id
 where q.space_id=job.space_id and not q.archived and r.committed and not exists(select 1 from public.bank_revisions ch where ch.parent_id=r.id and ch.committed))<>1266
 then raise exception 'Current valid set changed';end if;
 if exists(select 1 from bank_v123.items i left join public.bank_catalog c on c.revision_id=i.revision_id
 left join public.bank_revisions r on r.id=i.revision_id left join public.bank_questions q on q.id=i.question_id
 where i.batch_id=b and (c.revision_id is null or c.question_id<>i.question_id or c.space_id<>job.space_id or q.archived or not r.committed
 or r.review_version<>i.review_version or c.metadata is distinct from i.expected_metadata or c.confirmed is distinct from i.expected_confirmed
 or bank_v121.hash(c.content) is distinct from i.result->>'source_content_hash' or bank_v121.hash(c.files) is distinct from i.result->>'source_files_hash'
 or exists(select 1 from public.bank_revisions ch where ch.parent_id=r.id and ch.committed)
 or bank_v121.hash(i.result)<>i.result_hash or i.result->>'candidate_manifest_hash'<>job.candidate_hash
 or i.result->>'common_evaluation_manifest_hash'<>job.common_hash or i.result->>'code_rc_commit'<>job.code_rc
 or i.result->>'final_status'<>'complete' or i.result->>'question_id'<>i.question_id::text or i.result->>'question_revision_id'<>i.revision_id::text
 or bank_v121.score(i.result->'final_score') is null or coalesce(i.result->>'final_tier','') !~ '^T[0-5]$'))
 then raise exception 'Candidate or current identity/review conflict';end if;
 update bank_v123.items i set snapshot=jsonb_build_object('metadata',c.metadata,'confirmed',c.confirmed,'content',c.content,'files',c.files,'review_version',r.review_version),
 activated_metadata=jsonb_set(c.metadata,'{difficulty}',coalesce(c.metadata->'difficulty','{}')||jsonb_build_object(
 'v121Active',null,'v121Latest',null,'v12Active',null,'v12Latest',null,
 'v123Active',i.result||jsonb_build_object('activation_batch_id',b),
 'auto_score',i.result->'final_score','auto_tier',i.result->'final_tier','auto_evaluation_id',i.result->'request_id',
 'effective_score',coalesce(c.confirmed->'difficulty',nullif(c.metadata#>'{difficulty,userScore}','null'),i.result->'final_score'),
 'effective_score_source','auto','criteriaVersion','difficulty-v1.2.3','spec_revision','1.2.3',
 'assessmentStatus','complete','reassessmentRequired',false,'activation_batch_id',b,'activated_at',now()),true)
 from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id where i.batch_id=b and i.revision_id=c.revision_id;
 update bank_v123.batches set snapshot_at=now(),ratings_snapshot=(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.bank_difficulty_ratings t),
 previous_policy=(select to_jsonb(p) from bank_v123.policy p where id) where id=b;
 return jsonb_build_object('snapshot_count',1266,'production_scores_changed',false,'batch_id',b);
end $$;

-- Private primitive supports a transaction-only full swap/restore dry-run.
-- Actual production use MUST go through activate(), which requires deployment gates.
create function bank_v123.swap_snapshot(b uuid) returns jsonb language plpgsql set search_path='' as $$
declare job bank_v123.batches;n int;
begin
 select * into strict job from bank_v123.batches where id=b for update;
 if job.status<>'staging' or job.snapshot_at is null then raise exception 'Prepared snapshot required';end if;
 lock table public.bank_questions,public.bank_revisions,public.bank_catalog,public.bank_difficulty_ratings in share row exclusive mode;
 if job.ratings_snapshot is distinct from (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.bank_difficulty_ratings t)
 then raise exception 'New teacher ratings conflict';end if;
 if (select count(*) from bank_v123.items where batch_id=b and snapshot is not null)<>1266 or
 (select count(*) from public.bank_catalog c join public.bank_questions q on q.id=c.question_id join public.bank_revisions r on r.id=c.revision_id
 where q.space_id=job.space_id and not q.archived and r.committed and not exists(select 1 from public.bank_revisions ch where ch.parent_id=r.id and ch.committed))<>1266
 then raise exception 'Current valid set missing or added';end if;
 if exists(select 1 from bank_v123.items i left join public.bank_catalog c on c.revision_id=i.revision_id left join public.bank_revisions r on r.id=i.revision_id left join public.bank_questions q on q.id=i.question_id
 where i.batch_id=b and (c.revision_id is null or q.archived or not r.committed or c.question_id<>i.question_id or c.space_id<>job.space_id
 or r.review_version<>i.review_version or c.metadata is distinct from i.snapshot->'metadata' or c.confirmed is distinct from i.snapshot->'confirmed'
 or c.content is distinct from i.snapshot->'content' or c.files is distinct from i.snapshot->'files'
 or bank_v121.hash(i.result)<>i.result_hash or exists(select 1 from public.bank_revisions ch where ch.parent_id=r.id and ch.committed)))
 then raise exception 'Post-snapshot content/teacher/identity conflict';end if;
 update public.bank_catalog c set metadata=i.activated_metadata from bank_v123.items i where i.batch_id=b and c.revision_id=i.revision_id;
 get diagnostics n=row_count;
 if n<>1266 then raise exception 'Atomic activation count mismatch';end if;
 update bank_v123.batches set status='activated',activated_at=now() where id=b;
 update bank_v123.policy set enabled=true where id;
 set constraints all immediate;
 return jsonb_build_object('status','activated','count',n,'batch_id',b);
end $$;
create function bank_v123.activate(b uuid) returns jsonb language plpgsql set search_path='' as $$
declare job bank_v123.batches;k text;e jsonb;
begin
 select * into strict job from bank_v123.batches where id=b for update;e:=job.deployment_evidence;
 foreach k in array array['server','edge','desktop'] loop
 if e#>>array[k,'verified'] is distinct from 'true' or e#>>array[k,'manifest_hash'] is distinct from job.common_hash
 or nullif(e#>>array[k,'version'],'') is null then raise exception 'Deployment gate missing: %',k;end if;end loop;
 foreach k in array array['rollback_dry_run','old_save_block','identity_verified','candidate_hash_verified','mock_verified','stored_response_verified'] loop
 if e->>k is distinct from 'true' then raise exception 'Activation gate missing: %',k;end if;end loop;
 if e->>'ai_calls' is distinct from '0' then raise exception 'AI call gate failed';end if;
 return bank_v123.swap_snapshot(b);
end $$;
create function bank_v123.rollback(b uuid) returns jsonb language plpgsql set search_path='' as $$
declare job bank_v123.batches;n int;
begin
 select * into strict job from bank_v123.batches where id=b for update;
 if job.status<>'activated' then raise exception 'Activated batch required';end if;
 lock table public.bank_questions,public.bank_revisions,public.bank_catalog,public.bank_difficulty_ratings in share row exclusive mode;
 if job.ratings_snapshot is distinct from (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.bank_difficulty_ratings t)
 then raise exception 'Post-activation teacher ratings preserved';end if;
 if exists(select 1 from bank_v123.items i left join public.bank_catalog c on c.revision_id=i.revision_id left join public.bank_revisions r on r.id=i.revision_id where i.batch_id=b and
 (c.revision_id is null or r.review_version<>i.review_version or c.metadata is distinct from i.activated_metadata or c.confirmed is distinct from i.snapshot->'confirmed'
 or c.content is distinct from i.snapshot->'content' or c.files is distinct from i.snapshot->'files'
 or exists(select 1 from public.bank_revisions ch where ch.parent_id=r.id and ch.committed)))
 then raise exception 'Post-activation changes preserved; manual reconciliation required';end if;
 update public.bank_catalog c set metadata=i.snapshot->'metadata',confirmed=i.snapshot->'confirmed' from bank_v123.items i where i.batch_id=b and i.revision_id=c.revision_id;
 get diagnostics n=row_count;if n<>1266 then raise exception 'Rollback count mismatch';end if;
 update bank_v123.policy set enabled=(job.previous_policy->>'enabled')::boolean where id;
 update bank_v123.batches set status='rolled_back' where id=b;
 set constraints all immediate;
 return jsonb_build_object('status','rolled_back','count',n,'batch_id',b);
end $$;
revoke all on function bank_v123.prepare_snapshot(uuid),bank_v123.swap_snapshot(uuid),bank_v123.activate(uuid),bank_v123.rollback(uuid) from public,anon,authenticated,service_role;
-- Deliberately not PostgREST exposed. Authorized deployment operator uses the DB owner.

CREATE OR REPLACE FUNCTION bank_v121.projection(rid uuid, m jsonb, f jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare d jsonb:=m->'difficulty';r jsonb:=coalesce(nullif(d->'v121Active','null'),d#>'{v121Latest,record}');raw numeric;n numeric;manual numeric;stale boolean;band text;
begin

 if nullif(d->'v123Active','null') is not null then return bank_v123.projection(rid,m,f);end if;
 if r is null or r='null' then return null;end if;
 stale:=coalesce(d->>'reassessmentRequired','false')='true' or coalesce(m#>>'{analysis,status}','')='stale' or
  (rid is not null and nullif(d->'v121Active','null') is not null and r->>'question_revision_id' is distinct from rid::text) or
  (d#>>'{v121Latest,inputBasis}' is not null and d#>>'{v121Latest,inputBasis}' is distinct from m#>>'{analysis,basis}');
 if not stale and r->>'final_status'='complete' then raw:=bank_v121.score(r->'final_score');end if;
 manual:=coalesce(bank_v121.score(f->'difficulty'),bank_v121.score(d->'userScore'),
  case when d->>'teacher_override_active'='true' then bank_v121.score(d->'teacher_override_score') end);
 n:=coalesce(manual,raw);
 band:=case when n is null then null when n<=3 then '쉬움' when n<8 then '보통' when n<9 then '어려움' else '아주어려움' end;
 return jsonb_build_object('score',n,'raw',raw,'numberSource',case when manual is not null then '교사 조정' else 'AI v1.2.1' end,
  'band',band,'analyzed',raw is not null,'criteriaVersion','insight-bottleneck-v1.2.1','base_tier',r#>'{computed,base_tier}',
  'promotions',r#>'{computed,promotions}','status',case when manual is not null then 'complete' when stale then 'stale' else r->>'final_status' end);
end $function$;

CREATE OR REPLACE FUNCTION bank_v121.guard_current_policy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb;v jsonb;d jsonb;manual text[]:=array['userScore','teacherBand','teacher_override_active','teacher_override_score','teacher_override_reason','teacher_override_by','teacher_override_at','confirmed'];
begin

 -- The private frozen snapshot authorizes only the exact swap/restore.
 if tg_op='UPDATE' and exists(
 select 1 from bank_v123.items i join bank_v123.batches b on b.id=i.batch_id
 where i.revision_id=new.revision_id and i.question_id=new.question_id
 and new.content=i.snapshot->'content' and new.files=i.snapshot->'files'
 and ((b.status='staging' and old.metadata=i.snapshot->'metadata' and old.confirmed=i.snapshot->'confirmed'
 and new.metadata=i.activated_metadata and new.confirmed=i.snapshot->'confirmed')
 or (b.status='activated' and old.metadata=i.activated_metadata and old.confirmed=i.snapshot->'confirmed'
 and new.metadata=i.snapshot->'metadata' and new.confirmed=i.snapshot->'confirmed'))) then return new;end if;
 if exists(select 1 from bank_v123.policy where id and enabled) then
  if tg_op='UPDATE' and new.content is not distinct from old.content and new.files is not distinct from old.files
  and (new.metadata->'difficulty')-manual is not distinct from (old.metadata->'difficulty')-manual
  then return new;end if;
  raise exception using errcode='P0001',message='difficulty_contract_upgrade_required: v1.2.3 verified receipt required; legacy or capped automatic scores cannot be saved';
 end if;
 -- Private, immutable staging authorizes only the exact atomic swap or rollback.
 if tg_op='UPDATE' then
  if exists(select 1 from bank_v121.activation_results i join bank_v121.activation_batches b on b.id=i.batch_id
   where i.revision_id=new.revision_id and i.question_id=new.question_id and b.space_id=new.space_id
   and new.content=i.snapshot->'content' and new.files=i.snapshot->'files' and (
    (b.status='staging' and old.metadata=i.snapshot->'metadata' and old.confirmed=i.snapshot->'confirmed' and new.metadata=i.activated_metadata and new.confirmed=i.activated_confirmed)
    or (b.status='activated' and old.metadata=i.activated_metadata and old.confirmed=i.activated_confirmed and new.metadata=i.snapshot->'metadata' and new.confirmed=i.snapshot->'confirmed')))
  then return new;end if;
  -- Existing automatic record unchanged; future teacher adjustments remain valid.
  if new.content is not distinct from old.content and new.files is not distinct from old.files
   and (new.metadata->'difficulty')-manual is not distinct from (old.metadata->'difficulty')-manual then return new;end if;
 end if;
 select versions into strict v from bank_v121.release_policy where id;
 r:=new.metadata#>'{difficulty,v121Latest,record}';
 if r is null or not (r @> v) or r->>'model_policy_version' is distinct from v->>'model_policy_version'
 or coalesce(r->>'final_status','') not in('complete','failed')
 or coalesce(r->>'final_stage','') not in('1','2','3')
 or r->>'final_model' is distinct from (case when r->>'final_stage'='1' then 'gpt-6-luna' else 'gpt-6.1-sol' end)
 or r->>'final_reasoning_effort' is distinct from (case when r->>'final_stage'='3' then 'high' else 'medium' end)
 or (r->>'final_status'='complete' and (bank_v121.score(r->'final_score') is null or coalesce(r->>'final_tier','') !~ '^T[0-5]$'
  or r#>>array['stage'||(r->>'final_stage')||'_validation_result','valid'] is distinct from 'true'
  or r#>>array['stage'||(r->>'final_stage')||'_validation_result','solution_validated'] is distinct from 'true'))
 or (r->>'final_status'='failed' and (r->>'final_stage'<>'3' or r->'final_score' is distinct from 'null'::jsonb or r->'final_tier' is distinct from 'null'::jsonb))
 then raise exception using errcode='P0001',message='difficulty_policy_upgrade_required: update ExamStudio to 0.4.54; legacy scores are not accepted';end if;
 -- Submitted automatic result replaces earlier active overlays; teacher edits
 -- on an unchanged existing row took the earlier branch above.
 d:=new.metadata->'difficulty';d:=d-'v121Active'-'v12Active'-'v12Latest';
 new.metadata:=jsonb_set(new.metadata,'{difficulty}',d,true);
 return new;
end $function$;


-- Already approved difficulty-only source envelopes. No teacher/review status changes.
create table bank_v123.review_sources(revision_id uuid primary key,question_id uuid not null,source jsonb not null,source_hash text not null);
alter table bank_v123.review_sources enable row level security;
revoke all on bank_v123.review_sources from public,anon,authenticated;
grant all on bank_v123.review_sources to service_role;
create function public.bank_v123_review_source(r uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.bank_catalog;e bank_v123.review_sources;
begin
 if auth.uid() is null or not public.bank_read_revision(r) then raise insufficient_privilege;end if;
 select * into c from public.bank_catalog where revision_id=r;
 if not public.bank_member(c.space_id) then raise insufficient_privilege;end if;
 select * into e from bank_v123.review_sources where revision_id=r;
 if not found then return null;end if;
 if bank_v121.hash(e.source)<>e.source_hash or e.question_id<>c.question_id
 or e.source#>>'{review_envelope,identity,source_content_hash}' is distinct from bank_v121.hash(c.content)
 or e.source#>>'{review_envelope,identity,source_files_hash}' is distinct from bank_v121.hash(c.files)
 or e.source#>>'{review_envelope,identity,review_status_hash}' is distinct from bank_v121.hash(c.metadata->'reviews')
 then raise exception 'difficulty_review_source_identity_changed';end if;
 return e.source;
end $$;
revoke all on function public.bank_v123_review_source(uuid) from public,anon;
grant execute on function public.bank_v123_review_source(uuid) to authenticated;
