-- Registration is independent of teacher/answer review; no question rows change.
alter table public.bank_source_progress
 add column completion_method text check(completion_method in ('count_match','user_confirmed')),
 add column confirmed_at timestamptz,
 add column confirmed_by uuid;

create or replace function bank_summary.registration(n integer, actual integer, method text, st text) returns text
language sql immutable set search_path='' as $$
 select case when method='user_confirmed' and st='complete' then 'user_confirmed'
 when n is null or n<=0 then 'unknown' when actual=n then 'complete'
 when actual>n then 'mismatch' when actual=0 then 'unregistered' else 'partial' end;
$$;
revoke all on function bank_summary.registration(integer,integer,text,text) from public,anon,authenticated;

create or replace function bank_summary.source_value(s uuid,v jsonb) returns jsonb
language sql stable set search_path='' as $$
 with data as (select coalesce((select to_jsonb(p) from public.bank_source_progress p where space_id=s and source_id=v->>'source_id'),'{}'::jsonb) p,
 (select numbering from public.bank_source_numbering where space_id=s and source_id=v->>'source_id') n),
 total as (select p,n,coalesce((p->>'expected_count')::integer,(n->>'total')::integer,(v#>>'{source,numbering,total}')::integer) expected from data)
 select v||jsonb_build_object('progress',p||jsonb_build_object('numbering',n,'expected_count',expected),
 'registration_state',bank_summary.registration(expected,(v->>'question_count')::integer,p->>'completion_method',p->>'status')) from total;
$$;
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
 select count(distinct c.question_id) into actual_count from public.bank_catalog c join public.bank_questions q on q.id=c.question_id where c.space_id=s and not q.archived and public.bank_read_revision(c.revision_id) and coalesce(nullif(c.metadata#>>'{source,documentId}',''),(select f->>'sourceId' from jsonb_array_elements(c.files) f where f->>'role'='source' limit 1))=k;
 if actual_count<>n then raise exception '등록 문항 %개와 원본 전체 %개가 다릅니다',actual_count,n;end if;end if;
 v:=expected+1;
 insert into public.bank_source_progress(space_id,source_id,expected_count,status,version,actor_id,updated_at,completion_method) values(s,k,n,st,v,auth.uid(),now(),case when st='complete' then 'count_match' end) on conflict(space_id,source_id) do update set expected_count=n,status=st,version=v,actor_id=auth.uid(),updated_at=now(),completion_method=excluded.completion_method,confirmed_at=null,confirmed_by=null;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'source_progress',jsonb_build_object('source',k,'before',to_jsonb(old),'total',n,'status',st,'version',v)::text);
 return jsonb_build_object('expected_count',n,'status',st,'version',v);
end $$;

-- Filter before pagination. Only source metadata is read; existing access/grade gates remain.
create or replace function public.bank_source_list_page(s uuid,f jsonb default '{}'::jsonb,p integer default 0,mode text default 'schools',ordering text default 'name') returns jsonb
language plpgsql security definer set search_path='' as $$
declare all_rows jsonb; filtered jsonb; options jsonb; groups jsonb; result jsonb; total integer; current_page integer;
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if mode not in ('schools','papers') then raise exception '목록 종류 오류';end if;
 with raw as (select value v from jsonb_array_elements(public.bank_school_sources(s))),
 located as (select v,r.province,r.district,r.status from raw left join lateral (
 select x.* from public.bank_school_regions x where x.space_id=s and
 (x.id::text=v#>>'{source,schoolId}' or x.school_key=coalesce(nullif(v#>>'{source,schoolId}',''),coalesce(v#>>'{source,region}','')||'|'||coalesce(v#>>'{source,school}',''))
 or (x.name=v#>>'{source,school}' and (select count(*) from public.bank_school_regions z where z.space_id=s and z.name=x.name)=1))
 order by (x.id::text=v#>>'{source,schoolId}') desc nulls last limit 1) r on true)
 select coalesce(jsonb_agg(v||jsonb_build_object('school_key',coalesce(nullif(v#>>'{source,schoolId}',''),coalesce(v#>>'{source,region}','')||'|'||coalesce(v#>>'{source,school}','')),
 'district_key',case when status='verified' then province||'|'||district else 'unknown' end,
 'district_label',case when status<>'verified' or status is null then '지역 확인 필요' when exists(select 1 from public.bank_school_regions x where x.space_id=s and x.status='verified' and x.district=located.district and x.province<>located.province) then regexp_replace(province,'특별시|광역시|특별자치시|특별자치도|도$','','g')||' '||district else district end,
 'region_search',concat_ws(' ',province,district))),'[]') into all_rows from located;
 select jsonb_build_object('years',coalesce((select jsonb_agg(y order by y desc) from (select distinct value#>>'{source,academicYear}' y from jsonb_array_elements(all_rows) where nullif(value#>>'{source,academicYear}','') is not null) a),'[]'),
 'districts',coalesce((select jsonb_agg(jsonb_build_object('value',k,'label',label) order by (k='unknown'),label collate "ko-KR-x-icu") from (select distinct value->>'district_key' k,value->>'district_label' label from jsonb_array_elements(all_rows)) a),'[]')) into options;
 select coalesce(jsonb_agg(v),'[]') into filtered from jsonb_array_elements(all_rows) v where
 (coalesce(f->>'year','')='' or v#>>'{source,academicYear}'=f->>'year') and
 (coalesce(f->>'semester','')='' or v#>>'{source,semester}'=f->>'semester') and
 (coalesce(f->>'exam','')='' or v#>>'{source,exam}'=f->>'exam') and
 (coalesce(f->>'district','')='' or v->>'district_key'=f->>'district') and
 (coalesce(f->>'school','')='' or v->>'school_key'=f->>'school') and
 not exists(select 1 from regexp_split_to_table(trim(coalesce(f->>'query','')),'\s+') token where token<>'' and lower(concat_ws(' ',v#>>'{source,school}',v->>'region_search',v#>>'{source,academicYear}',v#>>'{source,exam}')) not like '%'||lower(token)||'%');
 if mode='schools' then
 select coalesce(jsonb_agg(g order by (g->>'district_key'='unknown'),(g->>'district_label') collate "ko-KR-x-icu",(g->>'school') collate "ko-KR-x-icu",g->>'key'),'[]') into groups from (
 select jsonb_build_object('key',v->>'school_key','school',max(v#>>'{source,school}'),'schoolId',max(v#>>'{source,schoolId}'),'region',max(v#>>'{source,region}'),'district_key',max(v->>'district_key'),'district_label',max(v->>'district_label'),'exams',jsonb_agg(v order by case when ordering='recent' then v->>'last_registered_at' else v->>'updated_at' end desc,v->>'source_id')) g from jsonb_array_elements(filtered) v group by v->>'school_key') a;
 else select coalesce(jsonb_agg(v order by (v->>'district_key'='unknown'),(v->>'district_label') collate "ko-KR-x-icu",(v#>>'{source,school}') collate "ko-KR-x-icu",v->>'updated_at' desc,v->>'source_id'),'[]') into groups from jsonb_array_elements(filtered) v;end if;
 total:=jsonb_array_length(groups);current_page:=least(greatest(coalesce(p,0),0),greatest(0,(total-1)/10));
 select coalesce(jsonb_agg(value order by ordinality),'[]') into result from jsonb_array_elements(groups) with ordinality where ordinality>current_page*10 and ordinality<=(current_page+1)*10;
 return jsonb_build_object('items',result,'page',current_page,'pages',greatest(1,(total+9)/10),'total',total,'exam_count',jsonb_array_length(filtered),'options',options);
end $$;
revoke all on function public.bank_source_list_page(uuid,jsonb,integer,text,text) from public,anon;
grant execute on function public.bank_source_list_page(uuid,jsonb,integer,text,text) to authenticated;
