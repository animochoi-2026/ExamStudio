-- Additive membership boundary. No document/file mutation and no public owner IDs.
begin;
set local lock_timeout='5s';
create schema bank_access;
revoke all on schema bank_access from public,anon,authenticated;
create table bank_access.install_backup(kind text primary key,value jsonb not null,created_at timestamptz not null default now());
alter table bank_access.install_backup enable row level security;
revoke all on bank_access.install_backup from public,anon,authenticated;
insert into bank_access.install_backup(kind,value) values
 ('members',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.bank_members m)),
 ('functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'sql',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('bank_member','bank_member_change_guard','bank_change_member_role','bank_set_role','bank_invite_decide'))),
 ('policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public' and tablename in ('bank_members','bank_audit')));
create table bank_access.owners(space_id uuid not null references public.bank_spaces(id),user_id uuid not null references auth.users(id),primary key(space_id,user_id));
alter table bank_access.owners enable row level security;
revoke all on bank_access.owners from public,anon,authenticated;
-- Deployment prerequisite: the verified existing two owners are the only seed.
do $$ begin
 if exists(select space_id from public.bank_members group by space_id having count(*) filter(where role='owner' and enabled and user_id is not null)<>2) then
  raise exception 'Two verified owner bindings are required before installing access controls';
 end if;
 if exists(select 1 from public.bank_members m left join auth.users u on u.id=m.user_id where m.role='owner' and (not m.enabled or u.email_confirmed_at is null or lower(u.email)<>m.email)) then raise exception 'Owner authentication binding is incomplete';end if;
end $$;
insert into bank_access.owners select space_id,user_id from public.bank_members where role='owner' and enabled;
alter table public.bank_members drop constraint bank_members_role_check;
alter table public.bank_members add constraint bank_members_role_check check(role in ('owner','admin','teacher')) not valid;
update public.bank_members set role='teacher' where role='reviewer';
alter table public.bank_members validate constraint bank_members_role_check;

create or replace function public.bank_member(s uuid,admin boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bank_members m join auth.users u on u.id=auth.uid()
 where m.space_id=s and m.enabled and m.email=lower(u.email) and u.email_confirmed_at is not null
 and (m.user_id=u.id or (m.user_id is null and m.role='teacher'))
 and (m.role<>'owner' or exists(select 1 from bank_access.owners o where o.space_id=s and o.user_id=u.id))
 and (not admin or (m.role='owner' and exists(select 1 from bank_access.owners o where o.space_id=s and o.user_id=u.id))));
$$;
create function bank_access.can_manage(s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.bank_member(s) and exists(select 1 from public.bank_members where space_id=s and user_id=auth.uid() and role in ('owner','admin'));
$$;
revoke all on function bank_access.can_manage(uuid) from public,anon,authenticated;

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
 elsif (new.role,new.enabled,new.user_id) is distinct from (old.role,old.enabled,old.user_id) then new.role_version=old.role_version+1;
 else new.role_version=old.role_version;end if;
 return new;
end $$;

create or replace function public.bank_change_member_role(s uuid,email_address text,new_role text,expected_version bigint,confirmation_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.bank_members;begin
 perform 1 from public.bank_spaces where id=s for update;
 if not public.bank_member(s,true) or new_role not in ('admin','teacher') or new_role is null then raise insufficient_privilege;end if;
 select * into target from public.bank_members where space_id=s and email=lower(trim(email_address)) for update;
 if not found or target.role='owner' or not target.enabled or target.user_id is null then raise insufficient_privilege;end if;
 if expected_version is distinct from target.role_version or lower(trim(confirmation_email)) is distinct from target.email then raise exception '회원 정보가 변경되었습니다. 다시 확인하세요.' using errcode='PT409';end if;
 update public.bank_members set role=new_role where space_id=s and email=target.email;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'member_role_change',jsonb_build_object('userId',target.user_id,'from',target.role,'to',new_role)::text);
 return jsonb_build_object('role',new_role,'roleVersion',target.role_version+case when target.role=new_role then 0 else 1 end);
end $$;
create or replace function public.bank_set_role(s uuid,email_address text,new_role text) returns void language plpgsql security definer set search_path='' as $$
begin raise exception '최신 회원 관리 화면에서 대상과 현재 권한을 확인하세요.' using errcode='42501';end $$;

create table bank_access.requests(space_id uuid not null references public.bank_spaces(id),user_id uuid not null references auth.users(id),status text not null default 'pending' check(status in ('pending','approved')),created_at timestamptz not null default now(),decided_at timestamptz,decided_by uuid,primary key(space_id,user_id));
alter table bank_access.requests enable row level security;
revoke all on bank_access.requests from public,anon,authenticated;
create function public.bank_signup_request(s uuid,submit boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare person auth.users; member public.bank_members; request bank_access.requests;begin
 select * into person from auth.users where id=auth.uid();
 if person.id is null or person.email_confirmed_at is null then raise insufficient_privilege;end if;
 perform 1 from public.bank_spaces where id=s for update;if not found then raise insufficient_privilege;end if;
 select * into member from public.bank_members where space_id=s and (user_id=person.id or email=lower(person.email));
 if found then
  if not member.enabled or (member.user_id is not null and member.user_id<>person.id) then return jsonb_build_object('status','blocked');end if;
  if public.bank_member(s) then return jsonb_build_object('status','approved');end if;
 end if;
 if submit then insert into bank_access.requests(space_id,user_id) values(s,person.id) on conflict do nothing;end if;
 select * into request from bank_access.requests where space_id=s and user_id=person.id;
 return jsonb_build_object('status',coalesce(request.status,'not_requested'));
end $$;
create function public.bank_signup_list(s uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not bank_access.can_manage(s) then raise insufficient_privilege;end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('kind','signup','userId',r.user_id,'email',u.email,'createdAt',r.created_at,'status',r.status) order by r.created_at,r.user_id),'[]')
 from bank_access.requests r join auth.users u on u.id=r.user_id where r.space_id=s and r.status='pending'
 and not exists(select 1 from public.bank_members m where m.space_id=s and (m.user_id=r.user_id or m.email=lower(u.email)))) ||
 (select coalesce(jsonb_agg(jsonb_build_object('kind','invite','id',i.id,'userId',i.claimed_by,'email',i.claimed_email,'createdAt',i.claimed_at,'status','pending') order by i.claimed_at,i.id),'[]') from public.bank_invitations i where i.space_id=s and i.status='requested' and i.expires_at>now()
 and not exists(select 1 from public.bank_members m where m.space_id=s and (m.user_id=i.claimed_by or m.email=i.claimed_email)));
