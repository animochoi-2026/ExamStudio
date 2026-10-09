-- Apply once in the owner's Supabase SQL editor. No password or API secret belongs here.
create table public.bank_spaces(id uuid primary key, name text not null);
create table public.bank_members(space_id uuid references public.bank_spaces, email text not null check(email=lower(email)), user_id uuid references auth.users, role text not null check(role in ('owner','teacher')), enabled boolean not null default true, primary key(space_id,email));
create table public.bank_questions(id uuid primary key, space_id uuid not null references public.bank_spaces, owner_id uuid not null references auth.users, owner_email text not null, created_at timestamptz not null default now());
create table public.bank_revisions(id uuid primary key, question_id uuid not null references public.bank_questions, parent_id uuid references public.bank_revisions, actor_id uuid not null references auth.users, committed boolean not null default false, created_at timestamptz not null default now());
create table public.bank_entries(id uuid primary key, space_id uuid not null references public.bank_spaces, parent_id uuid references public.bank_entries, name text not null, kind text not null check(kind in ('folder','file')), bank_key text, owner_id uuid references auth.users, props jsonb not null default '{}', size bigint not null default 0 check(size between 0 and 367001600), sha256 text, md5 text, chunks integer not null default 0 check(chunks between 0 and 64), verified boolean not null default false, created_at timestamptz not null default now(), unique(space_id,bank_key));
create unique index bank_source_identity on public.bank_entries(space_id,(props->>'sourceKey')) where props->>'role'='source';
create table public.bank_audit(id bigint generated always as identity primary key, space_id uuid not null references public.bank_spaces, actor_id uuid, actor_email text, action text not null, target text, created_at timestamptz not null default now());

create function public.bank_member(s uuid, admin boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bank_members m join auth.users u on u.id=auth.uid() where m.space_id=s and m.enabled and m.email=lower(u.email) and u.email_confirmed_at is not null and (m.user_id is null or m.user_id=u.id) and (not admin or m.role='owner'));
$$;
create function public.bank_join(s uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.bank_members; begin
 if not public.bank_member(s) then raise exception '초대·승인된 계정만 공동 문제은행을 사용할 수 있습니다.' using errcode='42501'; end if;
 update public.bank_members set user_id=auth.uid() where space_id=s and email=(select lower(email) from auth.users where id=auth.uid()) returning * into m;
 return jsonb_build_object('role',m.role,'email',m.email,'userId',m.user_id);
end $$;
create function public.bank_invite(s uuid, email_address text, enabled_value boolean default true) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.bank_member(s,true) then raise insufficient_privilege; end if;
 if email_address !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception '이메일을 확인하세요.'; end if;
 if exists(select 1 from public.bank_members where space_id=s and email=lower(trim(email_address)) and role='owner') then raise exception '관리자 계정은 변경할 수 없습니다.'; end if;
 insert into public.bank_members(space_id,email,role,enabled) values(s,lower(trim(email_address)),'teacher',enabled_value) on conflict(space_id,email) do update set enabled=excluded.enabled;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),case when enabled_value then 'invite' else 'revoke' end,lower(trim(email_address)));
