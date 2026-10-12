-- School selection needs only source identity and scope evidence. Do not load
-- question bodies, assets, difficulty histories or the question-set registry.
create function public.bank_exam_school_index(s uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if public.bank_member(s) is not true then raise insufficient_privilege;end if;
 return (with latest as materialized(select * from bank_query.latest(s)),
 indexed as (
  select c.question_id,
   coalesce(nullif(c.metadata#>>'{source,documentId}',''),e.props->>'sourceId',
    (select f->>'sourceId' from jsonb_array_elements(c.files) f where f->>'role'='source' limit 1)) source_id,
   jsonb_build_object('source',jsonb_build_object('grade',c.metadata#>'{source,grade}'),
    'classification',jsonb_build_object('primaryUnit',c.metadata#>'{classification,primaryUnit}',
     'confirmed',jsonb_build_object('primaryUnit',c.metadata#>'{classification,confirmed,primaryUnit}'),
     'suggested',jsonb_build_object('primaryUnit',c.metadata#>'{classification,suggested,primaryUnit}'))) metadata,
   jsonb_build_object('primaryUnit',c.confirmed->'primaryUnit','scopeEvidence',c.confirmed->'scopeEvidence') confirmed
  from latest c join public.bank_entries e on e.id=c.commit_id
  where nullif(c.metadata#>>'{relations,originalQuestionId}','') is null
 ) select coalesce(jsonb_agg(to_jsonb(i) order by i.question_id),'[]'::jsonb)
 from indexed i where nullif(i.source_id,'') is not null);
end $$;
revoke all on function public.bank_exam_school_index(uuid) from public,anon;
grant execute on function public.bank_exam_school_index(uuid) to authenticated;
