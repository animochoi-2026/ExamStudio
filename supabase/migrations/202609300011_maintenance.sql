-- Additive migration. Existing questions, revisions and files are not deleted.
create table public.bank_maintenance_jobs(
 id uuid primary key, space_id uuid not null references public.bank_spaces,
 actor_id uuid not null references auth.users, spec jsonb not null,
 status text not null default 'planned', progress jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.bank_maintenance_items(
 job_id uuid references public.bank_maintenance_jobs, question_id uuid references public.bank_questions,
 base_id uuid not null references public.bank_revisions, result_id uuid not null unique,
 review_version integer not null, status text not null default 'staged', report jsonb not null default '{}',
 committed_at timestamptz, primary key(job_id,question_id));
alter table public.bank_maintenance_jobs enable row level security;
alter table public.bank_maintenance_items enable row level security;
create policy maintenance_owner on public.bank_maintenance_jobs for select to authenticated using(public.bank_member(space_id,true));
create policy maintenance_owner on public.bank_maintenance_items for select to authenticated using(exists(select 1 from public.bank_maintenance_jobs j where j.id=job_id and public.bank_member(j.space_id,true)));
revoke all on public.bank_maintenance_jobs,public.bank_maintenance_items from anon,authenticated;
grant select on public.bank_maintenance_jobs,public.bank_maintenance_items to authenticated;

create function public.bank_maintenance_job(s uuid,j uuid,specification jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.bank_member(s,true) then raise insufficient_privilege; end if;
 if octet_length(specification::text)>1000000 then raise exception '작업 계획이 너무 큽니다.';end if;
 insert into public.bank_maintenance_jobs(id,space_id,actor_id,spec) values(j,s,auth.uid(),specification) on conflict do nothing;
 if not exists(select 1 from public.bank_maintenance_jobs where id=j and space_id=s and actor_id=auth.uid() and spec=specification) then raise exception '작업 ID 충돌';end if;
end $$;
create function public.bank_maintenance_progress(j uuid,state text,details jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.bank_maintenance_jobs where id=j and actor_id=auth.uid() and public.bank_member(space_id,true)) then raise insufficient_privilege;end if;
 if state not in ('planned','sampling','staged','running','paused','complete','failed') or octet_length(details::text)>1000000 then raise exception '진행 기록 오류';end if;
 update public.bank_maintenance_jobs set status=state,progress=details,updated_at=now() where id=j;
end $$;
create function public.bank_maintenance_stage(j uuid,b uuid,r uuid,expected integer,report_value jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare job public.bank_maintenance_jobs; q uuid;
begin
 if octet_length(report_value::text)>1000000 then raise exception '변경 기록이 너무 큽니다.';end if;
 select * into job from public.bank_maintenance_jobs where id=j;
 if job.actor_id is distinct from auth.uid() or not public.bank_member(job.space_id,true) or not public.bank_read_revision(b) then raise insufficient_privilege;end if;
 select v.question_id into q from public.bank_revisions v join public.bank_questions x on x.id=v.question_id where v.id=b and v.committed and x.space_id=job.space_id;
 if q is null then raise exception '기준 버전 오류';end if;
 perform pg_advisory_xact_lock(hashtextextended(q::text,0));
 if exists(select 1 from public.bank_revisions where question_id=q and committed and id<>b and not exists(select 1 from public.bank_revisions child where child.parent_id=bank_revisions.id and child.committed))
 or not exists(select 1 from public.bank_revisions where id=b and review_version=expected) then raise exception '수정 충돌: 계획 이후 문항 또는 검수값이 변경되었습니다.' using errcode='PT409';end if;
 insert into public.bank_maintenance_items(job_id,question_id,base_id,result_id,review_version,report) values(j,q,b,r,expected,report_value) on conflict(job_id,question_id) do nothing;
 if not exists(select 1 from public.bank_maintenance_items where job_id=j and question_id=q and base_id=b and result_id=r and review_version=expected) then raise exception '작업 대상 충돌';end if;
end $$;
create function public.bank_maintenance_allowed(s uuid,q uuid,r uuid,p uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.bank_member(s,true) and exists(select 1 from public.bank_maintenance_items i join public.bank_maintenance_jobs j on j.id=i.job_id where j.space_id=s and j.actor_id=auth.uid() and i.question_id=q and i.result_id=r and i.base_id=p);
$$;
create or replace function public.bank_begin_revision(s uuid, q uuid, r uuid, p uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare existing public.bank_revisions; begin
 if not public.bank_member(s) then raise insufficient_privilege; end if;
 insert into public.bank_questions(id,space_id,owner_id,owner_email) values(q,s,auth.uid(),(select email from auth.users where id=auth.uid())) on conflict do nothing;
 if not exists(select 1 from public.bank_questions where id=q and space_id=s and (owner_id=auth.uid() or public.bank_maintenance_allowed(s,q,r,p))) then raise exception '다른 교사의 문항은 새 복사본으로 저장하세요.' using errcode='42501'; end if;
 if p is not null and not exists(select 1 from public.bank_revisions where id=p and question_id=q and committed) then raise exception '기준 버전을 확인하세요.'; end if;
 insert into public.bank_revisions(id,question_id,parent_id,actor_id) values(r,q,p,auth.uid()) on conflict do nothing;
 select * into existing from public.bank_revisions where id=r;
 if existing.question_id<>q or existing.actor_id<>auth.uid() or existing.parent_id is distinct from p then raise exception '버전 ID 충돌'; end if;
end $$;
create or replace function public.bank_reserve(s uuid, f uuid, p uuid, n text, properties jsonb, bytes bigint, sha text, md text, chunk_count integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.bank_entries; begin
 if not public.bank_member(s) then raise insufficient_privilege; end if;
 if not exists(select 1 from public.bank_entries where id=p and space_id=s and kind='folder') then raise exception '상위 폴더 오류'; end if;
 if (properties->>'rootId') is distinct from s::text or properties->>'role' not in ('source','asset','attachment','docx','data','preview','commit') or properties->>'role' is null or (properties->>'role'='source' and coalesce(properties->>'sourceKey','') !~ '^[a-f0-9]{64}$') or sha is null or md is null or sha !~ '^[a-f0-9]{64}$' or md !~ '^[a-f0-9]{32}$' or bytes<=0 or chunk_count<>ceil(bytes::numeric/6291456)::integer then raise exception '파일 규격 오류'; end if;
 if properties->>'role'<>'source' and not exists(select 1 from public.bank_revisions r join public.bank_questions q on q.id=r.question_id where r.id=(properties->>'revisionId')::uuid and q.id=(properties->>'questionId')::uuid and q.space_id=s and r.actor_id=auth.uid() and (q.owner_id=auth.uid() or public.bank_maintenance_allowed(s,q.id,r.id,r.parent_id)) and not r.committed) then
  if not exists(select 1 from public.bank_entries where id=f and verified and owner_id=auth.uid()) then raise insufficient_privilege; end if;
 end if;
 insert into public.bank_entries(id,space_id,parent_id,name,kind,owner_id,props,size,sha256,md5,chunks) values(f,s,p,left(n,250),'file',auth.uid(),properties,bytes,sha,md,chunk_count) on conflict do nothing;
 select * into result from public.bank_entries where id=f;
 if not found and properties->>'role'='source' then select * into result from public.bank_entries where space_id=s and props->>'sourceKey'=properties->>'sourceKey'; end if;
 if result.id is null then raise exception '파일 예약 충돌'; end if;
 if result.space_id<>s or (result.parent_id<>p and properties->>'role'<>'source') or result.props<>properties or result.sha256<>sha or result.md5<>md or result.size<>bytes or (result.owner_id<>auth.uid() and not(result.verified and result.props->>'role'='source')) then raise exception '파일 ID 충돌'; end if;
 return to_jsonb(result);
end $$;

-- Missing keys are distinct from explicit null values. Old clients must not
-- silently discard extensions written by a newer app.
create function public.bank_metadata_keys_preserved(prior jsonb,incoming jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare pair record;
begin
 if jsonb_typeof(prior)<>'object' then return true;end if;
 if jsonb_typeof(incoming) is distinct from 'object' then return false;end if;
 for pair in select * from jsonb_each(prior) loop
  if not(incoming ? pair.key) or jsonb_typeof(pair.value)='object' and incoming->pair.key<>'null'::jsonb and not public.bank_metadata_keys_preserved(pair.value,incoming->pair.key) then return false;end if;
 end loop;return true;
end $$;
revoke execute on function public.bank_metadata_keys_preserved(jsonb,jsonb) from public,anon,authenticated;

-- Check again inside the verified commit transaction, not only before upload.
create function public.bank_maintenance_commit_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare i public.bank_maintenance_items; prior public.bank_catalog; actor_role text;
begin
 if not new.committed or old.committed then return new;end if;
 select * into i from public.bank_maintenance_items where result_id=new.id;
 select * into prior from public.bank_catalog where revision_id=new.parent_id;
 if i.result_id is not null then
  select m.role into actor_role from public.bank_members m join auth.users u on lower(u.email)=m.email where u.id=new.actor_id and m.space_id=prior.space_id and m.enabled and u.email_confirmed_at is not null;
  if actor_role is distinct from 'owner' then raise insufficient_privilege;end if;
  perform 1 from public.bank_revisions where id=i.base_id and review_version=i.review_version for update;
  if not found then raise exception '검수값이 수정되었습니다. 다시 계획하세요.' using errcode='PT409';end if;
  update public.bank_catalog set confirmed=prior.confirmed where revision_id=new.id;
  select visibility,review_version into new.visibility,new.review_version from public.bank_revisions where id=i.base_id;
  update public.bank_maintenance_items set status='complete',committed_at=now() where result_id=new.id;
 end if;
 -- An old client may still read/export, but cannot erase processing data.
 if prior.metadata ? 'processing' and i.result_id is null and not exists(select 1 from public.bank_catalog c where c.revision_id=new.id and public.bank_metadata_keys_preserved(prior.metadata,c.metadata)) then
  raise exception '문제공방 업데이트 필요: 이전 앱이 일괄 처리 기록을 지우는 등록을 차단했습니다.';
 end if;
 return new;
end $$;
create trigger bank_maintenance_guard before update of committed on public.bank_revisions for each row execute function public.bank_maintenance_commit_guard();
revoke execute on function public.bank_maintenance_job(uuid,uuid,jsonb),public.bank_maintenance_progress(uuid,text,jsonb),public.bank_maintenance_stage(uuid,uuid,uuid,integer,jsonb),public.bank_maintenance_allowed(uuid,uuid,uuid,uuid),public.bank_maintenance_commit_guard() from public,anon,authenticated;
grant execute on function public.bank_maintenance_job(uuid,uuid,jsonb),public.bank_maintenance_progress(uuid,text,jsonb),public.bank_maintenance_stage(uuid,uuid,uuid,integer,jsonb) to authenticated;
