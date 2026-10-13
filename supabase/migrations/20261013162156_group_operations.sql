-- Group membership is explicit; legacy papers remain private. No original storage objects are touched.
begin;
set local lock_timeout='5s';
create schema bank_ops;
revoke all on schema bank_ops from public,anon,authenticated;
create table public.bank_groups(
 id uuid primary key default gen_random_uuid(),space_id uuid not null references public.bank_spaces,
 name text not null check(name=btrim(name) and length(name) between 1 and 80),created_at timestamptz not null default now(),unique(space_id,id),unique(space_id,name));
alter table public.bank_members add column group_id uuid;
alter table public.bank_members add constraint member_group foreign key(space_id,group_id) references public.bank_groups(space_id,id);
alter table public.bank_invitations add column group_id uuid;
alter table public.bank_invitations add constraint invitation_group foreign key(space_id,group_id) references public.bank_groups(space_id,id);
create table public.bank_member_profiles(user_id uuid primary key references auth.users(id),
 display_name text not null check(display_name=btrim(display_name) and length(display_name) between 1 and 60),
 academy_name text not null check(academy_name=btrim(academy_name) and length(academy_name) between 1 and 120));
alter table public.bank_groups enable row level security;
alter table public.bank_member_profiles enable row level security;
revoke all on public.bank_groups,public.bank_member_profiles from public,anon,authenticated;
grant select on public.bank_groups,public.bank_member_profiles to authenticated;
create function bank_ops.group_id(s uuid) returns uuid language sql stable security definer set search_path='' as $$
 select group_id from public.bank_members where space_id=s and user_id=auth.uid() and enabled and public.bank_member(s);
$$;
create function bank_ops.manage_group(s uuid,g uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.bank_member(s,true) or (g is not null and g=bank_ops.group_id(s) and bank_access.can_manage(s)),false);
$$;
create policy group_read on public.bank_groups for select to authenticated using(public.bank_member(space_id) and (public.bank_member(space_id,true) or id=bank_ops.group_id(space_id)));
create policy own_profile on public.bank_member_profiles for select to authenticated using(user_id=auth.uid());
-- Policy helper execution is restricted to these read-only predicates.
grant usage on schema bank_ops to authenticated;
revoke all on function bank_ops.group_id(uuid),bank_ops.manage_group(uuid,uuid) from public,anon,authenticated;
grant execute on function bank_ops.group_id(uuid),bank_ops.manage_group(uuid,uuid) to authenticated;
-- Existing members are grandfathered. New email approvals still require a real profile before bank access.
alter table public.bank_members add column profile_required boolean not null default false;
alter table public.bank_members alter column profile_required set default true;
create or replace function public.bank_member(s uuid,admin boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select bank_security.allowed(s,auth.uid()) and exists(select 1 from public.bank_members m join auth.users u on u.id=auth.uid()
 where m.space_id=s and m.enabled and m.email=lower(u.email) and u.email_confirmed_at is not null
 and (not m.profile_required or exists(select 1 from public.bank_member_profiles p where p.user_id=u.id))
 and (m.user_id=u.id or (m.user_id is null and m.role='teacher'))
 and (m.role<>'owner' or exists(select 1 from bank_access.owners o where o.space_id=s and o.user_id=u.id))
 and (not admin or (m.role='owner' and exists(select 1 from bank_access.owners o where o.space_id=s and o.user_id=u.id))));
$$;
create function bank_ops.require_profile(u uuid) returns void language plpgsql security definer set search_path='' as $$
begin if not exists(select 1 from public.bank_member_profiles where user_id=u) then raise exception '이름과 학원명을 먼저 입력해 주세요.' using errcode='22023';end if;end $$;
create function public.bank_profile_get() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if auth.uid() is null then raise insufficient_privilege;end if;return coalesce((select to_jsonb(p)-'user_id' from public.bank_member_profiles p where user_id=auth.uid()),'{}');end $$;
create function public.bank_profile_set(full_name text,academy text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise insufficient_privilege;end if;
 if length(btrim(coalesce(full_name,''))) not between 1 and 60 or length(btrim(coalesce(academy,''))) not between 1 and 120 then raise exception '이름은 1~60자, 학원명은 1~120자로 입력해 주세요.' using errcode='22023';end if;
 insert into public.bank_member_profiles values(auth.uid(),btrim(full_name),btrim(academy)) on conflict(user_id) do update set display_name=excluded.display_name,academy_name=excluded.academy_name;
end $$;
create function public.bank_member_profile_set(s uuid,target_user uuid,full_name text,academy text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.bank_member(s,true) or not exists(select 1 from public.bank_members where space_id=s and user_id=target_user) then raise insufficient_privilege;end if;
 if length(btrim(coalesce(full_name,''))) not between 1 and 60 or length(btrim(coalesce(academy,''))) not between 1 and 120 then raise exception '이름은 1~60자, 학원명은 1~120자로 입력해 주세요.' using errcode='22023';end if;
 insert into public.bank_member_profiles values(target_user,btrim(full_name),btrim(academy)) on conflict(user_id) do update set display_name=excluded.display_name,academy_name=excluded.academy_name;
end $$;
create function public.bank_groups_list(s uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not bank_access.can_manage(s) then raise insufficient_privilege;end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'memberCount',(select count(*) from public.bank_members where space_id=s and group_id=g.id),'mockCount',(select count(*) from public.bank_mock_exams where space_id=s and group_id=g.id)) order by g.name),'[]') from public.bank_groups g where g.space_id=s and bank_ops.manage_group(s,g.id));
end $$;
create function public.bank_group_save(s uuid,g uuid,group_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;begin
 if not public.bank_member(s,true) then raise insufficient_privilege;end if;
 if length(btrim(coalesce(group_name,''))) not between 1 and 80 then raise exception '그룹 이름은 1~80자로 입력하세요.';end if;
 if g is null then insert into public.bank_groups(space_id,name) values(s,btrim(group_name)) returning id into result;
 else update public.bank_groups set name=btrim(group_name) where id=g and space_id=s returning id into result;if not found then raise insufficient_privilege;end if;end if;
 return result;
end $$;
create function public.bank_group_assign(s uuid,target_user uuid,g uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.bank_spaces where id=s for update;
 if not public.bank_member(s,true) then raise insufficient_privilege;end if;
 if g is not null and not exists(select 1 from public.bank_groups where space_id=s and id=g) then raise insufficient_privilege;end if;
 update public.bank_members set group_id=g where space_id=s and user_id=target_user;if not found then raise insufficient_privilege;end if;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'member_group_assign',jsonb_build_object('userId',target_user,'groupId',g)::text);
end $$;
create function public.bank_group_delete(s uuid,g uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.bank_spaces where id=s for update;
 if not public.bank_member(s,true) then raise insufficient_privilege;end if;
 if exists(select 1 from public.bank_members where space_id=s and group_id=g) or exists(select 1 from public.bank_mock_exams where space_id=s and group_id=g) or exists(select 1 from public.bank_invitations where space_id=s and group_id=g and status in ('active','requested') and expires_at>now()) then raise exception '회원 재배정, 모의고사 삭제, 유효한 초대 취소 후 그룹을 삭제하세요.' using errcode='PT409';end if;
 update public.bank_invitations set group_id=null where space_id=s and group_id=g;
 delete from public.bank_groups where space_id=s and id=g;
end $$;
create or replace function public.bank_members_manage(s uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not bank_access.can_manage(s) then raise insufficient_privilege;end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('email',m.email,'userId',m.user_id,'role',m.role,'enabled',m.enabled,'roleVersion',m.role_version,'name',coalesce(p.display_name,m.display_name),'academy',p.academy_name,'groupId',m.group_id,'groupName',g.name) order by g.name nulls last,m.email),'[]') from public.bank_members m left join public.bank_member_profiles p on p.user_id=m.user_id left join public.bank_groups g on g.id=m.group_id where m.space_id=s and bank_ops.manage_group(s,m.group_id));
end $$;
alter table public.bank_mock_exams add column group_id uuid;
alter table public.bank_mock_exams add constraint mock_group foreign key(space_id,group_id) references public.bank_groups(space_id,id);
alter table public.bank_mock_exams add column expires_at timestamptz;
alter table public.bank_exam_drafts add column expires_at timestamptz;
update public.bank_mock_exams set expires_at=(created_at at time zone 'Asia/Seoul'+interval '6 months') at time zone 'Asia/Seoul';
update public.bank_exam_drafts set expires_at=(created_at at time zone 'Asia/Seoul'+interval '6 months') at time zone 'Asia/Seoul';
alter table public.bank_mock_exams alter column expires_at set not null;
alter table public.bank_exam_drafts alter column expires_at set not null;
create index member_group_lookup on public.bank_members(space_id,group_id);
create index invitation_group_lookup on public.bank_invitations(space_id,group_id);
create index mock_group_lookup on public.bank_mock_exams(space_id,group_id,expires_at);
create index exam_expiry on public.bank_exam_drafts(expires_at);
create function bank_ops.paper_lifetime() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.created_at=now();new.expires_at=(new.created_at at time zone 'Asia/Seoul'+interval '6 months') at time zone 'Asia/Seoul';
  if tg_table_name='bank_mock_exams' then new.group_id=bank_ops.group_id(new.space_id);end if;
 else
  new.created_at=old.created_at;new.expires_at=old.expires_at;
  if tg_table_name='bank_mock_exams' then new.group_id=old.group_id;end if;
  if old.expires_at<=now() then raise exception '보관 기간 6개월이 지난 시험지입니다.' using errcode='PT410';end if;
 end if;return new;
