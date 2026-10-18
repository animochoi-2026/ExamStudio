-- Prepared only. No existing operational scores change on installation.
create schema if not exists bank_v12;
revoke all on schema bank_v12 from public,anon,authenticated;
create table bank_v12.jobs(
 id uuid primary key default gen_random_uuid(),space_id uuid not null references public.bank_spaces(id),actor uuid not null,
 kind text not null check(kind in('pilot','full','upload')),status text not null default 'prepared',
 policy jsonb not null,approval jsonb,pilot_review jsonb,activation_approval jsonb,
 calls integer not null default 0,retries integer not null default 0,version integer not null default 0,
 lease uuid,lease_until timestamptz,last_error jsonb,created_at timestamptz not null default now(),finished_at timestamptz);
create table bank_v12.items(
 job_id uuid not null references bank_v12.jobs(id),id text not null,question_id uuid,revision_id uuid,review_version integer,
 snapshot jsonb not null,input jsonb,state jsonb not null default '{"status":"pending","attempts":0,"responseId":null,"result":null}',
 primary key(job_id,id));
create index on bank_v12.items(question_id,revision_id);
alter table bank_v12.jobs enable row level security;
alter table bank_v12.items enable row level security;
create table bank_v12.upload_policy(space_id uuid primary key references public.bank_spaces(id),actor uuid not null,policy jsonb not null,approval jsonb not null,reserved_calls integer not null default 0);
alter table bank_v12.upload_policy enable row level security;
create unique index bank_v12_upload_once on bank_v12.jobs(space_id,actor,(policy->>'inputVersion')) where kind='upload';
create function public.bank_v12_access(s uuid) returns boolean language sql stable security invoker set search_path='' as $$ select public.bank_member(s,true) $$;
revoke all on function public.bank_v12_access(uuid) from public,anon;
grant execute on function public.bank_v12_access(uuid) to authenticated;
create function public.bank_v12_upload_access(s uuid) returns boolean language sql stable security invoker set search_path='' as $$ select public.bank_member(s,false) $$;
revoke all on function public.bank_v12_upload_access(uuid) from public,anon;
grant execute on function public.bank_v12_upload_access(uuid) to authenticated;

