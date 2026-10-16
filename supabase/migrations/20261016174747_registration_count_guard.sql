-- Count current unique original questions, not historical revisions or generated variants.
create or replace function public.bank_source_progress_save(s uuid,k text,n integer,st text,expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_allowed boolean;old public.bank_source_progress;v integer;actual_count integer;
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 select exists(select 1 from public.bank_catalog c join public.bank_questions q on q.id=c.question_id where c.space_id=s and q.owner_id=auth.uid() and coalesce(nullif(c.metadata#>>'{source,documentId}',''),(select f->>'sourceId' from jsonb_array_elements(c.files) f where f->>'role'='source' limit 1))=k) into owner_allowed;
 if not owner_allowed and not public.bank_reviewer(s) then raise insufficient_privilege;end if;
 if st not in('unknown','partial','in_progress','complete') or n is not null and (n<1 or n>2000) then raise exception '등록 진행 상태를 확인하세요';end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||k,0));select * into old from public.bank_source_progress where space_id=s and source_id=k;
 if coalesce(old.version,0)<>expected then raise exception '진행 정보가 수정되었습니다. 새로 열어 주세요';end if;
 if st='complete' then
 if n is null or n<=0 then raise exception '원본 전체 문항 수를 확인하세요';end if;
 select coalesce(max((e->>'question_count')::integer),0) into actual_count from jsonb_array_elements(public.bank_school_sources(s)) e where e->>'source_id'=k;
 if actual_count<>n then raise exception '등록 문항 %개와 원본 전체 %개가 다릅니다',actual_count,n;end if;end if;
 v:=expected+1;
 insert into public.bank_source_progress(space_id,source_id,expected_count,status,version,actor_id,updated_at,completion_method) values(s,k,n,st,v,auth.uid(),now(),case when st='complete' then 'count_match' end) on conflict(space_id,source_id) do update set expected_count=n,status=st,version=v,actor_id=auth.uid(),updated_at=now(),completion_method=excluded.completion_method,confirmed_at=null,confirmed_by=null;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'source_progress',jsonb_build_object('source',k,'before',to_jsonb(old),'total',n,'status',st,'version',v)::text);
 return jsonb_build_object('expected_count',n,'status',st,'version',v);
end $$;

