-- Preserve existing mock documents; permit configurable lettered kinds.
create or replace function public.bank_mock_save(s uuid,e uuid,expected integer,doc jsonb) returns jsonb
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
  if v->>'id' is null or coalesce(v->>'kind','') !~ '^[A-Z]+$' then raise exception '유형 형식 오류' using errcode='22023';end if;
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
