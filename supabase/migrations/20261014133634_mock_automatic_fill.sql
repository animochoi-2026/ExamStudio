-- Only mock initial composition; existing replacement RPC and ordinary exams unchanged.
begin;
set local lock_timeout='5s';
create function public.bank_mock_auto_candidates(s uuid,current_exam uuid,schools jsonb,units jsonb,selected uuid[] default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare data jsonb;filtered jsonb;school_keys text[]:='{}';matches text[];school text;excluded uuid[];
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if jsonb_typeof(schools) is distinct from 'array' or jsonb_array_length(schools)=0 or jsonb_typeof(units) is distinct from 'array' or jsonb_array_length(units)=0 then raise exception '학교와 시험범위를 선택하세요.' using errcode='22023';end if;
 data=public.bank_mock_candidates(s,current_exam,null);
 select array_agg(distinct bank_ops.original_id(s,q)) into excluded from unnest(coalesce(selected,'{}')) q;
 for school in select jsonb_array_elements_text(schools) loop
  select array_agg(distinct bank_query.school_key(c->'metadata')) into matches from jsonb_array_elements(data->'candidates') c
  where bank_query.school_key(c->'metadata')=school or c#>>'{metadata,source,school}'=school;
  if cardinality(matches)>1 then raise exception '동명이교를 구분할 수 없습니다. 학교 ID를 확인하세요: %',school;end if;
  school_keys=school_keys||coalesce(matches,'{}');
 end loop;
 select coalesce(jsonb_agg(c||jsonb_build_object('originalId',bank_ops.original_id(s,(c->>'question_id')::uuid),'preferredSchool',bank_query.school_key(c->'metadata')=any(school_keys)) order by c->>'question_id'),'[]') into filtered
 from jsonb_array_elements(data->'candidates') c
 where c#>>'{metadata,source,kind}'='학교기출'
 and (bank_query.school_key(c->'metadata')=any(school_keys) or bank_query.response_format(c->'metadata')='서술형')
 and bank_query.scope_fit(c->'metadata',c->'confirmed',jsonb_build_object('units',units))
 and not(bank_ops.original_id(s,(c->>'question_id')::uuid)=any(coalesce(excluded,'{}')));
 return jsonb_set(data,'{candidates}',filtered);
end $$;
revoke all on function public.bank_mock_auto_candidates(uuid,uuid,jsonb,jsonb,uuid[]) from public,anon;
grant execute on function public.bank_mock_auto_candidates(uuid,uuid,jsonb,jsonb,uuid[]) to authenticated;
create or replace function public.bank_mock_save(s uuid,e uuid,expected integer,doc jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare g uuid;old public.bank_mock_exams;conflicts jsonb;ids uuid[];begin
 perform 1 from public.bank_spaces where id=s for share;
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 select * into old from public.bank_mock_exams where id=e;
 if found then
  if old.space_id<>s or old.owner_id<>auth.uid() or not bank_ops.mock_read(s,old.group_id,old.owner_id) then raise insufficient_privilege;end if;
  if old.expires_at<=now() then raise exception '보관 기간이 만료되었습니다.' using errcode='PT410';end if;g=old.group_id;
 else g=bank_ops.group_id(s);end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||coalesce(g::text,auth.uid()::text),38));
 select array_agg(distinct (i->>'questionId')::uuid) into ids from jsonb_array_elements(doc->'variants') v cross join lateral jsonb_array_elements(coalesce(nullif(v#>'{paper,items}','null'),'[]')) i;
 conflicts=public.bank_mock_check(s,e,coalesce(ids,'{}'));
 if jsonb_array_length(conflicts)>0 then raise exception '이미 보관 중인 모의고사에 사용된 문제입니다. 충돌 문항을 교체하거나 기존 모의고사를 먼저 삭제하세요.' using errcode='PT409',detail=conflicts::text;end if;
 -- Keep legacy shared rounds editable; new automatic papers must be unique even
 -- when the caller submits different revisions/copies or omits candidate filters.
 if exists(with items as materialized(
  select bank_ops.original_id(s,(i->>'questionId')::uuid) original_id,v->>'id' variant_id,
   coalesce(v#>>'{paper,autoComposition,policy}'='unique-auto-fill-v1',false) automatic
  from jsonb_array_elements(doc->'variants') v cross join lateral jsonb_array_elements(coalesce(nullif(v#>'{paper,items}','null'),'[]')) i
 ), old_items as materialized(
  select bank_ops.original_id(s,(i->>'questionId')::uuid) original_id,v->>'id' variant_id
  from jsonb_array_elements(old.document->'variants') v cross join lateral jsonb_array_elements(coalesce(nullif(v#>'{paper,items}','null'),'[]')) i
  where coalesce(v#>>'{paper,autoComposition,policy}','')<>'unique-auto-fill-v1'
 ), existing_patterns as (select array_agg(variant_id order by variant_id) variants from old_items group by original_id having count(*)>1), duplicates as (
  select array_agg(variant_id order by variant_id) variants,bool_or(automatic) automatic from items group by original_id having count(*)>1
 ) select 1 from duplicates d where automatic or not exists(select 1 from existing_patterns p where p.variants=d.variants)) then
  raise exception '자동 구성 시험지 사이에 같은 원본 문항이 중복되었습니다.' using errcode='22023';
 end if;
 if old.id is null or old.document->>'compositionPolicy'='unique-auto-fill-v1' or exists(select 1 from jsonb_array_elements(doc->'variants') v where v#>>'{paper,autoComposition,policy}'='unique-auto-fill-v1') then doc=jsonb_set(doc,'{compositionPolicy}','"unique-auto-fill-v1"');end if;
 return bank_ops.bank_mock_save(s,e,expected,doc);
end $$;

commit;