end $$;
create function public.bank_signup_approve(s uuid,target_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare person auth.users; req bank_access.requests; member public.bank_members;begin
 perform 1 from public.bank_spaces where id=s for update;
 if not bank_access.can_manage(s) then raise insufficient_privilege;end if;
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
create function public.bank_members_manage(s uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not bank_access.can_manage(s) then raise insufficient_privilege;end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('email',email,'userId',user_id,'role',role,'enabled',enabled,'roleVersion',role_version) order by email),'[]')
 from public.bank_members where space_id=s and (public.bank_member(s,true) or role='teacher'));
end $$;
create function public.bank_member_revoke(s uuid,target_user uuid,expected_version bigint) returns void language plpgsql security definer set search_path='' as $$
declare member public.bank_members;begin
 perform 1 from public.bank_spaces where id=s for update;
 if not bank_access.can_manage(s) then raise insufficient_privilege;end if;
 select * into member from public.bank_members where space_id=s and user_id=target_user for update;
 if not found or member.role='owner' or (member.role<>'teacher' and not public.bank_member(s,true)) then raise insufficient_privilege;end if;
 if member.role_version is distinct from expected_version then raise exception '회원 정보가 변경되었습니다. 다시 확인하세요.' using errcode='PT409';end if;
 if not member.enabled then return;end if;
 update public.bank_members set enabled=false where space_id=s and user_id=target_user;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'member_revoke',target_user::text);
