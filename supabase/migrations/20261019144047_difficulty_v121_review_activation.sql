-- Approved historical-version exceptions. No score activation in this migration.
create table bank_v121.release_policy(id boolean primary key default true check(id), versions jsonb not null, desktop_version text not null, deployment_evidence jsonb);
create table bank_v121.activation_batches(id uuid primary key,space_id uuid not null references public.bank_spaces(id),policy jsonb not null,
 expected_count integer not null check(expected_count=1266),status text not null default 'staging' check(status in('staging','activated','rolled_back')),
 created_at timestamptz not null default now(),activated_at timestamptz,checks jsonb);
create table bank_v121.activation_results(batch_id uuid not null references bank_v121.activation_batches(id),question_id uuid not null,revision_id uuid not null,
 review_version integer not null,snapshot jsonb not null,result jsonb not null,result_hash text not null,evaluation_id text not null,
 activated_metadata jsonb,activated_confirmed jsonb,primary key(batch_id,question_id),unique(batch_id,revision_id),unique(batch_id,evaluation_id));
alter table bank_v121.release_policy enable row level security;
alter table bank_v121.activation_batches enable row level security;
alter table bank_v121.activation_results enable row level security;
revoke all on bank_v121.release_policy,bank_v121.activation_batches,bank_v121.activation_results from public,anon,authenticated;
grant all on bank_v121.release_policy,bank_v121.activation_batches,bank_v121.activation_results to service_role;

-- Same canonical object-key ordering and compact JSON as the local hash helper.
create function bank_v121.canonical(v jsonb) returns text language plpgsql immutable set search_path='' as $$
declare result text;
begin
 case jsonb_typeof(v)
 when 'object' then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||bank_v121.canonical(value),',' order by key collate "C"),'')||'}' into result from jsonb_each(v);
 when 'array' then select '['||coalesce(string_agg(bank_v121.canonical(value),',' order by ord),'')||']' into result from jsonb_array_elements(v) with ordinality a(value,ord);
 else result:=v::text;
 end case;return result;
end $$;
create function bank_v121.hash(v jsonb) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(bank_v121.canonical(v),'UTF8')),'hex');
$$;
revoke all on function bank_v121.canonical(jsonb),bank_v121.hash(jsonb) from public,anon,authenticated;
grant execute on function bank_v121.canonical(jsonb),bank_v121.hash(jsonb) to service_role;

-- Only the approved current desktop policy can create NEW automatic scores.
insert into bank_v121.release_policy(id,versions,desktop_version) values(true,'{"spec_version":"1.2","spec_revision":"1.2.1","model_policy_version":"difficulty-three-stage-v1.2.1-1","prompt_hash":"779f1adc3a49c39066fc0b745ddbe506cb9f549bc5bf67e87a55f1a28e439676","json_schema_hash":"e445a5a5fc95db5481d29e313e15ebbed9a970e9e7551aa6e5ea3dba2e646505","scorer_code_hash":"d7d7bcbb0b434685120f9b9fbb9632475edc791df45f53a11affccc8d5c0b709","normalizer_version":"v121-normalizer-7","anchor_set_version":"middle-v121-1","profile_version":"35a7950483e90460f5016fcef224cef73a6068e67485f99540c8f4726b6c1445","result_structure_version":"difficulty-result-1","content_normalizer_version":"difficulty-input-adapter-3","image_hash_method":"sha256(image bytes); aggregate sha256(canonical JSON sorted sha256 array)"}'::jsonb,'0.4.54');