end $$;
create trigger paper_lifetime before insert or update on public.bank_mock_exams for each row execute function bank_ops.paper_lifetime();
create trigger paper_lifetime before insert or update on public.bank_exam_drafts for each row execute function bank_ops.paper_lifetime();
create function bank_ops.mock_read(s uuid,g uuid,u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.bank_member(s) and (public.bank_member(s,true) or (g is null and u=auth.uid()) or (g is not null and g=bank_ops.group_id(s))),false);
$$;
revoke all on function bank_ops.mock_read(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function bank_ops.mock_read(uuid,uuid,uuid) to authenticated;
drop policy mock_owner_read on public.bank_mock_exams;
create policy own_mock on public.bank_mock_exams for select to authenticated using(expires_at>now() and bank_ops.mock_read(space_id,group_id,owner_id));
create or replace function public.bank_mock_list(s uuid,start_at integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not public.bank_member(s) then raise insufficient_privilege;end if;
 return (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select e.id,e.title,e.version,e.created_at,e.expires_at,e.updated_at,e.group_id,e.owner_id,coalesce(p.display_name,m.display_name,'이름 미입력') creator_name,g.name group_name,jsonb_array_length(e.document->'variants') variant_count,
 (e.owner_id=auth.uid()) can_edit,(e.owner_id=auth.uid() or bank_ops.manage_group(s,e.group_id)) can_delete
 from public.bank_mock_exams e left join public.bank_members m on m.space_id=e.space_id and m.user_id=e.owner_id left join public.bank_member_profiles p on p.user_id=e.owner_id left join public.bank_groups g on g.id=e.group_id
 where e.space_id=s and e.expires_at>now() and bank_ops.mock_read(s,e.group_id,e.owner_id) and bank_grade.document_matches(s,e.document) order by e.updated_at desc,e.id limit 30 offset greatest(0,start_at)) x);
end $$;
create or replace function public.bank_mock_get(s uuid,e uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.bank_mock_exams;begin
 select * into r from public.bank_mock_exams where id=e and space_id=s;
 if not found or r.expires_at<=now() or not bank_ops.mock_read(s,r.group_id,r.owner_id) or not bank_grade.document_matches(s,r.document) then raise insufficient_privilege;end if;
 return to_jsonb(r)||jsonb_build_object('can_edit',r.owner_id=auth.uid());
end $$;
-- Original identity is resolved from authoritative bank metadata, never submitted text.
create function bank_ops.original_id(s uuid,q uuid) returns uuid language plpgsql stable security definer set search_path='' as $$
declare cur uuid:=q;nxt text;seen uuid[]:='{}';begin
 loop
  if cur=any(seen) then raise exception '원본 문항 연결에 순환이 있습니다.';end if;seen=array_append(seen,cur);
  select nullif(metadata#>>'{relations,originalQuestionId}','') into nxt from public.bank_catalog where space_id=s and question_id=cur order by created_at desc,revision_id desc limit 1;
  if nxt is null then return cur;end if;
  if nxt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception '원본 문항 식별자를 확인하세요.';end if;
  cur=nxt::uuid;
 end loop;
end $$;
create function public.bank_mock_usage(s uuid,current_exam uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g uuid;own public.bank_mock_exams;begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 g=bank_ops.group_id(s);
 if current_exam is not null then select * into own from public.bank_mock_exams where id=current_exam;
  if found then if own.space_id<>s or own.owner_id<>auth.uid() or not bank_ops.mock_read(s,own.group_id,own.owner_id) then raise insufficient_privilege;end if;g=own.group_id;end if;
 end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('questionId',x.question_id,'originalId',bank_ops.original_id(s,x.question_id),'examId',e.id,'title',e.title,'creator',coalesce(p.display_name,m.display_name,'이름 미입력'))),'[]') from (select distinct exam_id,question_id from public.bank_mock_items) x join public.bank_mock_exams e on e.id=x.exam_id left join public.bank_member_profiles p on p.user_id=e.owner_id left join public.bank_members m on m.space_id=s and m.user_id=e.owner_id
 where e.space_id=s and e.expires_at>now() and e.id is distinct from current_exam and ((g is not null and e.group_id=g) or (g is null and e.group_id is null and e.owner_id=auth.uid())));
end $$;
create function public.bank_mock_check(s uuid,current_exam uuid,question_ids uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare used jsonb;begin
 used=public.bank_mock_usage(s,current_exam);
 return (with keys as materialized(select distinct bank_ops.original_id(s,q)::text k from unnest(question_ids) q) select coalesce(jsonb_agg(u),'[]') from jsonb_array_elements(used) u where u->>'originalId' in(select k from keys));
end $$;
-- Lock a retained group's domain before validating AND writing. A concurrent save sees the committed winner.
alter function public.bank_mock_save(uuid,uuid,integer,jsonb) set schema bank_ops;
create function public.bank_mock_save(s uuid,e uuid,expected integer,doc jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare g uuid;old public.bank_mock_exams;conflicts jsonb;ids uuid[];begin
 perform 1 from public.bank_spaces where id=s for share;
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 select * into old from public.bank_mock_exams where id=e;
 if found then
  if old.space_id<>s or old.owner_id<>auth.uid() or not bank_ops.mock_read(s,old.group_id,old.owner_id) then raise insufficient_privilege;end if;
  if old.expires_at<=now() then raise exception '보관 기간이 만료되었습니다.' using errcode='PT410';end if;g=old.group_id;
 else g=bank_ops.group_id(s);end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||coalesce(g::text,auth.uid()::text),38));
 select array_agg(distinct (i->>'questionId')::uuid) into ids from jsonb_array_elements(doc->'variants') v cross join lateral jsonb_array_elements(coalesce(nullif(v#>'{paper,items}','null'),'[]')) i;
 conflicts=public.bank_mock_check(s,e,coalesce(ids,'{}'));
 if jsonb_array_length(conflicts)>0 then raise exception '이미 보관 중인 모의고사에 사용된 문제입니다. 충돌 문항을 교체하거나 기존 모의고사를 먼저 삭제하세요.' using errcode='PT409',detail=conflicts::text;end if;
 return bank_ops.bank_mock_save(s,e,expected,doc);
end $$;
create function public.bank_mock_delete(s uuid,e uuid,expected integer,title_confirmation text) returns void language plpgsql security definer set search_path='' as $$
declare r public.bank_mock_exams;begin
 perform 1 from public.bank_spaces where id=s for share;
 select * into r from public.bank_mock_exams where id=e and space_id=s;
 if not found then return;end if;
 if not bank_ops.mock_read(s,r.group_id,r.owner_id) or not(r.owner_id=auth.uid() or bank_ops.manage_group(s,r.group_id)) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||coalesce(r.group_id::text,r.owner_id::text),38));
 select * into r from public.bank_mock_exams where id=e for update;if not found then return;end if;
 if r.version is distinct from expected or r.title is distinct from title_confirmation then raise exception '시험지가 변경되었습니다. 다시 확인하세요.' using errcode='PT409';end if;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'mock_delete',jsonb_build_object('id',e,'ownerId',r.owner_id,'title',r.title)::text);
 delete from public.bank_mock_exams where id=e; -- items cascade; previews are question-bank references, NOT owned files.
end $$;
-- Browser exports are downloads, not server storage objects. Documents contain their own layout/logo data.
-- Delete histories and drafts atomically; NEVER delete referenced original question-bank files.
create function bank_ops.expire_papers() returns jsonb language plpgsql security definer set search_path='' as $$
declare r record;n integer:=0;m integer:=0;begin
 for r in select id from public.bank_exam_drafts where expires_at<=now() order by id for update skip locked limit 200 loop
  delete from public.bank_exam_history where exam_id=r.id;delete from public.bank_exam_drafts where id=r.id;n=n+1;
 end loop;
 for r in select id from public.bank_mock_exams where expires_at<=now() order by id for update skip locked limit 200 loop
  delete from public.bank_mock_exams where id=r.id;m=m+1;
 end loop;
 return jsonb_build_object('exams',n,'mocks',m);
end $$;

create or replace function public.bank_member_change_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid;begin
 if tg_op='INSERT' then sid=new.space_id;else sid=old.space_id;end if;
 perform 1 from public.bank_spaces where id=sid for update;
 if tg_op<>'INSERT' and exists(select 1 from bank_access.owners where space_id=old.space_id and user_id=old.user_id) then
  if tg_op='DELETE' then raise insufficient_privilege;end if;
  if new.user_id is distinct from old.user_id or new.email is distinct from old.email or new.space_id is distinct from old.space_id or new.role<>'owner' or not new.enabled then raise insufficient_privilege;end if;
 end if;
 if tg_op='DELETE' then return old;end if;
 if new.role='owner' and not exists(select 1 from bank_access.owners where space_id=new.space_id and user_id=new.user_id) then raise insufficient_privilege;end if;
 if tg_op='UPDATE' and (new.space_id is distinct from old.space_id or new.email is distinct from old.email) then raise insufficient_privilege;end if;
 if tg_op='INSERT' then new.role_version=0;
 elsif (new.role,new.enabled,new.user_id,new.group_id) is distinct from (old.role,old.enabled,old.user_id,old.group_id) then new.role_version=old.role_version+1;
 else new.role_version=old.role_version;end if;
 return new;
end $$;

create or replace function public.bank_access_context(s uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return (select jsonb_build_object('role',role,'roleVersion',role_version,'userId',user_id,'groupId',group_id) from public.bank_members where space_id=s and user_id=auth.uid());
end $$;

create or replace function public.bank_member_revoke(s uuid,target_user uuid,expected_version bigint) returns void language plpgsql security definer set search_path='' as $$
declare member public.bank_members;begin
 perform 1 from public.bank_spaces where id=s for update;
 if not bank_access.can_manage(s) then raise insufficient_privilege;end if;
 select * into member from public.bank_members where space_id=s and user_id=target_user for update;
 if not found or not bank_ops.manage_group(s,member.group_id) or member.role='owner' or (member.role<>'teacher' and not public.bank_member(s,true)) then raise insufficient_privilege;end if;
 if member.role_version is distinct from expected_version then raise exception '회원 정보가 변경되었습니다. 다시 확인하세요.' using errcode='PT409';end if;
 if not member.enabled then return;end if;
 update public.bank_members set enabled=false where space_id=s and user_id=target_user;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'member_revoke',target_user::text);
end $$;

create or replace function public.bank_signup_approve(s uuid,target_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare person auth.users; req bank_access.requests; member public.bank_members;begin
 perform 1 from public.bank_spaces where id=s for update;
 if not public.bank_member(s,true) then raise insufficient_privilege;end if;
 select * into req from bank_access.requests where space_id=s and user_id=target_user for update;
 if not found then raise insufficient_privilege;end if;
 select * into person from auth.users where id=target_user;
 if person.email_confirmed_at is null then raise insufficient_privilege;end if;
 select * into member from public.bank_members where space_id=s and (user_id=target_user or email=lower(person.email)) for update;
 if found then
  if not member.enabled or member.role<>'teacher' or member.user_id is distinct from target_user then raise insufficient_privilege;end if;
 else
  if req.status<>'pending' then raise insufficient_privilege;end if;
  insert into public.bank_members(space_id,email,user_id,role,enabled,joined_at) values(s,lower(person.email),target_user,'teacher',true,now());
 end if;
 if req.status='approved' then return;end if;
 update bank_access.requests set status='approved',decided_at=now(),decided_by=auth.uid() where space_id=s and user_id=target_user;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'signup_approve',target_user::text);
end $$;

create or replace function public.bank_signup_list(s uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not bank_access.can_manage(s) then raise insufficient_privilege;end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('kind','signup','userId',r.user_id,'email',u.email,'createdAt',r.created_at,'status',r.status) order by r.created_at,r.user_id),'[]')
 from bank_access.requests r join auth.users u on u.id=r.user_id where public.bank_member(s,true) and r.space_id=s and r.status='pending'
 and not exists(select 1 from public.bank_members m where m.space_id=s and (m.user_id=r.user_id or m.email=lower(u.email)))) ||
 (select coalesce(jsonb_agg(jsonb_build_object('kind','invite','id',i.id,'userId',i.claimed_by,'email',i.claimed_email,'createdAt',i.claimed_at,'status','pending') order by i.claimed_at,i.id),'[]') from public.bank_invitations i where bank_ops.manage_group(s,i.group_id) and i.space_id=s and i.status='requested' and i.expires_at>now()
 and not exists(select 1 from public.bank_members m where m.space_id=s and (m.user_id=i.claimed_by or m.email=i.claimed_email)));
