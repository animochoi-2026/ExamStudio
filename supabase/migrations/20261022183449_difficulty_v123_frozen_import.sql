
create table bank_v123.allowed(batch_id uuid not null references bank_v123.batches(id),question_id uuid not null,revision_id uuid not null,
 result_hash text not null,metadata_hash text not null,confirmed_hash text not null,review_version integer not null,
 primary key(batch_id,question_id),unique(batch_id,revision_id));
alter table bank_v123.allowed enable row level security;
revoke all on bank_v123.allowed from public,anon,authenticated;
grant all on bank_v123.allowed to service_role;
create function public.bank_v123_frozen_import(s uuid,b uuid,items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job bank_v123.batches;a bank_v123.allowed;x jsonb;n int:=0;
begin
 if auth.uid() is null or not public.bank_member(s,true) then raise insufficient_privilege;end if;
 select * into strict job from bank_v123.batches where id=b for share;
 if job.space_id<>s or job.status<>'staging' or job.snapshot_at is not null
 or jsonb_typeof(items)<>'array' or jsonb_array_length(items)>10 then raise exception 'Frozen import scope mismatch';end if;
 for x in select value from jsonb_array_elements(items) loop
 select * into strict a from bank_v123.allowed where batch_id=b and question_id=(x->>'question_id')::uuid;
 if a.revision_id<>(x->>'revision_id')::uuid or a.review_version<>(x->>'review_version')::integer
 or a.result_hash is distinct from bank_v121.hash(x->'result')
 or a.metadata_hash is distinct from bank_v121.hash(x->'expected_metadata')
 or a.confirmed_hash is distinct from bank_v121.hash(x->'expected_confirmed') then raise exception 'Frozen payload hash mismatch';end if;
 if exists(select 1 from bank_v123.items where batch_id=b and question_id=a.question_id) then
  if not exists(select 1 from bank_v123.items i where i.batch_id=b and i.question_id=a.question_id and i.result_hash=a.result_hash) then raise exception 'Existing import conflict';end if;
 else
 insert into bank_v123.items(batch_id,question_id,revision_id,review_version,expected_metadata,expected_confirmed,result,result_hash)
 values(b,a.question_id,a.revision_id,a.review_version,x->'expected_metadata',x->'expected_confirmed',x->'result',a.result_hash);
 end if;n:=n+1;
 end loop;
 return jsonb_build_object('staged',n,'live_scores_changed',false);
end $$;
revoke all on function public.bank_v123_frozen_import(uuid,uuid,jsonb) from public,anon;
grant execute on function public.bank_v123_frozen_import(uuid,uuid,jsonb) to authenticated;
