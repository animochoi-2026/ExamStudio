-- Additive set registry. Existing revisions/files and saved papers are untouched.
create table public.bank_question_sets (
 id uuid primary key default gen_random_uuid(), space_id uuid not null references public.bank_spaces(id),
 source_document text not null, original_numbers text[] not null,
 common jsonb not null, member_output jsonb not null default '{}',
 version integer not null default 1, owner_id uuid not null default auth.uid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(cardinality(original_numbers) between 2 and 20),
 check(jsonb_typeof(common)='object'), check(length(common::text)<200000)
);
create table public.bank_question_set_history (
 set_id uuid not null references public.bank_question_sets(id), version integer not null,
 actor_id uuid not null, document jsonb not null, created_at timestamptz not null default now(),
 primary key(set_id,version)
);
alter table public.bank_question_sets enable row level security;
alter table public.bank_question_set_history enable row level security;
revoke all on public.bank_question_sets,public.bank_question_set_history from anon,authenticated;

create function public.bank_question_sets_get(s uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.bank_member(s) then raise insufficient_privilege; end if;
 select coalesce(jsonb_agg((to_jsonb(g)||case when jsonb_array_length(m.items)=cardinality(g.original_numbers) or g.owner_id=auth.uid() then '{}'::jsonb else '{"common":null,"member_output":null}'::jsonb end)||jsonb_build_object('members',m.items,'complete',jsonb_array_length(m.items)=cardinality(g.original_numbers) and not m.items @> '[{"ambiguous":true}]'::jsonb)),'[]') into result
 from public.bank_question_sets g cross join lateral (
  select coalesce(jsonb_agg(jsonb_build_object('questionId',c.question_id,'revisionId',c.revision_id,'originalNumber',n.num,'ambiguous',c.matches>1) order by n.ord),'[]') items
  from unnest(g.original_numbers) with ordinality n(num,ord)
  join lateral (
   select c.question_id,c.revision_id,count(*) over() as matches from public.bank_catalog c
   join public.bank_questions q on q.id=c.question_id join public.bank_revisions r on r.id=c.revision_id
   where c.space_id=s and c.metadata#>>'{source,documentId}'=g.source_document
    and c.metadata#>>'{source,originalNumber}'=n.num and r.committed and not q.archived
    and public.bank_read_revision(r.id)
    and coalesce(c.metadata#>>'{relations,originalQuestionId}','')='' and coalesce(c.metadata#>>'{relations,derivedFromQuestionId}','')=''
    and not exists(select 1 from public.bank_revisions child where child.parent_id=r.id and child.committed)
   order by c.created_at desc limit 1
  ) c on true
 ) m where g.space_id=s and (jsonb_array_length(m.items)>0 or g.owner_id=auth.uid());
 return result;
end $$;

create function public.bank_question_set_save(s uuid,set_id uuid,expected integer,source_document text,numbers text[],common_data jsonb,output_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.bank_question_sets; saved public.bank_question_sets;
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if cardinality(numbers) not between 2 and 20 or cardinality(numbers)<>(select count(distinct x) from unnest(numbers) x)
  or exists(select 1 from unnest(numbers) x where x !~ '^[0-9]{1,3}$') or length(source_document) not between 1 and 100
  or jsonb_typeof(common_data->'nodes') is distinct from 'array' or jsonb_array_length(common_data->'nodes')=0
  or jsonb_typeof(output_data) is distinct from 'object' then raise exception '세트 원본 번호·공통 자료를 확인하세요';end if;
 if not public.bank_member(s,true) and (exists(select 1 from public.bank_catalog c join public.bank_questions q on q.id=c.question_id where c.space_id=s and c.metadata#>>'{source,documentId}'=source_document and c.metadata#>>'{source,originalNumber}'=any(numbers) and q.owner_id<>auth.uid())) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||source_document,0));
 if exists(select 1 from public.bank_question_sets g where g.space_id=s and g.source_document=bank_question_set_save.source_document and g.original_numbers && numbers and g.id<>set_id) then raise exception '이미 다른 세트에 연결된 원본 번호입니다';end if;
 select * into old from public.bank_question_sets g where g.id=set_id for update;
 if found then
  if old.source_document<>source_document then raise exception '세트의 원본 시험지는 변경할 수 없습니다';end if;
  if old.space_id<>s or (old.owner_id<>auth.uid() and not public.bank_member(s,true)) then raise insufficient_privilege;end if;
  if old.version<>expected then raise exception '세트 수정 충돌' using errcode='PT409';end if;
  update public.bank_question_sets g set original_numbers=numbers,common=common_data,member_output=output_data,version=g.version+1,updated_at=now() where g.id=set_id returning * into saved;
 else
  if expected<>0 then raise exception '세트 버전 없음' using errcode='PT409';end if;
  insert into public.bank_question_sets(id,space_id,source_document,original_numbers,common,member_output) values(set_id,s,source_document,numbers,common_data,output_data) returning * into saved;
 end if;
 insert into public.bank_question_set_history(set_id,version,actor_id,document) values(saved.id,saved.version,auth.uid(),to_jsonb(saved));
 return to_jsonb(saved);
end $$;
revoke all on function public.bank_question_sets_get(uuid),public.bank_question_set_save(uuid,uuid,integer,text,text[],jsonb,jsonb) from public;
grant execute on function public.bank_question_sets_get(uuid),public.bank_question_set_save(uuid,uuid,integer,text,text[],jsonb,jsonb) to authenticated;

create function public.bank_assert_question_sets(s uuid,items jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare g jsonb; m jsonb; first_at integer; member_at integer; n integer;
begin
 for g in select * from jsonb_array_elements(public.bank_question_sets_get(s)) loop
  if exists(select 1 from jsonb_array_elements(items) i join jsonb_array_elements(g->'members') member_row on i->>'questionId'=member_row->>'questionId') then
   if not (g->>'complete')::boolean then raise exception '세트 짝 문항의 등록·접근 권한을 확인하세요';end if;
   first_at:=null;n:=0;
   for m in select * from jsonb_array_elements(g->'members') loop
    select ord::integer into member_at from jsonb_array_elements(items) with ordinality a(i,ord) where i->>'questionId'=m->>'questionId';
    if member_at is null then raise exception '세트 일부만 포함된 시험지는 완성본으로 저장할 수 없습니다';end if;
    if first_at is null then first_at:=member_at;end if;
    if member_at<>first_at+n then raise exception '세트는 원본 내부 순서로 연속 배치하세요';end if;n:=n+1;
   end loop;
  end if;
 end loop;
end $$;
create function public.bank_question_set_paper_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare v jsonb;
begin
 if tg_table_name='bank_mock_exams' then
  for v in select * from jsonb_array_elements(new.document->'variants') loop
   if jsonb_typeof(v#>'{paper,items}')='array' then perform public.bank_assert_question_sets(new.space_id,v#>'{paper,items}');end if;
  end loop;
 elsif new.document->>'status'='completed' then perform public.bank_assert_question_sets(new.space_id,new.document->'items');
 end if;return new;
end $$;
revoke all on function public.bank_assert_question_sets(uuid,jsonb),public.bank_question_set_paper_guard() from public;
create trigger bank_exam_question_set_guard before insert or update of document on public.bank_exam_drafts for each row execute function public.bank_question_set_paper_guard();
create trigger bank_mock_question_set_guard before insert or update of document on public.bank_mock_exams for each row execute function public.bank_question_set_paper_guard();
