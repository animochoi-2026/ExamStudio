-- Keep bank_search as the version-aware export API. UI queries use current revisions.
create function public.bank_search_current(s uuid,filters jsonb default '{}',start_at integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return (with latest as (
 select distinct on(c.question_id) c.*,r.visibility,r.review_version,q.owner_email,
 coalesce(nullif(c.confirmed->>'difficulty',''),nullif(c.metadata#>>'{difficulty,userScore}',''),nullif(c.metadata#>>'{difficulty,aiScore}',''))::numeric score
 from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id
 where c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id)
 order by c.question_id,c.created_at desc,c.revision_id desc
 ), filtered as (
 select revision_id,question_id,space_id,commit_id,metadata,confirmed,created_at,visibility,review_version,owner_email,
 jsonb_build_object('body',left(content->>'body',350)) content,
 (select coalesce(jsonb_agg(f),'[]') from jsonb_array_elements(files) f where f->>'role'='preview') files
 from latest c where
 (coalesce(filters->>'text','')='' or (metadata::text||content::text||confirmed::text) ilike '%'||(filters->>'text')||'%')
 and(coalesce(filters->>'school','')='' or metadata#>>'{source,school}'=filters->>'school')
 and(coalesce(filters->>'academicYear','')='' or metadata#>>'{source,academicYear}'=filters->>'academicYear')
 and(coalesce(filters->>'grade','')='' or metadata#>>'{source,grade}'=filters->>'grade')
 and(coalesce(filters->>'semester','')='' or metadata#>>'{source,semester}'=filters->>'semester')
 and(coalesce(filters->>'unit','')='' or coalesce(nullif(confirmed->>'primaryUnit',''),metadata#>>'{classification,primaryUnit,name}')=filters->>'unit')
 and(coalesce(filters->>'type','')='' or confirmed->>'type'=filters->>'type')
 and(coalesce(filters->>'owner','')='' or owner_email=filters->>'owner')
 and(coalesce(filters->>'status','')='' or visibility=filters->>'status')
 and(not(filters?'min') or score>=(filters->>'min')::numeric)
 and(not(filters?'max') or score<=(filters->>'max')::numeric)
 order by created_at desc,revision_id desc limit 50 offset greatest(0,start_at)
 ) select coalesce(jsonb_agg(to_jsonb(filtered)),'[]') from filtered);
end $$;
revoke execute on function public.bank_search_current(uuid,jsonb,integer) from public,anon;
grant execute on function public.bank_search_current(uuid,jsonb,integer) to authenticated;