end $$;
create function public.bank_begin_revision(s uuid, q uuid, r uuid, p uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare existing public.bank_revisions; begin
 if not public.bank_member(s) then raise insufficient_privilege; end if;
 insert into public.bank_questions(id,space_id,owner_id,owner_email) values(q,s,auth.uid(),(select email from auth.users where id=auth.uid())) on conflict do nothing;
 if not exists(select 1 from public.bank_questions where id=q and space_id=s and owner_id=auth.uid()) then raise exception '다른 교사의 문항은 새 복사본으로 저장하세요.' using errcode='42501'; end if;
 if p is not null and not exists(select 1 from public.bank_revisions where id=p and question_id=q and committed) then raise exception '기준 버전을 확인하세요.'; end if;
 insert into public.bank_revisions(id,question_id,parent_id,actor_id) values(r,q,p,auth.uid()) on conflict do nothing;
 select * into existing from public.bank_revisions where id=r;
 if existing.question_id<>q or existing.actor_id<>auth.uid() or existing.parent_id is distinct from p then raise exception '버전 ID 충돌'; end if;
end $$;
create function public.bank_folder(s uuid, k text, n text, p uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.bank_entries; begin
 if not public.bank_member(s) then raise insufficient_privilege; end if;
 if not exists(select 1 from public.bank_entries where id=p and space_id=s and kind='folder') then raise exception '상위 폴더 오류'; end if;
 insert into public.bank_entries(id,space_id,parent_id,name,kind,bank_key,owner_id,verified) values(gen_random_uuid(),s,p,left(n,250),'folder',k,auth.uid(),true) on conflict(space_id,bank_key) do nothing;
 select * into result from public.bank_entries where space_id=s and bank_key=k;
 if result.kind<>'folder' or result.parent_id<>p then raise exception '폴더 충돌'; end if;
 return to_jsonb(result);
end $$;
create function public.bank_reserve(s uuid, f uuid, p uuid, n text, properties jsonb, bytes bigint, sha text, md text, chunk_count integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.bank_entries; begin
 if not public.bank_member(s) then raise insufficient_privilege; end if;
 if not exists(select 1 from public.bank_entries where id=p and space_id=s and kind='folder') then raise exception '상위 폴더 오류'; end if;
 if (properties->>'rootId') is distinct from s::text or properties->>'role' not in ('source','asset','attachment','docx','data','preview','commit') or properties->>'role' is null or (properties->>'role'='source' and coalesce(properties->>'sourceKey','') !~ '^[a-f0-9]{64}$') or sha is null or md is null or sha !~ '^[a-f0-9]{64}$' or md !~ '^[a-f0-9]{32}$' or bytes<=0 or chunk_count<>ceil(bytes::numeric/6291456)::integer then raise exception '파일 규격 오류'; end if;
 if properties->>'role'<>'source' and not exists(select 1 from public.bank_revisions r join public.bank_questions q on q.id=r.question_id where r.id=(properties->>'revisionId')::uuid and q.id=(properties->>'questionId')::uuid and q.space_id=s and q.owner_id=auth.uid() and not r.committed) then
  if not exists(select 1 from public.bank_entries where id=f and verified and owner_id=auth.uid()) then raise insufficient_privilege; end if;
 end if;
 insert into public.bank_entries(id,space_id,parent_id,name,kind,owner_id,props,size,sha256,md5,chunks) values(f,s,p,left(n,250),'file',auth.uid(),properties,bytes,sha,md,chunk_count) on conflict do nothing;
 select * into result from public.bank_entries where id=f;
 if not found and properties->>'role'='source' then select * into result from public.bank_entries where space_id=s and props->>'sourceKey'=properties->>'sourceKey'; end if;
 if result.id is null then raise exception '파일 예약 충돌'; end if;
 if result.space_id<>s or (result.parent_id<>p and properties->>'role'<>'source') or result.props<>properties or result.sha256<>sha or result.md5<>md or result.size<>bytes or (result.owner_id<>auth.uid() and not(result.verified and result.props->>'role'='source')) then raise exception '파일 ID 충돌'; end if;
 return to_jsonb(result);
end $$;

-- Called only by the verification Edge Function, after checking every byte and descriptor.
create function public.bank_finish(f uuid, actor uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.bank_entries; begin
 select * into e from public.bank_entries where id=f for update;
 if e.owner_id is distinct from actor or not exists(select 1 from public.bank_members m join auth.users u on u.id=actor where m.space_id=e.space_id and m.enabled and m.email=lower(u.email) and u.email_confirmed_at is not null) then raise insufficient_privilege; end if;
 if e.verified then return; end if;
 update public.bank_entries set verified=true where id=f;
 if e.props->>'role'='commit' then
  update public.bank_revisions set committed=true where id=(e.props->>'revisionId')::uuid and actor_id=actor;
  if not found then raise insufficient_privilege; end if;
  insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(e.space_id,actor,(select email from auth.users where id=actor),'commit',e.props->>'revisionId');
 end if;
end $$;
create function public.bank_object_allowed(object_name text, writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bank_entries e where object_name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[0-9]{3}$' and e.id::text=split_part(object_name,'/',2) and e.space_id::text=split_part(object_name,'/',1) and split_part(object_name,'/',3)::integer<e.chunks and public.bank_member(e.space_id) and case when writing then e.owner_id=auth.uid() and not e.verified else e.verified or e.owner_id=auth.uid() end);
$$;

alter table public.bank_spaces enable row level security;
alter table public.bank_members enable row level security;
alter table public.bank_questions enable row level security;
alter table public.bank_revisions enable row level security;
alter table public.bank_entries enable row level security;
alter table public.bank_audit enable row level security;
create policy member_read on public.bank_spaces for select to authenticated using(public.bank_member(id));
create policy member_read on public.bank_members for select to authenticated using(public.bank_member(space_id,true) or user_id=auth.uid());
create policy member_read on public.bank_questions for select to authenticated using(public.bank_member(space_id));
create policy member_read on public.bank_revisions for select to authenticated using(exists(select 1 from public.bank_questions q where q.id=question_id and public.bank_member(q.space_id) and (committed or actor_id=auth.uid())));
create policy member_read on public.bank_entries for select to authenticated using(public.bank_member(space_id) and (verified or owner_id=auth.uid()));
create policy member_read on public.bank_audit for select to authenticated using(public.bank_member(space_id));
revoke all on public.bank_spaces,public.bank_members,public.bank_questions,public.bank_revisions,public.bank_entries,public.bank_audit from anon,authenticated;
grant select on public.bank_spaces,public.bank_members,public.bank_questions,public.bank_revisions,public.bank_entries,public.bank_audit to authenticated;
revoke execute on function public.bank_member(uuid,boolean),public.bank_join(uuid),public.bank_invite(uuid,text,boolean),public.bank_begin_revision(uuid,uuid,uuid,uuid),public.bank_folder(uuid,text,text,uuid),public.bank_reserve(uuid,uuid,uuid,text,jsonb,bigint,text,text,integer),public.bank_finish(uuid,uuid),public.bank_object_allowed(text,boolean) from public,anon,authenticated;
grant execute on function public.bank_member(uuid,boolean),public.bank_join(uuid),public.bank_invite(uuid,text,boolean),public.bank_begin_revision(uuid,uuid,uuid,uuid),public.bank_folder(uuid,text,text,uuid),public.bank_reserve(uuid,uuid,uuid,text,jsonb,bigint,text,text,integer),public.bank_object_allowed(text,boolean) to authenticated;
grant execute on function public.bank_finish(uuid,uuid) to service_role;
create function public.bank_commits(s uuid, q uuid default null, start_at integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege; end if;
 if start_at<0 then raise exception '잘못된 페이지'; end if;
 return coalesce((select jsonb_agg(v.entry) from (select to_jsonb(e)||jsonb_build_object('author',jsonb_build_object('id',b.owner_id,'email',b.owner_email)) as entry from public.bank_entries e join public.bank_questions b on b.id=(e.props->>'questionId')::uuid where e.space_id=s and e.verified and e.props->>'role'='commit' and (q is null or b.id=q) order by e.created_at desc,e.id desc limit 100 offset start_at) v),'[]'::jsonb);
end $$;
revoke execute on function public.bank_commits(uuid,uuid,integer) from public,anon;
grant execute on function public.bank_commits(uuid,uuid,integer) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit) values('question-bank','question-bank',false,6291456);
create policy bank_read on storage.objects for select to authenticated using(bucket_id='question-bank' and public.bank_object_allowed(name));
create policy bank_insert on storage.objects for insert to authenticated with check(bucket_id='question-bank' and public.bank_object_allowed(name,true));

-- Stable installation ID. Each independently operated project has its own isolated database.
insert into public.bank_spaces values('57fcd460-b526-487f-9075-5503e4d07145','문제은행');
insert into public.bank_entries(id,space_id,name,kind,verified) values('57fcd460-b526-487f-9075-5503e4d07145','57fcd460-b526-487f-9075-5503e4d07145','문제은행','folder',true);
insert into public.bank_members(space_id,email,role) values('57fcd460-b526-487f-9075-5503e4d07145','animochoi@gmail.com','owner');
