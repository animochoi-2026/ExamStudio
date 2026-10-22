-- Preserve latest-visible-revision, grade, original-source and pagination semantics.
-- Membership is constant for a request; never repeat it for every candidate row.
create or replace function public.bank_source_questions(s uuid,source_key text,start_at integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();
begin
 if caller is null or not public.bank_member(s) then raise insufficient_privilege;end if;
 return (with latest_ids as materialized (
  -- Sort narrow IDs, not full metadata (including stored evaluation records).
  -- For committed, unarchived rows these are bank_read_revision's remaining checks.
  select distinct on(c.question_id) c.revision_id,c.question_id,c.created_at
  from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id
  join public.bank_questions q on q.id=c.question_id
  where c.space_id=s and q.space_id=s and r.committed and not q.archived
   and (r.actor_id=caller or r.visibility in ('shared_pending','approved'))
  order by c.question_id,c.created_at desc,c.revision_id desc
 ), selected_page as materialized (
  select c.revision_id,c.question_id,c.metadata,c.confirmed,c.created_at,c.content,c.files,r.visibility,q.owner_email,src.source_id
  from latest_ids l join public.bank_catalog c on c.revision_id=l.revision_id
  join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id
  join public.bank_entries e on e.id=c.commit_id
  cross join lateral (select coalesce(nullif(c.metadata#>>'{source,documentId}',''),e.props->>'sourceId',
   (select f->>'sourceId' from jsonb_array_elements(c.files) f where f->>'role'='source' limit 1)) source_id) src
  -- Filter AFTER selecting the latest visible version: an old source or grade must not resurface.
  where bank_grade.matches(c.metadata#>>'{source,grade}') and src.source_id=source_key
   and nullif(c.metadata#>>'{relations,originalQuestionId}','') is null
  order by coalesce(substring(c.metadata#>>'{source,position,page}' from '[0-9]{1,6}')::integer,0),
   regexp_replace(coalesce(c.metadata#>>'{source,originalNumber}',''),'[0-9].*$',''),
   coalesce(substring(c.metadata#>>'{source,originalNumber}' from '[0-9]{1,6}')::integer,1000000),
   c.metadata#>>'{source,originalNumber}',c.question_id
  limit 50 offset greatest(0,start_at)
 ) select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
  select revision_id,question_id,metadata,confirmed,created_at,
   jsonb_build_object('body',left(content->>'body',350)) content,
   (select coalesce(jsonb_agg(f),'[]'::jsonb) from jsonb_array_elements(files) f where f->>'role'='preview') files,
   visibility,owner_email,source_id from selected_page
 ) t);
end $$;