create function public.bank_v121_review_import(s uuid,b uuid,p jsonb,items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job bank_v121.activation_batches;v jsonb;c public.bank_catalog;r public.bank_revisions;existing bank_v121.activation_results;expected jsonb;h text;n int:=0;
begin
 if auth.uid() is null or not public.bank_member(s,true) then raise insufficient_privilege;end if;
 if p->>'version' is distinct from 'approved-preserved-evaluation-set-1' or p->>'authorization' is distinct from 'user-approved-exception-preservation-20261019'
 or p->>'expected' is distinct from '1266' or jsonb_typeof(p->'selectedResults') is distinct from 'array' or jsonb_array_length(p->'selectedResults')<>1266
 or jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items)>10 then raise exception 'Invalid frozen set';end if;
 if (select count(distinct x->>'questionId') from jsonb_array_elements(p->'selectedResults') x)<>1266
 or (select count(distinct x->>'evaluationId') from jsonb_array_elements(p->'selectedResults') x)<>1266 then raise exception 'Duplicate frozen result';end if;
 insert into bank_v121.activation_batches(id,space_id,policy,expected_count) values(b,s,p,1266) on conflict(id) do nothing;
 select * into strict job from bank_v121.activation_batches where id=b for update;
 if job.space_id<>s or job.policy is distinct from p or job.status<>'staging' then raise exception 'Frozen batch mismatch';end if;
 for v in select * from jsonb_array_elements(items) loop
  select x into strict expected from jsonb_array_elements(p->'selectedResults') x where x->>'questionId'=v->>'questionId';
  h:=bank_v121.hash(v->'result');
  if h is distinct from expected->>'resultHash' or v#>>'{result,evaluation_id}' is distinct from expected->>'evaluationId' then raise exception 'Result hash mismatch';end if;
  select * into strict c from public.bank_catalog where revision_id=(v->>'revisionId')::uuid;
  select * into strict r from public.bank_revisions where id=c.revision_id;
  if c.space_id<>s or c.question_id::text is distinct from v->>'questionId' or not r.committed or r.review_version is distinct from (v->>'reviewVersion')::int
   or c.metadata is distinct from v#>'{snapshot,metadata}' or c.confirmed is distinct from v#>'{snapshot,confirmed}'
   or c.content is distinct from v#>'{snapshot,content}' or c.files is distinct from v#>'{snapshot,files}'
   or bank_v121.hash(c.content) is distinct from v#>>'{result,source_content_hash}' or bank_v121.hash(c.files) is distinct from v#>>'{result,source_image_asset_hash}'
   or exists(select 1 from public.bank_questions where id=c.question_id and archived)
   or exists(select 1 from public.bank_revisions where parent_id=r.id and committed) then raise exception 'Current source/revision changed';end if;
  select * into existing from bank_v121.activation_results where batch_id=b and question_id=c.question_id;
  if found then
   if existing.revision_id<>c.revision_id or existing.snapshot is distinct from v->'snapshot' or existing.result is distinct from v->'result' then raise exception 'Staged result is immutable';end if;
  else insert into bank_v121.activation_results values(b,c.question_id,c.revision_id,r.review_version,v->'snapshot',v->'result',h,expected->>'evaluationId',null,null);end if;
  n:=n+1;
 end loop;
 return jsonb_build_object('staged',n,'liveScoresChanged',false);
