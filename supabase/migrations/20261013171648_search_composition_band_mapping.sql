-- UI composition codes differ from the rubric display bands. Match final numeric scores.
begin;
create or replace function public.bank_search_page(s uuid,filters jsonb default '{}',start_at integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if start_at<0 or start_at>100000 then raise exception '페이지를 확인하세요.';end if;
 return (with current_rows as materialized(select c.*,r.visibility,q.owner_email,bank_summary.row_difficulty(c.revision_id,c.metadata,c.confirmed) d from bank_query.latest(s) c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id),
 filtered as materialized(select c from current_rows c where
 (coalesce(filters->>'compositionBand','')='' or (filters->>'compositionBand'='killer' and (d->>'score')::numeric>=9) or (filters->>'compositionBand'<>'killer' and (case when d->>'score' is null then 'unknown' when (d->>'score')::numeric<=3 then 'low' when (d->>'score')::numeric<8 then 'middle' else 'high' end)=filters->>'compositionBand'))
 and(coalesce(filters->>'text','')='' or (metadata::text||content::text||confirmed::text) ilike '%'||(filters->>'text')||'%')
 and(coalesce(filters->>'school','')='' or metadata#>>'{source,school}'=filters->>'school')
 and(coalesce(filters->>'academicYear','')='' or metadata#>>'{source,academicYear}'=filters->>'academicYear')
 and(coalesce(filters->>'grade','')='' or metadata#>>'{source,grade}'=filters->>'grade')
 and(coalesce(filters->>'semester','')='' or metadata#>>'{source,semester}'=filters->>'semester')
 and(coalesce(filters->>'unit','')='' or exists(select 1 from bank_query.units u where u.id=bank_query.unit_id(metadata,confirmed) and (u.title=filters->>'unit' or u.id=filters->>'unit')))
 and public.bank_type_matches(metadata,confirmed,filters->>'type')
 and(coalesce(filters->>'owner','')='' or owner_email=filters->>'owner')
 and(coalesce(filters->>'status','')='' or visibility=filters->>'status')),
 page_rows as(select c from filtered order by (c).created_at desc,(c).revision_id desc limit 50 offset start_at)
 select jsonb_build_object('total',(select count(*) from filtered),'items',(select coalesce(jsonb_agg(bank_query.compact(b) order by (p.c).created_at desc,(p.c).revision_id desc),'[]') from page_rows p join public.bank_catalog b on b.revision_id=(p.c).revision_id)));
end $$;

commit;
