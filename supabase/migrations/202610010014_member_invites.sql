-- Additive invitation flow. The link contains a 256-bit random token; only its
-- SHA-256 digest is stored here. Existing members, questions and RLS stay intact.
alter table public.bank_members add column if not exists display_name text;
alter table public.bank_members add column if not exists joined_at timestamptz;

create table public.bank_invitations (
 id uuid primary key default gen_random_uuid(),
 space_id uuid not null references public.bank_spaces(id),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 invited_email text check(invited_email is null or invited_email=lower(invited_email)),
 note text check(length(note)<=200),
 status text not null default 'active' check(status in ('active','requested','accepted','cancelled')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '7 days'),
 claimed_by uuid references auth.users(id),
 claimed_email text,
 claimed_at timestamptz,
 accepted_at timestamptz,
 cancelled_at timestamptz,
 email_attempts integer not null default 0,
 last_email_at timestamptz,
 last_email_state text not null default 'not_sent' check(last_email_state in ('not_sent','sending','provider_accepted','failed'))
);
create index bank_invitations_space_date on public.bank_invitations(space_id,created_at desc);
create table public.bank_invite_attempts(
 user_id uuid primary key references auth.users(id),
 window_start timestamptz not null,
 attempts integer not null default 0
);
alter table public.bank_invitations enable row level security;
alter table public.bank_invite_attempts enable row level security;
revoke all on public.bank_invitations,public.bank_invite_attempts from public,anon,authenticated;
grant select on public.bank_invitations to authenticated;
create policy owner_read_invites on public.bank_invitations for select to authenticated
 using(public.bank_member(space_id,true));

