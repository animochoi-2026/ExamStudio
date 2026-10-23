-- Reviewable additive server change. No deployment or activation is performed here.
create schema if not exists bank_uploader;
revoke all on schema bank_uploader from public,anon,authenticated;
create table bank_uploader.policy(id boolean primary key default true check(id),enabled boolean not null default false,manifests jsonb not null);
create table bank_uploader.receipts(revision_id uuid primary key,actor_id uuid not null,space_id uuid not null,question_id uuid not null,content jsonb not null,metadata jsonb not null,files jsonb not null,manifest text not null,evaluation_key text not null,created_at timestamptz not null default now());
alter table bank_uploader.policy enable row level security;
alter table bank_uploader.receipts enable row level security;
revoke all on all tables in schema bank_uploader from public,anon,authenticated;
grant usage on schema bank_uploader to service_role;
grant all on all tables in schema bank_uploader to service_role;
-- The build fills the explicit supported manifests; activation remains false.
insert into bank_uploader.policy(id,manifests) values(true,'["815d40808cb77f47220f474526ed9585c53927409ca9b9625f54e8ffb7d86b89","684d0ed4f5b282b46322e493e766dbef169279e61746b9e4f976acf93350177a"]'::jsonb);
create function public.bank_uploader_capabilities(s uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.bank_member(s) then raise insufficient_privilege;end if;
 return (select jsonb_build_object('enabled',enabled,'manifests',manifests) from bank_uploader.policy where id);
end $$;
revoke all on function public.bank_uploader_capabilities(uuid) from public,anon;
grant execute on function public.bank_uploader_capabilities(uuid) to authenticated;
-- Only bank-verify's service identity may attest a deterministically replayed result.
create function public.bank_uploader_receipt(r uuid,actor uuid,s uuid,q uuid,c jsonb,m jsonb,f jsonb,manifest text,evaluation_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare revision public.bank_revisions;
begin
 if not exists(select 1 from bank_uploader.policy p where p.id and p.enabled and p.manifests ? manifest) then raise exception 'uploader_server_not_enabled';end if;
 select * into revision from public.bank_revisions where id=r;
 if revision.id is null or revision.actor_id is distinct from actor or revision.question_id is distinct from q or revision.parent_id is not null
 or not exists(select 1 from public.bank_questions b where b.id=q and b.space_id=s) then raise insufficient_privilege;end if;
 if m#>>'{difficulty,v123Active,question_revision_id}' is distinct from r::text or m#>>'{difficulty,v123Active,common_evaluation_manifest_hash}' is distinct from manifest then raise exception 'uploader_receipt_binding';end if;
 insert into bank_uploader.receipts(revision_id,actor_id,space_id,question_id,content,metadata,files,manifest,evaluation_key) values(r,actor,s,q,c,m,f,manifest,evaluation_key) on conflict(revision_id) do nothing;
 if not exists(select 1 from bank_uploader.receipts p where p.revision_id=r and p.actor_id=actor and p.space_id=s and p.question_id=q and p.content=c and p.metadata=m and p.files=f and p.manifest=bank_uploader_receipt.manifest and p.evaluation_key=bank_uploader_receipt.evaluation_key) then raise exception 'uploader_receipt_conflict';end if;
 return true;
end $$;
revoke all on function public.bank_uploader_receipt(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.bank_uploader_receipt(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,text,text) to service_role;
-- Add one exact-match INSERT authorization. Every existing UPDATE/legacy guard stays intact.
do $install$
declare definition text;anchor text:=' -- The private frozen snapshot authorizes only the exact swap/restore.';
begin
 definition:=pg_get_functiondef('bank_v121.guard_current_policy()'::regprocedure);
 if position(anchor in definition)=0 or position('bank_uploader.receipts' in definition)>0 then raise exception 'Unexpected canonical policy function; inspect before applying';end if;
 definition:=replace(definition,anchor,$branch$
 if tg_op='INSERT' and exists(select 1 from bank_uploader.receipts p
 where p.revision_id=new.revision_id and p.space_id=new.space_id and p.question_id=new.question_id
 and p.content=new.content and p.metadata=new.metadata and p.files=new.files
 and exists(select 1 from bank_uploader.policy policy where policy.id and policy.enabled and policy.manifests ? p.manifest)
 and exists(select 1 from public.bank_revisions r where r.id=p.revision_id and r.actor_id=p.actor_id and r.parent_id is null)) then return new;end if;
$branch$||anchor);
 execute definition;
end $install$;
