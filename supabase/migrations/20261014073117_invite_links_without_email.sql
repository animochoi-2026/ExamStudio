begin;
-- Keep the existing one-person link, approval, expiration and group permissions.
-- Only remove the requirement to know the recipient's email before sharing.
create or replace function public.bank_group_invite_create(s uuid,g uuid,token_digest text,email_address text,note_text text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;address text:=nullif(lower(btrim(coalesce(email_address,''))),'');begin
 perform 1 from public.bank_spaces where id=s for update;
 if not bank_ops.manage_group(s,g) or (g is not null and not exists(select 1 from public.bank_groups where id=g and space_id=s)) then raise insufficient_privilege;end if;
 if address is not null then
  if exists(select 1 from public.bank_members where space_id=s and email=address) then raise exception '이미 등록된 이메일입니다. 회원 관리에서 확인하세요.' using errcode='PT409';end if;
  if exists(select 1 from public.bank_invitations where space_id=s and invited_email=address and status in ('active','requested') and expires_at>now()) then raise exception '유효한 초대가 이미 있습니다. 기존 초대를 취소하거나 재발급하세요.' using errcode='PT409';end if;
 end if;
 result=bank_ops.invite_create(s,token_digest,address,note_text);
 update public.bank_invitations set group_id=g where id=result;return result;
end $$;
revoke all on function public.bank_group_invite_create(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.bank_group_invite_create(uuid,uuid,text,text,text) to authenticated;
commit;