end $$;
revoke all on function public.bank_v121_review_import(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.bank_v121_review_import(uuid,uuid,jsonb,jsonb) to authenticated;

create function bank_v121.guard_current_policy() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb;v jsonb;d jsonb;manual text[]:=array['userScore','teacherBand','teacher_override_active','teacher_override_score','teacher_override_reason','teacher_override_by','teacher_override_at','confirmed'];
begin
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
end $$;
revoke all on function bank_v121.guard_current_policy() from public,anon,authenticated;
create trigger zz_difficulty_current_policy before insert or update of metadata,content,files on public.bank_catalog for each row execute function bank_v121.guard_current_policy();

create function bank_v121.activate_reviewed(b uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare job bank_v121.activation_batches;p bank_v121.release_policy;n int;
begin
 select * into strict job from bank_v121.activation_batches where id=b for update;
 if job.status='activated' then return jsonb_build_object('status','already_activated','count',1266);end if;
 select * into strict p from bank_v121.release_policy where id for share;
 if job.status<>'staging' or p.deployment_evidence->>'verified' is distinct from 'true' or p.deployment_evidence->>'version' is distinct from p.desktop_version
 or p.deployment_evidence->>'sourceCommit' is null or p.deployment_evidence->>'installedAssetsHash' is null then raise exception 'Desktop deployment gate incomplete';end if;
 select count(*) into n from bank_v121.activation_results where batch_id=b;
 if n<>1266 or n<>job.expected_count then raise exception 'Incomplete final target set';end if;
 if exists(select 1 from bank_v121.activation_results i where i.batch_id=b and (
  bank_v121.hash(i.result) is distinct from i.result_hash or i.result->>'final_status' is distinct from 'complete'
  or i.result->>'question_id' is distinct from i.question_id::text or i.result->>'question_revision_id' is distinct from i.revision_id::text
  or i.result->>'evaluation_id' is distinct from i.evaluation_id or i.result->>'activation_batch_id' is distinct from b::text
  or i.result->>'spec_revision' is distinct from '1.2.1' or i.result->>'model_policy_version' is distinct from p.versions->>'model_policy_version'
  or not (job.policy->'allowedPrompts' ? (i.result->>'prompt_hash')) or not (job.policy->'allowedNormalizers' ? (i.result->>'normalizer_version'))
  or i.result->>'json_schema_hash' is distinct from p.versions->>'json_schema_hash' or i.result->>'scorer_code_hash' is distinct from p.versions->>'scorer_code_hash'
  or coalesce(i.result->>'final_stage','') not in('1','2','3')
  or i.result->>'final_model' is distinct from case when i.result->>'final_stage'='1' then 'gpt-6-luna' else 'gpt-6.1-sol' end
  or i.result->>'final_reasoning_effort' is distinct from case when i.result->>'final_stage'='3' then 'high' else 'medium' end
  or i.result#>>array['stage'||(i.result->>'final_stage')||'_validation_result','valid'] is distinct from 'true'
  or i.result#>>array['stage'||(i.result->>'final_stage')||'_validation_result','solution_validated'] is distinct from 'true'
  or bank_v121.score(i.result->'final_score') is null or coalesce(i.result->>'final_tier','') !~ '^T[0-5]$'
  or coalesce(i.result->>'reviewed_evaluation_input_hash','') !~ '^[a-f0-9]{64}$'
  or (i.result->'production_review_envelope'<>'null'::jsonb and i.result#>>'{production_review_envelope,authorization}' is distinct from 'user-approved-exception-preservation-20261019')
 )) then raise exception 'Final result/version validation failed';end if;
 if (select count(*) from bank_v121.activation_results where batch_id=b and result->'production_review_envelope'<>'null'::jsonb)<>14 then raise exception 'Review envelope count mismatch';end if;
 perform 1 from public.bank_questions q join bank_v121.activation_results i on i.question_id=q.id where i.batch_id=b order by q.id for update of q;
 perform 1 from public.bank_revisions r join bank_v121.activation_results i on i.revision_id=r.id where i.batch_id=b order by r.id for update of r;
 perform 1 from public.bank_catalog c join bank_v121.activation_results i on i.revision_id=c.revision_id where i.batch_id=b order by c.revision_id for update of c;
 if exists(select 1 from bank_v121.activation_results i left join public.bank_catalog c on c.revision_id=i.revision_id
  left join public.bank_revisions r on r.id=i.revision_id left join public.bank_questions q on q.id=i.question_id
  where i.batch_id=b and (c.revision_id is null or c.space_id<>job.space_id or q.archived or not r.committed or r.review_version<>i.review_version
   or c.metadata is distinct from i.snapshot->'metadata' or c.confirmed is distinct from i.snapshot->'confirmed'
   or c.content is distinct from i.snapshot->'content' or c.files is distinct from i.snapshot->'files'
   or bank_v121.hash(c.content) is distinct from i.result->>'source_content_hash' or bank_v121.hash(c.files) is distinct from i.result->>'source_image_asset_hash'
   or exists(select 1 from public.bank_revisions child where child.parent_id=r.id and child.committed))) then raise exception 'Concurrent content/revision/review change';end if;
 update bank_v121.activation_results i set activated_metadata=jsonb_set(i.snapshot->'metadata','{difficulty}',
  jsonb_strip_nulls(jsonb_build_object('scope',i.snapshot#>'{metadata,difficulty,scope}','isReference',i.snapshot#>'{metadata,difficulty,isReference}'))||
  jsonb_build_object('auto_score',i.result->'final_score','auto_tier',i.result->'final_tier','auto_evaluation_id',i.evaluation_id,
   'effective_score',i.result->'final_score','effective_score_source','auto','teacher_override_active',false,'userScore',null,'teacherBand',null,
   'teacher_override_score',null,'teacher_override_reason',null,'teacher_override_by',null,'teacher_override_at',null,
   'criteriaVersion','insight-bottleneck-v1.2.1','assessmentStatus','complete','reassessmentRequired',false,'activation_batch_id',b,
   'activated_at',now(),'spec_revision','1.2.1','model_policy_version',i.result->'model_policy_version','v121Active',i.result),true),
  activated_confirmed=(i.snapshot->'confirmed')-'difficulty'-'difficultyBand' where batch_id=b;
 update public.bank_catalog c set metadata=i.activated_metadata,confirmed=i.activated_confirmed from bank_v121.activation_results i where i.batch_id=b and c.revision_id=i.revision_id;
 update bank_v121.activation_batches set status='activated',activated_at=now(),checks=p.deployment_evidence where id=b;
 -- Existing deferred summary_mark/summary_flush triggers refresh only affected
 -- sources, difficulty statistics, recommendations and home caches at commit.
 return jsonb_build_object('status','activated','count',n,'failed',0,'unresolved',0,'batchId',b);
end $$;
revoke all on function bank_v121.activate_reviewed(uuid) from public,anon,authenticated;
grant execute on function bank_v121.activate_reviewed(uuid) to service_role;

create function bank_v121.rollback_reviewed(b uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare job bank_v121.activation_batches;
begin
 select * into strict job from bank_v121.activation_batches where id=b for update;
 if job.status<>'activated' then raise exception 'Activated batch required';end if;
 perform 1 from public.bank_catalog c join bank_v121.activation_results i on i.revision_id=c.revision_id where i.batch_id=b order by c.revision_id for update of c;
 if exists(select 1 from bank_v121.activation_results i left join public.bank_catalog c on c.revision_id=i.revision_id where i.batch_id=b and
  (c.revision_id is null or c.metadata is distinct from i.activated_metadata or c.confirmed is distinct from i.activated_confirmed
   or c.content is distinct from i.snapshot->'content' or c.files is distinct from i.snapshot->'files'
   or exists(select 1 from public.bank_revisions where parent_id=i.revision_id and committed))) then raise exception 'Post-activation edits preserved';end if;
 update public.bank_catalog c set metadata=i.snapshot->'metadata',confirmed=i.snapshot->'confirmed' from bank_v121.activation_results i where i.batch_id=b and c.revision_id=i.revision_id;
 update bank_v121.activation_batches set status='rolled_back' where id=b;
 return jsonb_build_object('status','rolled_back','count',1266);
end $$;
revoke all on function bank_v121.rollback_reviewed(uuid) from public,anon,authenticated;
grant execute on function bank_v121.rollback_reviewed(uuid) to service_role;
