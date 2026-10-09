-- A delayed retry may retain its uploaded bytes, but cannot become the current
-- committed revision after another edit of the same base has completed.
create function public.bank_guard_revision_commit() returns trigger
language plpgsql security definer set search_path='' as $$
declare heads uuid[];
begin
 if not new.committed or old.committed then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.question_id::text,0));
 select array_agg(r.id) into heads from public.bank_revisions r
 where r.question_id=new.question_id and r.committed and r.id<>new.id
 and not exists(select 1 from public.bank_revisions child where child.parent_id=r.id and child.committed);
 if coalesce(cardinality(heads),0)>1 or cardinality(heads)=1 and new.parent_id is distinct from heads[1]
 or coalesce(cardinality(heads),0)=0 and new.parent_id is not null then
 raise exception '수정 충돌: 기준 버전 이후 새 변경이 있습니다. 최신본을 불러와 비교하세요.' using errcode='40001';
 end if;
 return new;
end $$;
revoke execute on function public.bank_guard_revision_commit() from public,anon,authenticated;
create trigger bank_commit_guard before update of committed on public.bank_revisions
for each row execute function public.bank_guard_revision_commit();

create function public.bank_adopt_rating(r uuid,u uuid,enabled boolean,expected timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare s uuid;previous jsonb;
begin
 select space_id into s from public.bank_catalog where revision_id=r;
 if not public.bank_reviewer(s) or not public.bank_read_revision(r) then raise insufficient_privilege;end if;
 select to_jsonb(t) into previous from public.bank_difficulty_ratings t where revision_id=r and user_id=u and updated_at=expected for update;
 if previous is null then raise exception '평가가 수정되었습니다. 새로 열어 확인하세요.';end if;
 update public.bank_difficulty_ratings set adopted=enabled,adopted_by=case when enabled then auth.uid() end,updated_at=now() where revision_id=r and user_id=u;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'adopt_rating',jsonb_build_object('revision',r,'before',previous,'adopted',enabled)::text);
end $$;
revoke execute on function public.bank_adopt_rating(uuid,uuid,boolean,timestamptz) from public,anon;
grant execute on function public.bank_adopt_rating(uuid,uuid,boolean,timestamptz) to authenticated;
