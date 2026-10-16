-- Private, expiring coordination only. Existing file access/immutable guards remain intact.
create table bank_storage_private.source_upload_claims (
 entry_id uuid primary key references public.bank_entries(id) on delete cascade,
 actor_id uuid not null,
 token uuid not null,
 expires_at timestamptz not null
);
alter table bank_storage_private.source_upload_claims enable row level security;
revoke all on bank_storage_private.source_upload_claims from public,anon,authenticated;

create function public.bank_source_upload_claim(entry_id uuid,expected_sha text,claim_token uuid,action text default 'claim')
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.bank_entries; lease bank_storage_private.source_upload_claims; t timestamptz:=clock_timestamp();
begin
 if auth.uid() is null or claim_token is null or action not in ('claim','renew','release') then raise insufficient_privilege; end if;
 select * into e from public.bank_entries where id=entry_id for update;
 if e.id is null or e.props->>'role' is distinct from 'source' or not public.bank_member(e.space_id) or not public.bank_read_entry(e.id) then raise insufficient_privilege; end if;
 if e.sha256 is distinct from expected_sha then raise exception 'SOURCE_HASH_CONFLICT' using errcode='22000'; end if;
 if e.verified then
  delete from bank_storage_private.source_upload_claims c where c.entry_id=e.id;
  return jsonb_build_object('state','verified','entry',to_jsonb(e));
 end if;
 if e.owner_id is distinct from auth.uid() then raise insufficient_privilege; end if;
 select * into lease from bank_storage_private.source_upload_claims c where c.entry_id=e.id;
 if action='release' then
  delete from bank_storage_private.source_upload_claims c where c.entry_id=e.id and c.actor_id=auth.uid() and c.token=claim_token;
  return jsonb_build_object('state','released','entry',to_jsonb(e));
 end if;
 if lease.entry_id is null and action='claim' or lease.expires_at<=t and action='claim' or lease.actor_id=auth.uid() and lease.token=claim_token then
  insert into bank_storage_private.source_upload_claims values(e.id,auth.uid(),claim_token,t+interval '5 minutes')
  on conflict on constraint source_upload_claims_pkey do update set actor_id=excluded.actor_id,token=excluded.token,expires_at=excluded.expires_at;
  return jsonb_build_object('state','claimed','entry',to_jsonb(e),'expiresAt',t+interval '5 minutes');
 end if;
 return jsonb_build_object('state','waiting','entry',to_jsonb(e),'expiresAt',lease.expires_at);
end $$;
revoke all on function public.bank_source_upload_claim(uuid,text,uuid,text) from public,anon;
grant execute on function public.bank_source_upload_claim(uuid,text,uuid,text) to authenticated;
