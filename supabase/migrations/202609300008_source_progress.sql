create table public.bank_source_progress(
 space_id uuid not null references public.bank_spaces, source_id text not null,
 expected_count integer check(expected_count between 1 and 2000),
 status text not null default 'unknown' check(status in('unknown','partial','in_progress','complete')),
 version integer not null default 1, actor_id uuid not null, updated_at timestamptz not null default now(),
 primary key(space_id,source_id)
);
alter table public.bank_source_progress enable row level security;
revoke all on public.bank_source_progress from public,anon,authenticated;
create function public.bank_source_progress_save(s uuid,k text,n integer,st text,expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_allowed boolean;old public.bank_source_progress;v integer;actual_count integer;
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 select exists(select 1 from public.bank_catalog c join public.bank_questions q on q.id=c.question_id where c.space_id=s and q.owner_id=auth.uid() and coalesce(nullif(c.metadata#>>'{source,documentId}',''),(select f->>'sourceId' from jsonb_array_elements(c.files) f where f->>'role'='source' limit 1))=k) into owner_allowed;
 if not owner_allowed and not public.bank_reviewer(s) then raise insufficient_privilege;end if;
 if st not in('unknown','partial','in_progress','complete') or n is not null and (n<1 or n>2000) then raise exception '등록 진행 상태를 확인하세요';end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||k,0));select * into old from public.bank_source_progress where space_id=s and source_id=k;
 if coalesce(old.version,0)<>expected then raise exception '진행 정보가 수정되었습니다. 새로 열어 주세요';end if;
 if st='complete' and n is not null then
 select count(distinct c.question_id) into actual_count from public.bank_catalog c join public.bank_questions q on q.id=c.question_id where c.space_id=s and not q.archived and public.bank_read_revision(c.revision_id) and coalesce(nullif(c.metadata#>>'{source,documentId}',''),(select f->>'sourceId' from jsonb_array_elements(c.files) f where f->>'role'='source' limit 1))=k;
 if actual_count<n then raise exception '등록 문항 %개가 원본 전체 %개보다 적습니다',actual_count,n;end if;end if;
 v:=expected+1;
 insert into public.bank_source_progress values(s,k,n,st,v,auth.uid(),now()) on conflict(space_id,source_id) do update set expected_count=n,status=st,version=v,actor_id=auth.uid(),updated_at=now();
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'source_progress',jsonb_build_object('source',k,'before',to_jsonb(old),'total',n,'status',st,'version',v)::text);
 return jsonb_build_object('expected_count',n,'status',st,'version',v);
end $$;
create function public.bank_source_progress_get(s uuid,k text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.bank_member(s) or not exists(select 1 from public.bank_catalog c where c.space_id=s and public.bank_read_revision(c.revision_id) and coalesce(nullif(c.metadata#>>'{source,documentId}',''),(select f->>'sourceId' from jsonb_array_elements(c.files) f where f->>'role'='source' limit 1))=k) then raise insufficient_privilege;end if;
 return coalesce((select to_jsonb(p) from public.bank_source_progress p where space_id=s and source_id=k),'{}');
end $$;
revoke execute on function public.bank_source_progress_save(uuid,text,integer,text,integer),public.bank_source_progress_get(uuid,text) from public,anon;
grant execute on function public.bank_source_progress_save(uuid,text,integer,text,integer),public.bank_source_progress_get(uuid,text) to authenticated;

