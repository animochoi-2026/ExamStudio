begin;
set local lock_timeout='5s';
create index bank_query_unit_title_grade on bank_query.units(title,grade);
create or replace function bank_query.unit_id(m jsonb,f jsonb) returns text language plpgsql stable set search_path='' as $body$
declare v jsonb:=coalesce(f->'primaryUnit',m#>'{classification,confirmed,primaryUnit}',m#>'{classification,primaryUnit}',m#>'{classification,suggested,primaryUnit}'); key text:=coalesce(v->>'id',v#>>'{}'); label text:=coalesce(v->>'name',v#>>'{}'); target_grade text:=m#>>'{source,grade}'; found_id text; n integer;begin
 select id into found_id from bank_query.units where id=key;if found then return found_id;end if;
 select min(id),count(*) into found_id,n from bank_query.units u where u.title=label and (coalesce(target_grade,'')='' or u.grade=target_grade);if n=1 then return found_id;end if;return null;
end $body$;
create or replace function public.bank_replacement_page(s uuid,current_revision uuid,rules jsonb,selected uuid[],page integer default 0,expanded boolean default false,expected_version text default null,candidate uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target public.bank_catalog;tu text;tt text;tp text;result jsonb;begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if page<0 or page>100000 or jsonb_typeof(rules)<>'object' or coalesce(array_length(selected,1),0)>1000 then raise exception '조회 조건을 확인하세요.';end if;
 select * into target from public.bank_catalog where space_id=s and revision_id=current_revision and public.bank_read_revision(revision_id);
 if not found then raise insufficient_privilege;end if;
 if exists(select 1 from public.bank_question_sets qs where qs.space_id=s and qs.source_document=target.metadata#>>'{source,documentId}' and (target.metadata#>>'{source,originalNumber}')=any(qs.original_numbers)) then raise exception '세트 문항은 개별 교체할 수 없습니다.';end if;
 tu:=bank_query.unit_id(target.metadata,target.confirmed);tt:=bank_query.type_key(target.metadata,target.confirmed);select parent into tp from bank_query.units where id=tu;
 return (with classified as materialized(
 select c,bank_query.unit_id(c.metadata,c.confirmed) unit,bank_query.type_key(c.metadata,c.confirmed) typ,
 (jsonb_array_length(coalesce(rules->'schools','[]'))=0 or coalesce(rules->'schools','[]') ? coalesce(c.metadata#>>'{source,school}','')) local_school
 from bank_query.latest(s) c), nearby as materialized(select * from classified where unit=tu or (tp is not null and exists(select 1 from bank_query.units where id=unit and parent=tp))), candidates as materialized(select c,unit,typ,local_school from nearby where (c).question_id<>target.question_id and not((c).question_id=any(coalesce(selected,'{}'::uuid[])))
 and not coalesce(rules->'excludeIds','[]') ? (c).question_id::text
 and bank_query.scope_fit((c).metadata,(c).confirmed,rules)
 and (coalesce(rules->>'unit','')='' or exists(select 1 from bank_query.units u where u.id=bank_query.unit_id((c).metadata,(c).confirmed) and (u.id=rules->>'unit' or u.title=rules->>'unit')))
 and public.bank_type_matches((c).metadata,(c).confirmed,rules->>'type')
 and (coalesce(rules->>'originalsOnly','false')<>'true' or ((c).metadata#>>'{source,kind}'='학교기출' and coalesce((c).metadata#>>'{relations,originalQuestionId}','')=''))
 and not exists(select 1 from public.bank_question_sets qs where qs.space_id=s and qs.source_document=(c).metadata#>>'{source,documentId}' and ((c).metadata#>>'{source,originalNumber}')=any(qs.original_numbers))
 and (select count(*) from public.bank_revisions h where h.question_id=(c).question_id and h.committed and public.bank_read_revision(h.id) and not exists(select 1 from public.bank_revisions child where child.parent_id=h.id and child.committed))=1
 ),ranked as materialized(select c,local_school,case when unit=tu and typ=tt then 1 when unit=tu then 2 else 3 end tier,unit=tu same_unit,coalesce(typ=tt,false) same_type
 from candidates where (local_school and (unit=tu or (tp is not null and exists(select 1 from bank_query.units where id=unit and parent=tp)))) or (not local_school and unit=tu and typ=tt)),
 counts as(select count(*) filter(where local_school) base,count(*) filter(where not local_school) extra,md5(coalesce(string_agg((c).question_id::text||':'||(c).revision_id::text||':'||md5(coalesce((c).metadata::text,'')||coalesce((c).confirmed::text,'')||coalesce((c).content::text,''))||':'||tier||':'||local_school,',' order by tier,(c).question_id),'')) version from ranked),
 shown as(select * from ranked where (local_school or expanded) and (candidate is null or (c).question_id=candidate) order by tier,(c).question_id,(c).revision_id limit case when candidate is null then 10 else 1 end offset case when candidate is null then page*10 else 0 end)
 select jsonb_build_object('baseCount',base,'extraCount',extra,'total',base+case when expanded then extra else 0 end,'version',version,'changed',expected_version is not null and expected_version<>version,
 'items',case when expected_version is not null and expected_version<>version then '[]'::jsonb else (select coalesce(jsonb_agg(bank_query.compact(c)||jsonb_build_object('tier',tier,'sameUnit',same_unit,'sameType',same_type,'sameParent',tier=3,'otherSchool',not local_school) order by tier,(c).question_id),'[]') from shown) end) from counts);
end $$;
commit;