-- Service-only persistence. The Edge handler authenticates the live owner first.
create function public.bank_v12_service(op text,j uuid default null,v jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare job bank_v12.jobs; item bank_v12.items; new_id uuid; total integer; failed integer; token uuid; up bank_v12.upload_policy; budget integer;
begin
 if op='upload_policy' then
  if v->>'granted' is distinct from 'true' or v->>'promptHash' is distinct from v#>>'{policy,promptHash}' or v->>'model' is distinct from 'gpt-6.1-sol' or v->>'effort' is distinct from 'high' or coalesce((v->>'maxCalls')::integer,0)<=0 or coalesce((v->>'maxRetries')::integer,-1) not between 0 and 3 or coalesce((v->>'expiresAt')::timestamptz,'epoch'::timestamptz)<=now() then raise exception 'Explicit upload budget approval required';end if;
  if not exists(select 1 from bank_v12.jobs where id=(v->>'pilotId')::uuid and space_id=(v->>'spaceId')::uuid and policy->>'evaluationVersion'=v#>>'{policy,evaluationVersion}' and pilot_review->>'passed'='true') then raise exception 'Passing pilot required';end if;
  insert into bank_v12.upload_policy(space_id,actor,policy,approval) values((v->>'spaceId')::uuid,(v->>'actor')::uuid,v->'policy',v) on conflict(space_id) do update set actor=excluded.actor,policy=excluded.policy,approval=excluded.approval,reserved_calls=0;
  return jsonb_build_object('ok',true);
 elsif op='upload' then
  select * into up from bank_v12.upload_policy where space_id=(v->>'spaceId')::uuid for update;
  if not found or up.policy->>'evaluationVersion' is distinct from v#>>'{policy,evaluationVersion}' then raise exception 'Upload evaluation not enabled';end if;
  select id into new_id from bank_v12.jobs where kind='upload' and space_id=up.space_id and actor=(v->>'actor')::uuid and policy->>'inputVersion'=v#>>'{input,inputVersion}';
  if new_id is not null then return jsonb_build_object('id',new_id,'reused',true);end if;
  budget:=1+(up.approval->>'maxRetries')::integer;
  if (up.approval->>'expiresAt')::timestamptz<=now() or up.reserved_calls+budget>(up.approval->>'maxCalls')::integer then raise exception 'Approved upload budget exhausted or expired';end if;
  update bank_v12.upload_policy set reserved_calls=reserved_calls+budget where space_id=up.space_id;
  insert into bank_v12.jobs(space_id,actor,kind,status,policy,approval) values(up.space_id,(v->>'actor')::uuid,'upload','approved',v->'policy',up.approval||jsonb_build_object('manifestHash',v#>>'{policy,manifestHash}','maxCalls',budget,'strict_calibration',false)) returning id into new_id;
  insert into bank_v12.items(job_id,id,snapshot,input) values(new_id,'upload','{}',v->'input');
  return jsonb_build_object('id',new_id,'reused',false);
 end if;
 if op='prepare' then
  if v->>'kind' not in('pilot','full','upload') then raise exception 'Invalid kind';end if;
  insert into bank_v12.jobs(space_id,actor,kind,policy) values((v->>'spaceId')::uuid,(v->>'actor')::uuid,v->>'kind',v->'policy') returning id into new_id;
  insert into bank_v12.items(job_id,id,question_id,revision_id,review_version,snapshot)
  select new_id,c.question_id::text,c.question_id,c.revision_id,r.review_version,to_jsonb(c)||jsonb_build_object('review_version',r.review_version,'previousScore',public.bank_difficulty_number(c.metadata,c.confirmed))
  from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id
  where c.space_id=(v->>'spaceId')::uuid and r.committed and not q.archived
  and not exists(select 1 from public.bank_revisions n where n.parent_id=r.id and n.committed)
  and (v->'questionIds' is null or v->'questionIds'='null' or c.question_id::text in(select jsonb_array_elements_text(v->'questionIds')));
  if not exists(select 1 from bank_v12.items where job_id=new_id) then raise exception 'No targets';end if;
  return jsonb_build_object('id',new_id);
 end if;
 select * into job from bank_v12.jobs where id=j for update;if not found then raise exception 'Job missing';end if;
 if op='status' then
  return to_jsonb(job)||jsonb_build_object('total',(select count(*) from bank_v12.items where job_id=j),'nextAttemptAt',(select min(coalesce((state->>'nextAttemptAt')::numeric,0)) from bank_v12.items where job_id=j and state->>'status' in('pending','processing','submitting')),'counts',(select jsonb_object_agg(status,n) from(select state->>'status' status,count(*) n from bank_v12.items where job_id=j group by 1)t));
 elsif op='pending_input' then
  return (select to_jsonb(t) from bank_v12.items t where job_id=j and input is null and state->>'status'='pending' order by id limit 1);
 elsif op='manifest' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'questionId',question_id,'revisionId',revision_id,'reviewVersion',review_version,'inputVersion',input->>'inputVersion') order by id),'[]') from bank_v12.items where job_id=j);
 elsif op='results' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'questionId',question_id,'revisionId',revision_id,'reviewVersion',review_version,'state',state) order by id),'[]') from bank_v12.items where job_id=j);
 elsif op='report' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'questionId',question_id,'revisionId',revision_id,'previousScore',snapshot->'previousScore','source',snapshot#>'{metadata,source}','content',snapshot->'content','files',snapshot->'files','state',state) order by id),'[]') from bank_v12.items where job_id=j);
 elsif op='recalculate' then
  if job.status<>'complete' then raise exception 'Unactivated completed job required';end if;
  update bank_v12.items i set state=x->'state' from jsonb_array_elements(v->'entries') x where i.job_id=j and i.id=x->>'id';
  update bank_v12.jobs set pilot_review=null where id=j;
 elsif op='items' then
  return coalesce((select jsonb_agg(to_jsonb(t)) from(select * from bank_v12.items where job_id=j order by id limit 25 offset greatest(0,coalesce((v->>'offset')::integer,0)))t),'[]');
 elsif op='input' then
  if job.status<>'prepared' then raise exception 'Prepared inputs are immutable';end if;
  update bank_v12.items set input=v->'input' where job_id=j and id=v->>'id' and input is null;
 elsif op='input_error' then
  if job.status<>'prepared' then raise exception 'Prepared job required';end if;
  update bank_v12.items set state=state||jsonb_build_object('status','input_error','error',v->'error') where job_id=j and id=v->>'id' and input is null;
 elsif op='prepare_retry' then
  if job.status<>'prepared' then raise exception 'Prepared job required';end if;
  update bank_v12.items set state=(state-'error')||'{"status":"pending"}' where job_id=j and state->>'status'='input_error';
  update bank_v12.jobs set last_error=null where id=j;
 elsif op='external' then
  if job.kind<>'pilot' or job.status<>'prepared' or v->>'id' !~ '^V[1-8]$' then raise exception 'Invalid external fixture';end if;
  insert into bank_v12.items(job_id,id,snapshot,input) values(j,v->>'id','{}',v->'input') on conflict do nothing;
 elsif op='seal' then
  if job.status<>'prepared' or exists(select 1 from bank_v12.items where job_id=j and input is null) then raise exception 'Missing inputs';end if;
  update bank_v12.jobs set policy=policy||jsonb_build_object('manifestHash',v->>'manifestHash') where id=j;
 elsif op='approve' then
  select count(*) into total from bank_v12.items where job_id=j;
  select count(*) into failed from bank_v12.items where job_id=j and state->>'status' not in('complete','failed','conflict');
  if job.status<>'prepared' or job.policy->>'manifestHash' is null or exists(select 1 from bank_v12.items where job_id=j and input is null) or job.policy->>'manifestHash' is distinct from v->>'manifestHash'
   or job.policy->>'promptHash' is distinct from v->>'promptHash' or job.policy->>'evaluationVersion' is distinct from v->>'evaluationVersion'
   or v->>'model' is distinct from 'gpt-6.1-sol' or v->>'effort' is distinct from 'high' or (v->>'strict_calibration')::boolean is distinct from false
   or coalesce((v->>'granted')::boolean,false)=false or coalesce((v->>'maxCalls')::integer,-1)<failed
   or coalesce((v->>'maxRetries')::integer,-1) not between 0 and 3 then raise exception 'Approval mismatch';end if;
  if job.kind='pilot' and (total<>30 or (select count(*) from bank_v12.items where job_id=j and question_id is null)<>8) then raise exception 'Pilot requires 22 bank and 8 external';end if;
  if job.kind='full' and not coalesce((job.pilot_review->>'passed')::boolean,false) then raise exception 'Passing pilot required';end if;
  update bank_v12.jobs set approval=v,status='approved' where id=j;
 elsif op='pilot_review' then
  if job.kind<>'pilot' or job.status<>'complete' then raise exception 'Complete pilot required';end if;
  if v->>'passed'='true' and exists(select 1 from bank_v12.items where job_id=j and state->>'status'<>'complete') then raise exception 'Failed items cannot pass';end if;
  if not(v ? 'externalChecks' and v ? 'bankChecks' and v ? 'reviewedBy') then raise exception 'Review evidence required';end if;
  update bank_v12.jobs set pilot_review=v where id=j;
 elsif op='attach_pilot' then
  if job.kind<>'full' or job.status not in('prepared','complete') then raise exception 'Unactivated full job required';end if;
  if not exists(select 1 from bank_v12.jobs p where p.id=(v->>'pilotId')::uuid and p.space_id=job.space_id and p.kind='pilot' and p.status='complete' and p.policy->>'evaluationVersion'=job.policy->>'evaluationVersion' and p.pilot_review->>'passed'='true') then raise exception 'Passing same-policy pilot required';end if;
  update bank_v12.jobs set pilot_review=(select pilot_review||jsonb_build_object('pilotId',id) from bank_v12.jobs where id=(v->>'pilotId')::uuid) where id=j;
  update bank_v12.items a set state=b.state from bank_v12.items b where a.job_id=j and b.job_id=(v->>'pilotId')::uuid and a.question_id=b.question_id and a.revision_id=b.revision_id and a.input->>'inputVersion'=b.input->>'inputVersion' and b.state->>'status'='complete';
 elsif op='claim' then
  if job.status not in('approved','running') or job.lease_until>now() then return null;end if;
  select * into item from bank_v12.items where job_id=j and state->>'status' in('pending','processing','submitting') and coalesce((state->>'nextAttemptAt')::numeric,0)<=extract(epoch from now())*1000 order by id limit 1;
  if not found then
   update bank_v12.jobs set status=case when exists(select 1 from bank_v12.items where job_id=j and state->>'status' in('pending','processing','submitting')) then 'running' when exists(select 1 from bank_v12.items where job_id=j and state->>'status' not in('complete','failed','conflict')) then 'paused' else 'complete' end where id=j;
   return null;
  end if;
  token:=gen_random_uuid();update bank_v12.jobs set lease=token,lease_until=now()+interval '110 seconds',status='running' where id=j;
  return jsonb_build_object('lease',token,'job',to_jsonb(job),'item',to_jsonb(item));
 elsif op='checkpoint' then
  if job.lease is distinct from (v->>'lease')::uuid or job.version<>(v->>'expected')::integer or job.lease_until<now() then raise exception 'Lease/version conflict';end if;
  if (v->>'calls')::integer<job.calls or (v->>'calls')::integer>coalesce((job.approval->>'maxCalls')::integer,0) then raise exception 'Call budget exceeded';end if;
  update bank_v12.items set state=v->'state' where job_id=j and id=v->>'id';
  update bank_v12.jobs set version=version+1,calls=(v->>'calls')::integer,retries=(v->>'retries')::integer,status=case when v->>'status'='paused' then 'paused' else 'running' end where id=j;
 elsif op='release' then
  if job.lease=(v->>'lease')::uuid then update bank_v12.jobs set lease=null,lease_until=null where id=j;end if;
 elsif op='resume' then
  if job.status<>'paused' or job.approval is null then raise exception 'Approved paused job required';end if;
  update bank_v12.jobs set status='approved',last_error=null where id=j;
 elsif op='pause' then
  update bank_v12.jobs set status=case when status in('approved','running') then 'paused' else status end,last_error=v where id=j;
 elsif op='activate' then
  select count(*),count(*) filter(where state->>'status' in('failed','conflict')) into total,failed from bank_v12.items where job_id=j;
  if job.kind<>'full' or job.status<>'complete' or not coalesce((job.pilot_review->>'passed')::boolean,false) or failed::numeric/nullif(total,0)>.05
   or exists(select 1 from bank_v12.items where job_id=j and state->>'status' not in('complete','failed','conflict'))
   or v->>'manifestHash' is distinct from job.policy->>'manifestHash' or v->>'includeManual' is distinct from 'true' or v->>'sampleReviewed' is distinct from 'true' or v->>'granted' is distinct from 'true' then raise exception 'Activation conditions not met';end if;
  -- Lock all current rows before checking then swapping; any conflict rolls back everything.
  perform 1 from public.bank_revisions r join bank_v12.items i on i.revision_id=r.id where i.job_id=j for update of r;
  perform 1 from public.bank_catalog c join bank_v12.items i on i.revision_id=c.revision_id where i.job_id=j for update of c;
  if exists(select 1 from bank_v12.items i left join public.bank_revisions r on r.id=i.revision_id left join public.bank_catalog c on c.revision_id=i.revision_id where i.job_id=j and i.state->>'status'='complete' and (r.id is null or r.review_version<>i.review_version or c.metadata is distinct from i.snapshot->'metadata' or c.confirmed is distinct from i.snapshot->'confirmed' or exists(select 1 from public.bank_revisions n where n.parent_id=r.id and n.committed))) then raise exception 'Question changed after evaluation';end if;
  update bank_v12.items i set state=state||jsonb_build_object('activationRecord',jsonb_build_object('jobId',j,'revisionId',i.revision_id,'inputVersion',i.input->>'inputVersion','inputBasis',c.metadata#>>'{analysis,basis}','result',i.state->'result','confirmedBefore',c.confirmed,'userScoreBefore',c.metadata#>'{difficulty,userScore}','activatedAt',now())) from public.bank_catalog c where i.job_id=j and i.revision_id=c.revision_id and i.state->>'status'='complete';
  update public.bank_catalog c set metadata=jsonb_set(c.metadata,'{difficulty,v12Active}',i.state->'activationRecord',true)
   from bank_v12.items i where i.job_id=j and i.revision_id=c.revision_id and i.state->>'status'='complete';
  update bank_v12.jobs set status='activated',activation_approval=v,finished_at=now() where id=j;
 elsif op='rollback' then
  if job.status<>'activated' or v->>'granted'<>'true' then raise exception 'Activated job and rollback approval required';end if;
  update public.bank_catalog set metadata=metadata#-'{difficulty,v12Active}' where metadata#>>'{difficulty,v12Active,jobId}'=j::text;
  update bank_v12.jobs set status='rolled_back' where id=j;
 else raise exception 'Unknown operation';end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.bank_v12_service(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.bank_v12_service(text,uuid,jsonb) to service_role;

-- Approved overlay only; legacy score and teacher history are retained for rollback.
create function bank_v12.active_score(m jsonb,f jsonb,r uuid default null) returns numeric language sql immutable set search_path='' as $$
 select case when m#>>'{difficulty,v12Active,result,computed,status}'='complete'
 and nullif(m#>>'{difficulty,v12Active,inputBasis}','')=m#>>'{analysis,basis}'
 and coalesce(m#>>'{analysis,status}','')<>'stale' and coalesce(m#>>'{difficulty,reassessmentRequired}','false')<>'true'
 and (r is null or m#>>'{difficulty,v12Active,revisionId}'=r::text)
 and coalesce(m#>'{difficulty,v12Active,confirmedBefore}','{}')=coalesce(f,'{}')
 and coalesce(m#>'{difficulty,v12Active,userScoreBefore}','null')=coalesce(m#>'{difficulty,userScore}','null')
 and bank_summary.score(m#>'{difficulty,v12Active,result,computed,score}') between 1 and 10
 then bank_summary.score(m#>'{difficulty,v12Active,result,computed,score}') end;
$$;
create function bank_v12.latest_score(m jsonb,f jsonb) returns numeric language sql immutable set search_path='' as $$
 select case when m#>>'{difficulty,v12Latest,result,computed,status}'='complete'
 and nullif(m#>>'{difficulty,v12Latest,inputBasis}','')=m#>>'{analysis,basis}'
 and coalesce(m#>>'{analysis,status}','')<>'stale' and coalesce(m#>>'{difficulty,reassessmentRequired}','false')<>'true'
 and bank_summary.score(m#>'{difficulty,v12Latest,result,computed,score}') between 1 and 10
 then coalesce(bank_summary.score(f->'difficulty'),bank_summary.score(m#>'{difficulty,userScore}'),bank_summary.score(m#>'{difficulty,v12Latest,result,computed,score}')) end;
$$;
alter function public.bank_difficulty_number(jsonb,jsonb) rename to bank_difficulty_number_before_v12;
create function public.bank_difficulty_number(m jsonb,f jsonb) returns numeric language sql immutable set search_path='' as $$
 select coalesce(bank_v12.active_score(m,f),bank_v12.latest_score(m,f),public.bank_difficulty_number_before_v12(m,f));
$$;
alter function bank_summary.row_difficulty(uuid,jsonb,jsonb) rename to row_difficulty_before_v12;
create function bank_summary.row_difficulty(revision_id uuid,m jsonb,f jsonb) returns jsonb language sql immutable set search_path='' as $$
 select case when bank_v12.active_score(m,f,revision_id) is not null then jsonb_build_object(
 'score',bank_v12.active_score(m,f,revision_id),'raw',bank_v12.active_score(m,f,revision_id),'numberSource','v1.2 승인 전환',
 'band',case when bank_v12.active_score(m,f,revision_id)<=3 then '쉬움' when bank_v12.active_score(m,f,revision_id)<8 then '보통' when bank_v12.active_score(m,f,revision_id)<9 then '어려움' else '아주어려움' end,
 'analyzed',true,'criteriaVersion','insight-bottleneck-v1.2','base_tier',m#>'{difficulty,v12Active,result,computed,base_tier}','promotions',m#>'{difficulty,v12Active,result,computed,promotions}')
 when bank_v12.latest_score(m,f) is not null then bank_summary.row_difficulty_before_v12(revision_id,m,f)||jsonb_build_object('score',bank_v12.latest_score(m,f),'band',case when bank_v12.latest_score(m,f)<=3 then '쉬움' when bank_v12.latest_score(m,f)<8 then '보통' when bank_v12.latest_score(m,f)<9 then '어려움' else '아주어려움' end,'numberSource',case when bank_summary.score(f->'difficulty') is not null then '교사 검수' when bank_summary.score(m#>'{difficulty,userScore}') is not null then '교사 직접 입력' else 'AI 추천' end,'raw',m#>'{difficulty,v12Latest,result,computed,score}','analyzed',true,'criteriaVersion','insight-bottleneck-v1.2','base_tier',m#>'{difficulty,v12Latest,result,computed,base_tier}','promotions',m#>'{difficulty,v12Latest,result,computed,promotions}')
 else bank_summary.row_difficulty_before_v12(revision_id,m,f) end;
$$;
-- Pure JSON helper only. Tables and state mutation remain service-only.
grant usage on schema bank_v12 to authenticated;
grant execute on function bank_v12.active_score(jsonb,jsonb,uuid) to authenticated;
revoke all on function public.bank_difficulty_number(jsonb,jsonb) from public,anon;
grant execute on function public.bank_difficulty_number(jsonb,jsonb) to authenticated;
revoke all on all tables in schema bank_v12 from public,anon,authenticated;

-- An uploaded payload cannot manufacture an approval overlay to bypass teacher scores.
create function bank_v12.guard_catalog() returns trigger language plpgsql security definer set search_path='' as $$
declare a jsonb;l jsonb;
begin
 a:=new.metadata#>'{difficulty,v12Active}';l:=new.metadata#>'{difficulty,v12Latest}';
 if a is not null and a<>'null' then
  if a->>'revisionId' is distinct from new.revision_id::text then new.metadata:=new.metadata#-'{difficulty,v12Active}';
  elsif not exists(select 1 from bank_v12.items i join bank_v12.jobs j on j.id=i.job_id where j.space_id=new.space_id and i.question_id=new.question_id and i.revision_id=new.revision_id and i.state->'activationRecord'=a and j.status in('complete','activated')) then raise exception 'Unapproved difficulty activation';end if;
 end if;
 if l is not null and l<>'null' and (tg_op='INSERT' or l is distinct from old.metadata#>'{difficulty,v12Latest}') then
  if not exists(select 1 from bank_v12.items i join bank_v12.jobs j on j.id=i.job_id where j.space_id=new.space_id and j.kind='upload' and i.state->>'status'='complete' and i.input->>'inputVersion'=l->>'inputVersion' and i.state->'result'=l->'result') then raise exception 'Unverified upload difficulty result';end if;
 end if;
 return new;
end $$;
create trigger bank_v12_catalog_guard before insert or update of metadata on public.bank_catalog for each row execute function bank_v12.guard_catalog();