end $$;
create function public.bank_access_context(s uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return (select jsonb_build_object('role',role,'roleVersion',role_version,'userId',user_id) from public.bank_members where space_id=s and user_id=auth.uid());
end $$;
drop policy member_read on public.bank_members;
create policy member_read on public.bank_members for select to authenticated using(public.bank_member(space_id) and (public.bank_member(space_id,true) or user_id=auth.uid()));
drop policy member_read on public.bank_audit;
create policy member_read on public.bank_audit for select to authenticated using(public.bank_member(space_id,true));
revoke all on function public.bank_signup_request(uuid,boolean),public.bank_signup_list(uuid),public.bank_signup_approve(uuid,uuid),public.bank_members_manage(uuid),public.bank_member_revoke(uuid,uuid,bigint),public.bank_access_context(uuid) from public,anon,authenticated;
grant execute on function public.bank_signup_request(uuid,boolean),public.bank_signup_list(uuid),public.bank_signup_approve(uuid,uuid),public.bank_members_manage(uuid),public.bank_member_revoke(uuid,uuid,bigint),public.bank_access_context(uuid) to authenticated;
create function public.bank_search_page(s uuid,filters jsonb default '{}',start_at integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if start_at<0 or start_at>100000 then raise exception '페이지를 확인하세요.';end if;
 return (with current_rows as materialized(select c.*,r.visibility,q.owner_email,bank_summary.row_difficulty(c.revision_id,c.metadata,c.confirmed) d from bank_query.latest(s) c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id),
 filtered as materialized(select c from current_rows c where
 (coalesce(filters->>'compositionBand','')='' or (filters->>'compositionBand'='killer' and (d->>'score')::numeric>=9) or (filters->>'compositionBand'<>'killer' and d->>'band'=filters->>'compositionBand'))
 and(coalesce(filters->>'text','')='' or (metadata::text||content::text||confirmed::text) ilike '%'||(filters->>'text')||'%')
 and(coalesce(filters->>'school','')='' or metadata#>>'{source,school}'=filters->>'school')
 and(coalesce(filters->>'academicYear','')='' or metadata#>>'{source,academicYear}'=filters->>'academicYear')
 and(coalesce(filters->>'grade','')='' or metadata#>>'{source,grade}'=filters->>'grade')
 and(coalesce(filters->>'semester','')='' or metadata#>>'{source,semester}'=filters->>'semester')
 and(coalesce(filters->>'unit','')='' or exists(select 1 from bank_query.units u where u.id=bank_query.unit_id(metadata,confirmed) and (u.title=filters->>'unit' or u.id=filters->>'unit')))
 and public.bank_type_matches(metadata,confirmed,filters->>'type')
 and(coalesce(filters->>'owner','')='' or owner_email=filters->>'owner')
 and(coalesce(filters->>'status','')='' or visibility=filters->>'status')),
 page_rows as(select c from filtered order by (c).created_at desc,(c).revision_id desc limit 50 offset start_at)
 select jsonb_build_object('total',(select count(*) from filtered),'items',(select coalesce(jsonb_agg(bank_query.compact(b) order by (p.c).created_at desc,(p.c).revision_id desc),'[]') from page_rows p join public.bank_catalog b on b.revision_id=(p.c).revision_id)));
end $$;
create function public.bank_search_options(s uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return (with c as materialized(select metadata,confirmed from bank_query.latest(s)),facets as(
 select 'school' k,metadata#>>'{source,school}' v from c union all select 'grade',metadata#>>'{source,grade}' from c
 union all select 'academicYear',metadata#>>'{source,academicYear}' from c union all select 'semester',metadata#>>'{source,semester}' from c
 union all select 'unit',u.title from c join bank_query.units u on u.id=bank_query.unit_id(c.metadata,c.confirmed)
 union all select 'type',coalesce(t->>'name',t#>>'{}') from c cross join lateral jsonb_array_elements(bank_query.types(metadata,confirmed)) t),groups as(select k,jsonb_agg(distinct v order by v) v from facets where nullif(v,'') is not null group by k)
 select coalesce(jsonb_object_agg(k,v),'{}') from groups);
end $$;
create function public.bank_public_summary(s uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb;d jsonb;begin
 if not exists(select 1 from bank_summary.state where ready and version='stored-web-v1') then raise sqlstate '55000' using message='현황 집계 준비 중입니다.';end if;
 -- Shared audience only: never impersonate a member or include private rows.
 select value into v from bank_summary.home where space_id=s and audience='00000000-0000-0000-0000-000000000000'::uuid;
 if v is null then raise sqlstate '55000' using message='현황을 불러올 수 없습니다.';end if;
 d:=v->'dashboard';
 return jsonb_build_object('dashboard',jsonb_build_object('questions',d->'questions','sourceExams',d->'sourceExams','schools',d->'schools','pending',d->'pending',
 'difficulty',jsonb_build_object('total',d#>'{difficulty,total}','counts',jsonb_build_object('low',d#>'{difficulty,counts,low}','middle',d#>'{difficulty,counts,middle}','high',d#>'{difficulty,counts,high}','unknown',d#>'{difficulty,counts,unknown}'),'killerCount',d#>'{difficulty,killerCount}')),
 'recentSources',(select coalesce(jsonb_agg(jsonb_build_object('school',x#>>'{source,school}','academicYear',x#>>'{source,academicYear}','grade',x#>>'{source,grade}','semester',x#>>'{source,semester}','exam',x#>>'{source,exam}','registered',x->'question_count','reviewed',x->'reviewed_count','updatedAt',x->'updated_at') order by ord),'[]') from jsonb_array_elements(v->'recentSources') with ordinality t(x,ord)), 'asOf',now());
end $$;
revoke all on function public.bank_search_page(uuid,jsonb,integer),public.bank_search_options(uuid),public.bank_public_summary(uuid) from public,anon,authenticated;
grant execute on function public.bank_search_page(uuid,jsonb,integer),public.bank_search_options(uuid) to authenticated;
grant execute on function public.bank_public_summary(uuid) to anon,authenticated;
create or replace function public.bank_invite_decide(invite_id uuid,approve boolean) returns void language plpgsql security definer set search_path='' as $$
declare invitation public.bank_invitations;person auth.users;existing public.bank_members;begin
 select * into invitation from public.bank_invitations where id=invite_id for update;
 if not found or not bank_access.can_manage(invitation.space_id) or (not approve and not public.bank_member(invitation.space_id,true)) then raise insufficient_privilege;end if;
 if invitation.status<>'requested' or invitation.expires_at<=now() then raise exception '처리할 승인 신청이 없습니다.' using errcode='PT409';end if;
 if approve then
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
commit;