end $$;

alter function public.bank_signup_request(uuid,boolean) set schema bank_ops;
create function public.bank_signup_request(s uuid,submit boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
begin if submit and not public.bank_member(s) then perform bank_ops.require_profile(auth.uid());end if;return bank_ops.bank_signup_request(s,submit);end $$;

create or replace function public.bank_invite_accept(token_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare invitation public.bank_invitations; person auth.users; existing public.bank_members; rate public.bank_invite_attempts;begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 select * into person from auth.users where id=auth.uid();
 if person.email_confirmed_at is null or person.email is null then raise exception '확인된 Google 계정으로 로그인하세요.' using errcode='42501';end if;
 if token_digest is null or token_digest !~ '^[a-f0-9]{64}$' then raise exception '초대 링크가 올바르지 않습니다.';end if;
 insert into public.bank_invite_attempts(user_id,window_start,attempts) values(auth.uid(),now(),1)
 on conflict(user_id) do update set window_start=case when bank_invite_attempts.window_start<now()-interval '15 minutes' then now() else bank_invite_attempts.window_start end,
 attempts=case when bank_invite_attempts.window_start<now()-interval '15 minutes' then 1 else bank_invite_attempts.attempts+1 end
 returning * into rate;
 if rate.attempts>20 then return jsonb_build_object('status','rate_limited');end if;
 select * into invitation from public.bank_invitations where token_hash=token_digest for update;
 if not found or invitation.status='cancelled' or invitation.expires_at<=now() then return jsonb_build_object('status','unavailable');end if;
 select * into existing from public.bank_members where space_id=invitation.space_id and email=lower(person.email) for update;
 if found and not existing.enabled then return jsonb_build_object('status','blocked');end if;
 if invitation.invited_email is not null and invitation.invited_email<>lower(person.email) then return jsonb_build_object('status','email_mismatch');end if;
 if existing.email is not null then
  if existing.user_id is not null and existing.user_id<>auth.uid() then raise insufficient_privilege;end if;
  update public.bank_members set user_id=auth.uid(),joined_at=coalesce(joined_at,now()) where space_id=invitation.space_id and email=lower(person.email) and user_id is null;
  return jsonb_build_object('status','already_member','role',existing.role);
 end if;
 perform bank_ops.require_profile(auth.uid());
 if invitation.status='accepted' then return jsonb_build_object('status','unavailable');end if;
 if invitation.status='requested' then
  if invitation.claimed_by=auth.uid() then return jsonb_build_object('status','pending');end if;
  return jsonb_build_object('status','claimed');
 end if;
 if invitation.invited_email is null then
  update public.bank_invitations set status='requested',claimed_by=auth.uid(),claimed_email=lower(person.email),claimed_at=now() where id=invitation.id;
  insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(invitation.space_id,auth.uid(),person.email,'invite_request',invitation.id::text);
  return jsonb_build_object('status','pending');
 end if;
 insert into public.bank_members(space_id,email,user_id,role,enabled,display_name,joined_at)
 values(invitation.space_id,lower(person.email),auth.uid(),'teacher',true,(select display_name from public.bank_member_profiles where user_id=auth.uid()),now());
 update public.bank_invitations set status='accepted',claimed_by=auth.uid(),claimed_email=lower(person.email),claimed_at=now(),accepted_at=now() where id=invitation.id;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(invitation.space_id,auth.uid(),person.email,'invite_accept',invitation.id::text);
 return jsonb_build_object('status','joined','role','teacher');
end $$;

create function bank_ops.invitation_accepted() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='accepted' and old.status<>'accepted' then
  update public.bank_members set group_id=new.group_id where space_id=new.space_id and user_id=new.claimed_by;
 end if;return new;
end $$;
create trigger invitation_accepted after update on public.bank_invitations for each row execute function bank_ops.invitation_accepted();

create or replace function public.bank_invite_decide(invite_id uuid,approve boolean) returns void language plpgsql security definer set search_path='' as $$
declare invitation public.bank_invitations;person auth.users;existing public.bank_members;begin
 select * into invitation from public.bank_invitations where id=invite_id for update;
 if not found or not bank_ops.manage_group(invitation.space_id,invitation.group_id) or (not approve and not public.bank_member(invitation.space_id,true)) then raise insufficient_privilege;end if;
 if invitation.status<>'requested' or invitation.expires_at<=now() then raise exception '처리할 승인 신청이 없습니다.' using errcode='PT409';end if;
 if approve then perform bank_ops.require_profile(invitation.claimed_by);
  select * into person from auth.users where id=invitation.claimed_by;
  if person.email_confirmed_at is null or lower(person.email)<>invitation.claimed_email then raise exception '신청 계정을 다시 확인하세요.' using errcode='PT409';end if;
  select * into existing from public.bank_members where space_id=invitation.space_id and email=invitation.claimed_email for update;
  if found and (not existing.enabled or existing.role<>'teacher' or existing.user_id is distinct from invitation.claimed_by) then raise exception '승인할 수 없는 대상입니다.' using errcode='42501';end if;
  if not found then
   insert into public.bank_members(space_id,email,user_id,role,enabled,display_name,joined_at)
   values(invitation.space_id,invitation.claimed_email,invitation.claimed_by,'teacher',true,nullif(invitation.note,''),now());
  end if;
  update public.bank_invitations set status='accepted',accepted_at=now() where id=invite_id;
 else update public.bank_invitations set status='cancelled',cancelled_at=now() where id=invite_id;
 end if;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target)
 values(invitation.space_id,auth.uid(),(select email from auth.users where id=auth.uid()),case when approve then 'invite_approve' else 'invite_reject' end,invite_id::text);
end $$;

create or replace function bank_ops.invite_create(s uuid,token_digest text,email_address text default null,note_text text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; normalized text;begin
 if not bank_access.can_manage(s) then raise insufficient_privilege;end if;
 if token_digest is null or token_digest !~ '^[a-f0-9]{64}$' then raise exception '초대 토큰 형식 오류';end if;
 normalized=nullif(lower(trim(email_address)),'');
 if normalized is not null and (length(normalized)>254 or normalized !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then raise exception '이메일을 확인하세요.';end if;
 if length(coalesce(note_text,''))>200 then raise exception '관리 메모가 너무 깁니다.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(s::text||auth.uid()::text,0));
 if (select count(*) from public.bank_invitations where space_id=s and created_by=auth.uid() and created_at>now()-interval '1 day')>=20 then raise exception '하루 초대 생성 한도(20건)를 넘었습니다.' using errcode='PT429';end if;
 insert into public.bank_invitations(space_id,token_hash,invited_email,note,created_by)
 values(s,token_digest,normalized,nullif(trim(note_text),''),auth.uid()) returning id into result;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target)
 values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'invite_link_create',result::text);
 return result;
end $$;

create function public.bank_group_invite_create(s uuid,g uuid,token_digest text,email_address text,note_text text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;address text:=lower(btrim(coalesce(email_address,'')));begin
 perform 1 from public.bank_spaces where id=s for update;
 if not bank_ops.manage_group(s,g) or (g is not null and not exists(select 1 from public.bank_groups where id=g and space_id=s)) then raise insufficient_privilege;end if;
 if address='' then raise exception '초대할 이메일을 입력하세요.';end if;
 if exists(select 1 from public.bank_members where space_id=s and email=address) then raise exception '이미 등록된 이메일입니다. 회원 관리에서 확인하세요.' using errcode='PT409';end if;
 if exists(select 1 from public.bank_invitations where space_id=s and invited_email=address and status in ('active','requested') and expires_at>now()) then raise exception '유효한 초대가 이미 있습니다. 기존 초대를 취소하거나 재발급하세요.' using errcode='PT409';end if;
 result=bank_ops.invite_create(s,token_digest,address,note_text);
 update public.bank_invitations set group_id=g where id=result;return result;
end $$;

create or replace function public.bank_invite_cancel(invite_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare invitation public.bank_invitations;begin
 select * into invitation from public.bank_invitations where id=invite_id for update;
 if not found or not bank_ops.manage_group(invitation.space_id,invitation.group_id) then raise insufficient_privilege;end if;
 if invitation.status='accepted' then raise exception '이미 참여한 회원은 회원 관리에서 이용을 중지하세요.';end if;
 if invitation.status='cancelled' then return;end if;
 update public.bank_invitations set status='cancelled',cancelled_at=now() where id=invite_id;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(invitation.space_id,auth.uid(),(select email from auth.users where id=auth.uid()),'invite_cancel',invite_id::text);
end $$;

create or replace function public.bank_invite_mail_claim(invite_id uuid,token_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare invitation public.bank_invitations;begin
 select * into invitation from public.bank_invitations where id=invite_id for update;
 if not found or not bank_ops.manage_group(invitation.space_id,invitation.group_id) then raise insufficient_privilege;end if;
 if invitation.token_hash<>token_digest or invitation.status<>'active' or invitation.expires_at<=now() or invitation.invited_email is null then raise exception '발송할 유효한 이메일 초대가 없습니다.' using errcode='PT409';end if;
 if invitation.email_attempts>=3 or invitation.last_email_at>now()-interval '1 minute' then raise exception '메일 발송 횟수 제한입니다. 잠시 후 재발급을 검토하세요.' using errcode='PT429';end if;
 update public.bank_invitations set email_attempts=email_attempts+1,last_email_at=now(),last_email_state='sending' where id=invite_id;
 return jsonb_build_object('email',invitation.invited_email,'expiresAt',invitation.expires_at);
end $$;

create or replace function public.bank_invite_mail_check(invite_id uuid,token_digest text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare invitation public.bank_invitations;begin
 select * into invitation from public.bank_invitations where id=invite_id;
 if not found or not bank_ops.manage_group(invitation.space_id,invitation.group_id) then raise insufficient_privilege;end if;
 if invitation.token_hash<>token_digest or invitation.status<>'active' or invitation.expires_at<=now() or invitation.invited_email is null then raise exception '발송할 유효한 이메일 초대가 없습니다.' using errcode='PT409';end if;
 return jsonb_build_object('email',invitation.invited_email,'expiresAt',invitation.expires_at);
end $$;

create or replace function public.bank_invite_reissue(invite_id uuid,token_digest text) returns uuid language plpgsql security definer set search_path='' as $$
declare invitation public.bank_invitations;result uuid;begin
 select * into invitation from public.bank_invitations where id=invite_id for update;
 if not found or not bank_ops.manage_group(invitation.space_id,invitation.group_id) then raise insufficient_privilege;end if;
 if invitation.status='accepted' then raise exception '이미 참여한 회원은 새 링크가 필요하지 않습니다.';end if;
 if token_digest is null or token_digest !~ '^[a-f0-9]{64}$' then raise exception '초대 토큰 형식 오류';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(invitation.space_id::text||auth.uid()::text,0));
 if (select count(*) from public.bank_invitations where space_id=invitation.space_id and created_by=auth.uid() and created_at>now()-interval '1 day')>=20 then raise exception '하루 초대 생성 한도(20건)를 넘었습니다.' using errcode='PT429';end if;
 update public.bank_invitations set status='cancelled',cancelled_at=now() where id=invite_id and status<>'cancelled';
 insert into public.bank_invitations(space_id,token_hash,invited_email,note,created_by,group_id)
 values(invitation.space_id,token_digest,invitation.invited_email,invitation.note,auth.uid(),invitation.group_id) returning id into result;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(invitation.space_id,auth.uid(),(select email from auth.users where id=auth.uid()),'invite_reissue',invite_id::text||' -> '||result::text);
 return result;
end $$;

drop policy owner_read_invites on public.bank_invitations;
create policy owner_read_invites on public.bank_invitations for select to authenticated using(bank_ops.manage_group(space_id,group_id));

create or replace function public.bank_exam_list(s uuid, start_at integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
  select e.id,e.title,e.version,e.created_at,e.expires_at,e.updated_at,
   coalesce(e.document->>'status','draft') status,jsonb_array_length(e.document->'items') item_count,
   (select f from public.bank_catalog c cross join lateral jsonb_array_elements(c.files) f
    where c.revision_id=(e.document#>>'{items,0,revisionId}')::uuid and c.space_id=s and f->>'role'='preview'
      and public.bank_read_revision(c.revision_id) limit 1) preview
  from public.bank_exam_drafts e where bank_grade.document_matches(s,e.document) and e.space_id=s and e.owner_id=auth.uid() and e.archived_at is null and e.expires_at>now()
  order by e.updated_at desc,e.id limit 30 offset greatest(0,start_at)
 ) x),'[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.bank_download_begin(s uuid, request_id uuid, fmt text, revisions uuid[], request_kind text DEFAULT 'exam'::text, paper_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 declare old bank_security.downloads;ids uuid[];questions uuid[];sources text[];code text;begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if not exists(select 1 from bank_security.settings where space_id=s) then raise exception '다운로드 설정을 확인할 수 없습니다.';end if;
 if fmt is null or request_kind is null or request_id is null or array_position(revisions,null) is not null or fmt not in ('pdf','docx','hwpx','backup') or request_kind not in ('question','exam','mock','backup','local') or (cardinality(revisions)>(case when fmt='backup' and public.bank_member(s,true) then 100000 else 1000 end) and not (
 fmt='pdf' and request_kind='exam' and exists(select 1 from public.bank_exam_drafts e
 where e.id=paper_id and e.space_id=s and e.owner_id=auth.uid() and e.archived_at is null and e.document->>'kind'='past-paper-print'
 and not exists(select 1 from unnest(revisions) r where not exists(select 1 from jsonb_array_elements(e.document->'items') i where i->>'revisionId'=r::text))
 and not exists(select 1 from jsonb_array_elements(e.document->'items') i where not (i->>'revisionId')::uuid=any(revisions))
 ))) or revisions is null then raise exception '다운로드 요청을 확인하세요.';end if;
 select coalesce(array_agg(distinct x order by x),'{}') into ids from unnest(revisions) x where x is not null;
 if cardinality(ids)=0 and request_kind<>'local' then raise exception '출력 문항이 없습니다.';end if;
 if exists(select 1 from unnest(ids) id where not exists(select 1 from public.bank_catalog c where c.space_id=s and c.revision_id=id and public.bank_read_revision(id))) then raise insufficient_privilege;end if;
 if paper_id is not null and not exists(select 1 from public.bank_exam_drafts where id=paper_id and space_id=s and owner_id=auth.uid()) and not exists(select 1 from public.bank_mock_exams where id=paper_id and space_id=s and expires_at>now() and bank_ops.mock_read(s,group_id,owner_id)) then raise insufficient_privilege;end if;
 perform 1 from public.bank_spaces where id=s for share;
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 insert into bank_security.accounts(space_id,user_id) values(s,auth.uid()) on conflict do nothing;
 perform 1 from bank_security.accounts where space_id=s and user_id=auth.uid() for update;
 if not bank_security.allowed(s,auth.uid()) then raise insufficient_privilege;end if;
 select * into old from bank_security.downloads where id=request_id;
 if found then
  if old.space_id<>s or old.user_id<>auth.uid() or old.format<>fmt or old.revision_ids<>ids or old.kind<>request_kind or old.exam_id is distinct from paper_id then raise insufficient_privilege;end if;
  if old.state<>'requested' then raise exception '새 다운로드 요청으로 다시 시도하세요.';end if;
 else
  select coalesce(array_agg(distinct c.metadata#>>'{source,documentId}'),'{}') into sources from public.bank_catalog c join bank_security.sources(s) source on source.source_id=c.metadata#>>'{source,documentId}' where c.revision_id=any(ids);
  select array_agg(distinct question_id order by question_id) into questions from public.bank_catalog where revision_id=any(ids);
  insert into bank_security.downloads(id,space_id,user_id,format,kind,exam_id,revision_ids,question_ids,source_ids) values(request_id,s,auth.uid(),fmt,request_kind,paper_id,ids,coalesce(questions,'{}'),sources);
 end if;
 code:=bank_security.watermark(s,auth.uid());
 return jsonb_build_object('requestId',request_id,'identifier',code);
end $function$
;

alter function public.bank_mock_snapshot(uuid,jsonb,uuid[]) set schema bank_ops;
create function public.bank_mock_snapshot(s uuid,schools jsonb,exclude_exams uuid[] default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare data jsonb;used jsonb;begin
 data=bank_ops.bank_mock_snapshot(s,schools,'{}'::uuid[]);used=public.bank_mock_usage(s,null);
 return data||jsonb_build_object('excludeIds',(select coalesce(jsonb_agg(distinct u->>'questionId'),'[]') from jsonb_array_elements(used) u),'exclusions',used,'candidates',(with candidates as materialized(select c,bank_ops.original_id(s,(c->>'question_id')::uuid)::text k from jsonb_array_elements(data->'candidates') c) select coalesce(jsonb_agg(c),'[]') from candidates where k not in(select u->>'originalId' from jsonb_array_elements(used) u)));
 end $$;

alter function public.bank_mock_recommendation_snapshot(uuid,uuid[]) set schema bank_ops;
create function public.bank_mock_recommendation_snapshot(s uuid,exclude_exams uuid[] default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare data jsonb;used jsonb;begin
 data=bank_ops.bank_mock_recommendation_snapshot(s,'{}'::uuid[]);used=public.bank_mock_usage(s,null);
 return data||jsonb_build_object('excludeIds',(select coalesce(jsonb_agg(distinct u->>'questionId'),'[]') from jsonb_array_elements(used) u),'exclusions',used,'candidates',(with candidates as materialized(select c,bank_ops.original_id(s,(c->>'question_id')::uuid)::text k from jsonb_array_elements(data->'candidates') c) select coalesce(jsonb_agg(c),'[]') from candidates where k not in(select u->>'originalId' from jsonb_array_elements(used) u)));
 end $$;

create function public.bank_mock_candidates(s uuid,current_exam uuid,schools jsonb default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare data jsonb;used jsonb;begin
 used=public.bank_mock_usage(s,current_exam);
 if schools is null then data=bank_ops.bank_mock_recommendation_snapshot(s,'{}');else data=bank_ops.bank_mock_snapshot(s,schools,'{}');end if;
 return data||jsonb_build_object('excludeIds',(select coalesce(jsonb_agg(distinct u->>'questionId'),'[]') from jsonb_array_elements(used) u),'exclusions',used,'candidates',(with candidates as materialized(select c,bank_ops.original_id(s,(c->>'question_id')::uuid)::text k from jsonb_array_elements(data->'candidates') c) select coalesce(jsonb_agg(c),'[]') from candidates where k not in(select u->>'originalId' from jsonb_array_elements(used) u)));
end $$;


-- Replacement uses the same automatic exclusions, including original IDs of copies.
alter function public.bank_replacement_page(uuid,uuid,jsonb,uuid[],integer,boolean,text,uuid) set schema bank_ops;
create function public.bank_replacement_page(s uuid,current_revision uuid,rules jsonb,selected uuid[],page integer default 0,expanded boolean default false,expected_version text default null,candidate uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare used jsonb;excluded uuid[];conflicts jsonb;begin
 if rules ? 'mockExamId' then
  used=public.bank_mock_usage(s,(rules->>'mockExamId')::uuid);
  if candidate is not null then conflicts=public.bank_mock_check(s,(rules->>'mockExamId')::uuid,array[candidate]);
   if jsonb_array_length(conflicts)>0 then raise exception '이미 보관 중인 모의고사에 사용된 문제입니다. 기존 모의고사를 먼저 삭제하세요.' using errcode='PT409',detail=conflicts::text;end if;
  end if;
  with ids as materialized(select distinct question_id from public.bank_catalog where space_id=s),keys as materialized(select question_id,bank_ops.original_id(s,question_id)::text k from ids) select array_agg(question_id) into excluded from keys where k in(select u->>'originalId' from jsonb_array_elements(used) u);
  selected=coalesce(selected,'{}')||coalesce(excluded,'{}');
 end if;
 return bank_ops.bank_replacement_page(s,current_revision,rules,selected,page,expanded,expected_version,candidate);
end $$;
revoke all on function public.bank_replacement_page(uuid,uuid,jsonb,uuid[],integer,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.bank_replacement_page(uuid,uuid,jsonb,uuid[],integer,boolean,text,uuid) to authenticated;
-- Block reads and unchanged-save replays of expired ordinary papers as well.
alter function public.bank_exam_get(uuid,uuid) set schema bank_ops;
create function public.bank_exam_get(s uuid,e uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if exists(select 1 from public.bank_exam_drafts where id=e and space_id=s and owner_id=auth.uid() and expires_at<=now()) then raise exception '보관 기간이 만료되었습니다.' using errcode='PT410';end if;return bank_ops.bank_exam_get(s,e);end $$;
alter function public.bank_exam_save(uuid,uuid,integer,jsonb) set schema bank_ops;
create function public.bank_exam_save(s uuid,e uuid,expected integer,doc jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin if exists(select 1 from public.bank_exam_drafts where id=e and space_id=s and owner_id=auth.uid() and expires_at<=now()) then raise exception '보관 기간이 만료되었습니다.' using errcode='PT410';end if;return bank_ops.bank_exam_save(s,e,expected,doc);end $$;
revoke all on function public.bank_exam_get(uuid,uuid),public.bank_exam_save(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.bank_exam_get(uuid,uuid),public.bank_exam_save(uuid,uuid,integer,jsonb) to authenticated;
revoke all on all functions in schema bank_ops from public,anon,authenticated;
grant execute on function bank_ops.group_id(uuid),bank_ops.manage_group(uuid,uuid),bank_ops.mock_read(uuid,uuid,uuid) to authenticated;
do $$declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname='bank_profile_get' loop execute 'revoke all on function '||r.signature||' from public,anon,authenticated';execute 'grant execute on function '||r.signature||' to authenticated';end loop;end $$;
do $$declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname='bank_profile_set' loop execute 'revoke all on function '||r.signature||' from public,anon,authenticated';execute 'grant execute on function '||r.signature||' to authenticated';end loop;end $$;
do $$declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname='bank_member_profile_set' loop execute 'revoke all on function '||r.signature||' from public,anon,authenticated';execute 'grant execute on function '||r.signature||' to authenticated';end loop;end $$;
do $$declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname='bank_groups_list' loop execute 'revoke all on function '||r.signature||' from public,anon,authenticated';execute 'grant execute on function '||r.signature||' to authenticated';end loop;end $$;
do $$declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname='bank_group_save' loop execute 'revoke all on function '||r.signature||' from public,anon,authenticated';execute 'grant execute on function '||r.signature||' to authenticated';end loop;end $$;
do $$declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname='bank_group_assign' loop execute 'revoke all on function '||r.signature||' from public,anon,authenticated';execute 'grant execute on function '||r.signature||' to authenticated';end loop;end $$;
do $$declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname='bank_group_delete' loop execute 'revoke all on function '||r.signature||' from public,anon,authenticated';execute 'grant execute on function '||r.signature||' to authenticated';end loop;end $$;
do $$declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname='bank_group_invite_create' loop execute 'revoke all on function '||r.signature||' from public,anon,authenticated';execute 'grant execute on function '||r.signature||' to authenticated';end loop;end $$;
do $$declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname='bank_mock_usage' loop execute 'revoke all on function '||r.signature||' from public,anon,authenticated';execute 'grant execute on function '||r.signature||' to authenticated';end loop;end $$;
do $$declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname='bank_mock_check' loop execute 'revoke all on function '||r.signature||' from public,anon,authenticated';execute 'grant execute on function '||r.signature||' to authenticated';end loop;end $$;
do $$declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname='bank_mock_candidates' loop execute 'revoke all on function '||r.signature||' from public,anon,authenticated';execute 'grant execute on function '||r.signature||' to authenticated';end loop;end $$;
do $$declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname='bank_mock_delete' loop execute 'revoke all on function '||r.signature||' from public,anon,authenticated';execute 'grant execute on function '||r.signature||' to authenticated';end loop;end $$;
do $$declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname='bank_mock_save' loop execute 'revoke all on function '||r.signature||' from public,anon,authenticated';execute 'grant execute on function '||r.signature||' to authenticated';end loop;end $$;
do $$declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname='bank_signup_request' loop execute 'revoke all on function '||r.signature||' from public,anon,authenticated';execute 'grant execute on function '||r.signature||' to authenticated';end loop;end $$;
do $$declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname='bank_mock_snapshot' loop execute 'revoke all on function '||r.signature||' from public,anon,authenticated';execute 'grant execute on function '||r.signature||' to authenticated';end loop;end $$;
do $$declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname='bank_mock_recommendation_snapshot' loop execute 'revoke all on function '||r.signature||' from public,anon,authenticated';execute 'grant execute on function '||r.signature||' to authenticated';end loop;end $$;
commit;