create function public.bank_invite_create(s uuid,token_digest text,email_address text default null,note_text text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; normalized text;begin
 if not public.bank_member(s,true) then raise insufficient_privilege;end if;
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

create function public.bank_invite_accept(token_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
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
 values(invitation.space_id,lower(person.email),auth.uid(),'teacher',true,nullif(invitation.note,''),now());
 update public.bank_invitations set status='accepted',claimed_by=auth.uid(),claimed_email=lower(person.email),claimed_at=now(),accepted_at=now() where id=invitation.id;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(invitation.space_id,auth.uid(),person.email,'invite_accept',invitation.id::text);
 return jsonb_build_object('status','joined','role','teacher');
end $$;

create function public.bank_invite_decide(invite_id uuid,approve boolean) returns void language plpgsql security definer set search_path='' as $$
declare invitation public.bank_invitations;person auth.users;existing public.bank_members;begin
 select * into invitation from public.bank_invitations where id=invite_id for update;
 if not found or not public.bank_member(invitation.space_id,true) then raise insufficient_privilege;end if;
 if invitation.status<>'requested' or invitation.expires_at<=now() then raise exception '처리할 승인 신청이 없습니다.' using errcode='PT409';end if;
 if approve then
  select * into person from auth.users where id=invitation.claimed_by;
  if person.email_confirmed_at is null or lower(person.email)<>invitation.claimed_email then raise exception '신청 계정을 다시 확인하세요.' using errcode='PT409';end if;
  select * into existing from public.bank_members where space_id=invitation.space_id and email=invitation.claimed_email for update;
  if found and (not existing.enabled or existing.user_id is distinct from invitation.claimed_by) then raise exception '차단되었거나 다른 계정에 묶인 회원입니다.' using errcode='42501';end if;
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

create function public.bank_invite_cancel(invite_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare invitation public.bank_invitations;begin
 select * into invitation from public.bank_invitations where id=invite_id for update;
 if not found or not public.bank_member(invitation.space_id,true) then raise insufficient_privilege;end if;
 if invitation.status='accepted' then raise exception '이미 참여한 회원은 회원 관리에서 이용을 중지하세요.';end if;
 if invitation.status='cancelled' then return;end if;
 update public.bank_invitations set status='cancelled',cancelled_at=now() where id=invite_id;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(invitation.space_id,auth.uid(),(select email from auth.users where id=auth.uid()),'invite_cancel',invite_id::text);
end $$;

create function public.bank_invite_reissue(invite_id uuid,token_digest text) returns uuid language plpgsql security definer set search_path='' as $$
declare invitation public.bank_invitations;result uuid;begin
 select * into invitation from public.bank_invitations where id=invite_id for update;
 if not found or not public.bank_member(invitation.space_id,true) then raise insufficient_privilege;end if;
 if invitation.status='accepted' then raise exception '이미 참여한 회원은 새 링크가 필요하지 않습니다.';end if;
 if token_digest is null or token_digest !~ '^[a-f0-9]{64}$' then raise exception '초대 토큰 형식 오류';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(invitation.space_id::text||auth.uid()::text,0));
 if (select count(*) from public.bank_invitations where space_id=invitation.space_id and created_by=auth.uid() and created_at>now()-interval '1 day')>=20 then raise exception '하루 초대 생성 한도(20건)를 넘었습니다.' using errcode='PT429';end if;
 update public.bank_invitations set status='cancelled',cancelled_at=now() where id=invite_id and status<>'cancelled';
 insert into public.bank_invitations(space_id,token_hash,invited_email,note,created_by)
 values(invitation.space_id,token_digest,invitation.invited_email,invitation.note,auth.uid()) returning id into result;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(invitation.space_id,auth.uid(),(select email from auth.users where id=auth.uid()),'invite_reissue',invite_id::text||' -> '||result::text);
 return result;
end $$;

create function public.bank_invite_mail_claim(invite_id uuid,token_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare invitation public.bank_invitations;begin
 select * into invitation from public.bank_invitations where id=invite_id for update;
 if not found or not public.bank_member(invitation.space_id,true) then raise insufficient_privilege;end if;
 if invitation.token_hash<>token_digest or invitation.status<>'active' or invitation.expires_at<=now() or invitation.invited_email is null then raise exception '발송할 유효한 이메일 초대가 없습니다.' using errcode='PT409';end if;
 if invitation.email_attempts>=3 or invitation.last_email_at>now()-interval '1 minute' then raise exception '메일 발송 횟수 제한입니다. 잠시 후 재발급을 검토하세요.' using errcode='PT429';end if;
 update public.bank_invitations set email_attempts=email_attempts+1,last_email_at=now(),last_email_state='sending' where id=invite_id;
 return jsonb_build_object('email',invitation.invited_email,'expiresAt',invitation.expires_at);
end $$;
create function public.bank_invite_mail_check(invite_id uuid,token_digest text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare invitation public.bank_invitations;begin
 select * into invitation from public.bank_invitations where id=invite_id;
 if not found or not public.bank_member(invitation.space_id,true) then raise insufficient_privilege;end if;
 if invitation.token_hash<>token_digest or invitation.status<>'active' or invitation.expires_at<=now() or invitation.invited_email is null then raise exception '발송할 유효한 이메일 초대가 없습니다.' using errcode='PT409';end if;
 return jsonb_build_object('email',invitation.invited_email,'expiresAt',invitation.expires_at);
end $$;
create function public.bank_invite_mail_result(invite_id uuid,sent boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.bank_invitations set last_email_state=case when sent then 'provider_accepted' else 'failed' end where id=invite_id and last_email_state='sending';
end $$;

revoke execute on function public.bank_invite_create(uuid,text,text,text),public.bank_invite_accept(text),public.bank_invite_decide(uuid,boolean),public.bank_invite_cancel(uuid),public.bank_invite_reissue(uuid,text),public.bank_invite_mail_claim(uuid,text),public.bank_invite_mail_check(uuid,text),public.bank_invite_mail_result(uuid,boolean) from public,anon,authenticated;
grant execute on function public.bank_invite_create(uuid,text,text,text),public.bank_invite_accept(text),public.bank_invite_decide(uuid,boolean),public.bank_invite_cancel(uuid),public.bank_invite_reissue(uuid,text),public.bank_invite_mail_claim(uuid,text),public.bank_invite_mail_check(uuid,text) to authenticated;
grant execute on function public.bank_invite_mail_result(uuid,boolean) to service_role;
