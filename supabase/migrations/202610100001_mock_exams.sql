-- Additive only: ordinary exams, source restoration, catalog and uploads retain
-- their existing contracts. Apply only after scheduling production deployment.
create table public.bank_mock_exams(
 id uuid primary key, space_id uuid not null references public.bank_spaces(id),
 owner_id uuid not null default auth.uid() references auth.users(id),
 title text not null, version integer not null default 1, document jsonb not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index bank_mock_owner_recent on public.bank_mock_exams(space_id,owner_id,updated_at desc,id);
alter table public.bank_mock_exams enable row level security;
create policy mock_owner_read on public.bank_mock_exams for select to authenticated using(owner_id=auth.uid() and public.bank_member(space_id));
grant select on public.bank_mock_exams to authenticated;
-- Real foreign keys protect saved versions against both delete and prune paths.
create table public.bank_mock_items(
 exam_id uuid not null references public.bank_mock_exams(id) on delete cascade,
 variant_id uuid not null, question_id uuid not null references public.bank_questions(id),
 revision_id uuid not null references public.bank_revisions(id), primary key(exam_id,variant_id,question_id)
);
create index bank_mock_items_question on public.bank_mock_items(question_id);
create index bank_mock_items_revision on public.bank_mock_items(revision_id);
alter table public.bank_mock_items enable row level security;

create function public.bank_mock_list(s uuid,start_at integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,version,updated_at,jsonb_array_length(document->'variants') variant_count from public.bank_mock_exams where space_id=s and owner_id=auth.uid() order by updated_at desc,id limit 30 offset greatest(0,start_at)) x),'[]');
end $$;
create function public.bank_mock_get(s uuid,e uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 select jsonb_build_object('document',document,'version',version,'id',id) into result from public.bank_mock_exams where id=e and space_id=s and owner_id=auth.uid();
 if result is null then raise insufficient_privilege;end if;return result;
end $$;
create function public.bank_mock_save(s uuid,e uuid,expected integer,doc jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old public.bank_mock_exams; clean jsonb; v jsonb; i jsonb; next_version integer;
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if e is null or expected is null or expected<0 or jsonb_typeof(doc) is distinct from 'object'
 or doc->>'id' is distinct from e::text or doc->>'schema' is distinct from '1'
 or length(trim(coalesce(doc->>'title',''))) not between 1 and 200
 or jsonb_typeof(doc->'variants') is distinct from 'array' or length(doc::text)>20000000
 then raise exception '모의고사 형식을 확인하세요.' using errcode='22023';end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(doc->'variants') x)<>jsonb_array_length(doc->'variants') then raise exception '유형 식별자 중복' using errcode='22023';end if;
 for v in select * from jsonb_array_elements(doc->'variants') loop
  if v->>'id' is null or v->>'kind' not in ('A','B') then raise exception '유형 형식 오류' using errcode='22023';end if;
  perform (v->>'id')::uuid;
  if v->'paper' is not null and v->'paper'<>'null'::jsonb then
   if jsonb_typeof(v#>'{paper,items}') is distinct from 'array' or jsonb_array_length(v#>'{paper,items}')>100
   or (select count(distinct x->>'questionId') from jsonb_array_elements(v#>'{paper,items}') x)<>jsonb_array_length(v#>'{paper,items}') then raise exception '유형별 문항 형식 오류' using errcode='22023';end if;
   for i in select * from jsonb_array_elements(v#>'{paper,items}') loop
    if not exists(select 1 from public.bank_catalog c where c.space_id=s and c.question_id=(i->>'questionId')::uuid and c.revision_id=(i->>'revisionId')::uuid and public.bank_read_revision(c.revision_id))
    then raise exception '문항 버전 접근 권한을 확인하세요.' using errcode='42501';end if;
   end loop;
  end if;
 end loop;
 clean:=doc-'version';perform pg_advisory_xact_lock(hashtextextended(e::text,1));
 select * into old from public.bank_mock_exams where id=e for update;
 if found then
  if old.owner_id<>auth.uid() or old.space_id<>s then raise insufficient_privilege;end if;
  if old.version<>expected then
   if old.version=expected+1 and old.document=clean then return jsonb_build_object('id',e,'version',old.version,'replayed',true);end if;
   raise exception '다른 기기에서 모의고사를 수정했습니다. 최신 저장본을 다시 열어 주세요.' using errcode='PT409';
  end if;
  if old.document=clean then return jsonb_build_object('id',e,'version',old.version);end if;
  next_version:=old.version+1;
  update public.bank_mock_exams set title=doc->>'title',document=clean,version=next_version,updated_at=now() where id=e;
 else
  if expected<>0 then raise exception '모의고사 버전이 없습니다.' using errcode='PT409';end if;
  next_version:=1;insert into public.bank_mock_exams(id,space_id,title,document) values(e,s,doc->>'title',clean);
 end if;
 delete from public.bank_mock_items where exam_id=e;
 insert into public.bank_mock_items(exam_id,variant_id,question_id,revision_id)
 select e,(variant_row->>'id')::uuid,(item_row->>'questionId')::uuid,(item_row->>'revisionId')::uuid from jsonb_array_elements(doc->'variants') variant_row cross join lateral jsonb_array_elements(coalesce(nullif(variant_row#>'{paper,items}','null'::jsonb),'[]')) item_row;
 return jsonb_build_object('id',e,'version',next_version);
end $$;

create function public.bank_mock_schools(s uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return coalesce((select jsonb_agg(school order by school) from (select distinct c.metadata#>>'{source,school}' school from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id where c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id) and nullif(trim(c.metadata#>>'{source,school}'),'') is not null and c.metadata#>>'{source,kind}'='학교기출' and coalesce(c.metadata#>>'{relations,originalQuestionId}','')='') x),'[]');
end $$;

-- One STABLE statement snapshot; no offset pagination across changing heads.
-- Excluded exams are read within that SAME database snapshot.
create function public.bank_mock_snapshot(s uuid,schools jsonb,exclude_exams uuid[] default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare candidates jsonb; excluded jsonb; refs jsonb;
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if jsonb_typeof(schools) is distinct from 'array' or jsonb_array_length(schools)=0 then raise exception '출처 학교를 선택하세요.' using errcode='22023';end if;
 if exists(select 1 from unnest(exclude_exams) x where not exists(select 1 from public.bank_mock_exams e where e.id=x and e.space_id=s and e.owner_id=auth.uid())) then raise insufficient_privilege;end if;
 select coalesce(jsonb_agg(distinct i->>'questionId'),'[]') into excluded from public.bank_mock_exams e cross join lateral jsonb_array_elements(e.document->'variants') v cross join lateral jsonb_array_elements(coalesce(nullif(v#>'{paper,items}','null'::jsonb),'[]')) i where e.id=any(exclude_exams) and e.space_id=s and e.owner_id=auth.uid();
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'title',title)),'[]') into refs from public.bank_mock_exams where id=any(exclude_exams) and space_id=s and owner_id=auth.uid();
 with latest as (
  select distinct on(c.question_id) c.*,r.review_version,
   (select count(*)>1 from public.bank_revisions h where h.question_id=c.question_id and h.committed and public.bank_read_revision(h.id) and not exists(select 1 from public.bank_revisions child where child.parent_id=h.id and child.committed)) revision_conflict
  from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id
  where c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id)
  order by c.question_id,c.created_at desc,c.revision_id desc
 ) select coalesce(jsonb_agg(to_jsonb(c) order by c.question_id),'[]') into candidates from latest c
 where schools ? (c.metadata#>>'{source,school}') and c.metadata#>>'{source,kind}'='학교기출' and coalesce(c.metadata#>>'{relations,originalQuestionId}','')='';
 return jsonb_build_object('id',gen_random_uuid(),'at',statement_timestamp(),'candidates',candidates,'excludeIds',excluded,'exclusions',refs);
end $$;
revoke all on function public.bank_mock_list(uuid,integer),public.bank_mock_get(uuid,uuid),public.bank_mock_save(uuid,uuid,integer,jsonb),public.bank_mock_schools(uuid),public.bank_mock_snapshot(uuid,jsonb,uuid[]) from public,anon;
grant execute on function public.bank_mock_list(uuid,integer),public.bank_mock_get(uuid,uuid),public.bank_mock_save(uuid,uuid,integer,jsonb),public.bank_mock_schools(uuid),public.bank_mock_snapshot(uuid,jsonb,uuid[]) to authenticated;

-- Preserve the established space lock and freeze rules for new references.
create trigger bank_mock_delete_freeze before insert or update on public.bank_mock_exams for each row execute function public.bank_question_delete_write_guard();
create trigger bank_mock_prune_freeze before insert or update on public.bank_mock_items for each row execute function public.bank_revision_prune_freeze_guard();
create function public.bank_mock_protect_files() returns trigger
language plpgsql security definer set search_path='' as $$
declare s uuid; refs text[];
begin
 s:=new.space_id;
 perform pg_advisory_xact_lock(hashtextextended('revision-prune:'||s::text,0));
 select coalesce(array_agg(x#>>'{}'),'{}') into refs from jsonb_path_query(case when tg_table_name='bank_revision_prunes' then jsonb_build_object('revisions',to_jsonb(new)#>'{plan,revisions}','files',to_jsonb(new)#>'{plan,files}') else to_jsonb(new) end,'$.**') x where jsonb_typeof(x)='string';
 if exists(select 1 from public.bank_mock_items i join public.bank_mock_exams e on e.id=i.exam_id join public.bank_catalog c on c.revision_id=i.revision_id where e.space_id=s and
  (i.question_id::text=any(refs) or i.revision_id::text=any(refs) or c.commit_id::text=any(refs) or exists(select 1 from jsonb_array_elements(c.files) f where f->>'id'=any(refs))))
 then raise exception '저장된 모의고사가 사용하는 문항·버전·파일입니다.' using errcode='PT409';end if;
 return new;
end $$;
revoke all on function public.bank_mock_protect_files() from public,anon,authenticated;
create trigger bank_mock_protect_delete before insert or update on public.bank_question_deletions for each row execute function public.bank_mock_protect_files();
create trigger bank_mock_protect_prune before insert or update on public.bank_revision_prunes for each row execute function public.bank_mock_protect_files();
