-- Owner-only, on-demand capacity snapshot. This does not alter bank data.
-- Database bytes follow Supabase's documented pg_database_size sum. Storage
-- bytes are object metadata, not billing egress or the Postgres disk/WAL size.
create function public.bank_project_usage(s uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  db_bytes bigint;
  object_bytes bigint;
  bank_bytes bigint;
  object_count bigint;
  unknown_size_count bigint;
begin
  if not public.bank_member(s, true) then
    raise insufficient_privilege;
  end if;

  select coalesce(sum(pg_catalog.pg_database_size(d.datname)), 0)::bigint
    into db_bytes from pg_catalog.pg_database d;

  select count(*),
         coalesce(sum(case when o.metadata->>'size' ~ '^[0-9]+$'
                           then (o.metadata->>'size')::bigint else 0 end), 0)::bigint,
         count(*) filter (where o.metadata->>'size' is null
                           or o.metadata->>'size' !~ '^[0-9]+$'),
         coalesce(sum(case when o.bucket_id = 'question-bank'
                            and o.metadata->>'size' ~ '^[0-9]+$'
                           then (o.metadata->>'size')::bigint else 0 end), 0)::bigint
    into object_count, object_bytes, unknown_size_count, bank_bytes
    from storage.objects o;

  return jsonb_build_object(
    'measuredAt', pg_catalog.clock_timestamp(),
    'databaseBytes', db_bytes,
    'storageBytes', object_bytes,
    'storageObjects', object_count,
    'storageUnknownSizeObjects', unknown_size_count,
    'bankStorageBytes', bank_bytes,
    'questions', (select count(*) from public.bank_questions where space_id = s),
    'committedVersions', (select count(*) from public.bank_revisions r
                           join public.bank_questions q on q.id = r.question_id
                           where q.space_id = s and r.committed)
  );
end $$;

revoke execute on function public.bank_project_usage(uuid) from public, anon, authenticated;
grant execute on function public.bank_project_usage(uuid) to authenticated;
