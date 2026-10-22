create or replace function bank_v123.rollback(b uuid) returns jsonb language plpgsql set search_path='' as $$
declare job bank_v123.batches;n int;
begin
 select * into strict job from bank_v123.batches where id=b for update;
 if job.status<>'activated' then raise exception 'Activated batch required';end if;
 lock table public.bank_questions,public.bank_revisions,public.bank_catalog,public.bank_difficulty_ratings in share row exclusive mode;
 if job.ratings_snapshot is distinct from (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.bank_difficulty_ratings t)
 then raise exception 'Post-activation teacher ratings preserved';end if;
 if exists(select 1 from bank_v123.items i left join public.bank_catalog c on c.revision_id=i.revision_id left join public.bank_revisions r on r.id=i.revision_id where i.batch_id=b and
 (c.revision_id is null or r.review_version<>i.review_version or c.metadata is distinct from i.activated_metadata or c.confirmed is distinct from i.snapshot->'confirmed'
 or c.content is distinct from i.snapshot->'content' or c.files is distinct from i.snapshot->'files'
 or exists(select 1 from public.bank_revisions ch where ch.parent_id=r.id and ch.committed)))
 then raise exception 'Post-activation changes preserved; manual reconciliation required';end if;
 set constraints all deferred;
 update public.bank_catalog c set metadata=i.snapshot->'metadata',confirmed=i.snapshot->'confirmed' from bank_v123.items i where i.batch_id=b and i.revision_id=c.revision_id;
 get diagnostics n=row_count;if n<>1266 then raise exception 'Rollback count mismatch';end if;
 update bank_v123.policy set enabled=(job.previous_policy->>'enabled')::boolean where id;
 update bank_v123.batches set status='rolled_back' where id=b;
 set constraints all immediate;
 return jsonb_build_object('status','rolled_back','count',n,'batch_id',b);
end $$;
