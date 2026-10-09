create table public.bank_difficulty_ratings(
 revision_id uuid not null references public.bank_revisions, user_id uuid not null,
 score numeric(5,1) not null check(score<=10), adopted boolean not null default false,
 adopted_by uuid, updated_at timestamptz not null default now(), primary key(revision_id,user_id)
);
alter table public.bank_difficulty_ratings enable row level security;
create policy rating_read on public.bank_difficulty_ratings for select to authenticated using(public.bank_read_revision(revision_id) and (adopted or user_id=auth.uid() or exists(select 1 from public.bank_catalog c where c.revision_id=bank_difficulty_ratings.revision_id and public.bank_reviewer(c.space_id))));
revoke all on public.bank_difficulty_ratings from public,anon,authenticated;
grant select on public.bank_difficulty_ratings to authenticated;
create function public.bank_rate(r uuid,value numeric,adopt boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare s uuid;previous jsonb;begin
 select space_id into s from public.bank_catalog where revision_id=r;
 if not public.bank_read_revision(r) or adopt and not public.bank_reviewer(s) then raise insufficient_privilege;end if;
 if value is null or value>10 or value<>round(value,1) then raise exception '10점 만점 소수점 한 자리로 입력하세요';end if;
 select to_jsonb(t) into previous from public.bank_difficulty_ratings t where revision_id=r and user_id=auth.uid();
 insert into public.bank_difficulty_ratings(revision_id,user_id,score,adopted,adopted_by) values(r,auth.uid(),value,adopt,case when adopt then auth.uid() end)
 on conflict(revision_id,user_id) do update set score=excluded.score,adopted=excluded.adopted,adopted_by=excluded.adopted_by,updated_at=now();
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'difficulty_rating',jsonb_build_object('revision',r,'before',previous,'score',value,'adopted',adopt)::text);
end $$;
create function public.bank_rating_samples(s uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('questionId',c.question_id,'raterId',r.user_id,'familyId',coalesce(c.metadata#>>'{relations,originalQuestionId}',c.question_id::text),'rawScore',c.metadata#>>'{difficulty,aiScore}','score',r.score,'adopted',r.adopted,'updatedAt',r.updated_at,'model',c.metadata#>>'{analysis,model}','criteriaVersion',c.metadata#>>'{difficulty,criteriaVersion}','grade',c.metadata#>>'{source,grade}','scopeKey',c.metadata#>'{difficulty,scope}','type',c.metadata#>>'{content,responseType}')),'[]') from public.bank_difficulty_ratings r join public.bank_catalog c on c.revision_id=r.revision_id where c.space_id=s and r.adopted and public.bank_read_revision(c.revision_id));
end $$;
revoke execute on function public.bank_rate(uuid,numeric,boolean),public.bank_rating_samples(uuid) from public,anon;
grant execute on function public.bank_rate(uuid,numeric,boolean),public.bank_rating_samples(uuid) to authenticated;
