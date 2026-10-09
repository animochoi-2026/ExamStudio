create table public.bank_scope_evidence(
 revision_id uuid primary key references public.bank_revisions, evidence jsonb not null,
 reviewer_id uuid not null, updated_at timestamptz not null default now()
);
alter table public.bank_scope_evidence enable row level security;
create policy read_scope_evidence on public.bank_scope_evidence for select to authenticated using(public.bank_read_revision(revision_id));
revoke all on public.bank_scope_evidence from public,anon,authenticated;
grant select on public.bank_scope_evidence to authenticated;
create function public.bank_scope_confirm(r uuid,e jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare s uuid;begin
 select space_id into s from public.bank_catalog where revision_id=r;
 if not public.bank_reviewer(s) or not public.bank_read_revision(r) then raise insufficient_privilege;end if;
 if e->>'taxonomyVersion' is distinct from 'middle-school-2022-v1' or jsonb_typeof(e->'conditionUnitIds') is distinct from 'array' or jsonb_typeof(e->'solutions') is distinct from 'array' or jsonb_array_length(e->'solutions')=0 or length(e::text)>50000 then raise exception '확인한 조건·풀이 개념을 입력하세요';end if;
 insert into public.bank_scope_evidence values(r,e,auth.uid(),now()) on conflict(revision_id) do update set evidence=excluded.evidence,reviewer_id=excluded.reviewer_id,updated_at=now();
 update public.bank_catalog set confirmed=confirmed||jsonb_build_object('scopeEvidence',e||jsonb_build_object('status','confirmed')) where revision_id=r;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'scope_confirm',jsonb_build_object('revision',r,'evidence',e)::text);
end $$;
revoke execute on function public.bank_scope_confirm(uuid,jsonb) from public,anon;
grant execute on function public.bank_scope_confirm(uuid,jsonb) to authenticated;
