-- Detailed types live in the existing review overlay; native upload metadata,
-- file hashes, ACLs and idempotent finish/replay remain untouched.
create or replace function public.bank_detailed_types_valid(ts jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare t jsonb; k text[];
begin
 if jsonb_typeof(ts) is distinct from 'array' then return false;end if;
 if jsonb_array_length(ts)=0 or jsonb_array_length(ts)>20 then return false;end if;
 for t in select value from jsonb_array_elements(ts) loop
  if jsonb_typeof(t) is distinct from 'object' then return false;end if;
  k:=string_to_array(t->>'repeatKey','|');
  if coalesce(array_length(k,1),0)<>3 or k[1] not in ('task.angle','task.length','task.area','task.property','task.condition','task.shape','task.proof_fill','task.proof','task.count','task.expression','task.ratio')
   or coalesce(k[2],'')='' or coalesce(k[3],'')='' or k[2]=k[3]
   or k[2] is distinct from t#>>'{assessmentUnit,id}' or k[3] is distinct from t#>>'{coreTask,id}'
   or coalesce(btrim(t#>>'{coreTask,name}'),'')='' or coalesce(btrim(t#>>'{coreTask,definition}'),'')=''
   or coalesce(t#>>'{coreTask,name}','') ~* '^(기타|미분류|확인 필요|unknown|other|unclassified|pending)$'
   or k[3] ~* '^(기타|미분류|확인 필요|unknown|other|unclassified|pending)$'
   then return false;end if;
 end loop;
 return true;
end $$;
revoke all on function public.bank_detailed_types_valid(jsonb) from public,anon,authenticated;

create or replace function public.bank_detailed_type_commit_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare m jsonb; ts jsonb;
begin
 if not new.committed or old.committed then return new;end if;
 select metadata into m from public.bank_catalog where revision_id=new.id;
 ts:=coalesce(m#>'{classification,confirmed,types}',m#>'{classification,types}');
 if not public.bank_detailed_types_valid(ts) then
  raise exception '세부 유형 키가 없는 문항은 등록 완료로 처리할 수 없습니다. 문항 정보의 출제유형을 확인하세요.';
 end if;
 return new;
end $$;
revoke all on function public.bank_detailed_type_commit_guard() from public,anon,authenticated;
create trigger bank_zz_detailed_type_commit_guard before update of committed on public.bank_revisions
for each row execute function public.bank_detailed_type_commit_guard();

create or replace function public.bank_review_save(r uuid,p jsonb,expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s uuid;v public.bank_revisions;old jsonb;begin
 select q.space_id into s from public.bank_questions q join public.bank_revisions x on x.question_id=q.id where x.id=r and not q.archived;
 if s is null or not public.bank_member(s) or not public.bank_read_revision(r) then raise insufficient_privilege;end if;
 if jsonb_typeof(p) is distinct from 'object' or p-ARRAY['tags','primaryUnit','type','types']<>'{}'::jsonb or length(p::text)>10000
 or (p?'tags' and (jsonb_typeof(p->'tags') is distinct from 'array' or jsonb_array_length(p->'tags')>100))
 or (p?'primaryUnit' and jsonb_typeof(p->'primaryUnit') is distinct from 'string') or (p?'type' and jsonb_typeof(p->'type') is distinct from 'string')
 or exists(select 1 from jsonb_array_elements(coalesce(p->'tags','[]'::jsonb)) x where jsonb_typeof(x)<>'string') then raise exception '검수 입력 형식 오류';end if;
 if p?'types' and not public.bank_detailed_types_valid(p->'types') then raise exception '유효한 세부 유형 키와 핵심 풀이가 필요합니다';end if;
 select * into v from public.bank_revisions where id=r for update;
 if not v.committed or v.visibility not in ('shared_pending','approved') then raise exception '공동 문항만 검수할 수 있습니다';end if;
 if v.review_version is distinct from expected then raise sqlstate 'PT409' using message='검수 정보가 변경되었습니다. 최신 내용을 다시 확인하세요';end if;
 select confirmed into old from public.bank_catalog where revision_id=r for update;
 if old is null then raise exception '문항 데이터가 없습니다';end if;
 -- Old clients may still save unrelated fields, but cannot replace a reviewed
 -- detailed type with a broad label or erase the key.
 if p?'type' and coalesce(p->>'type','') is distinct from coalesce(old->>'type','') and not (p?'types') then raise exception '최신 앱에서 세부 유형을 선택하세요';end if;
 if p?'primaryUnit' and coalesce(p->>'primaryUnit','') is distinct from coalesce(old->>'primaryUnit','') then p:=p||jsonb_build_object('unitId',null);end if;
 if p?'type' and coalesce(p->>'type','') is distinct from coalesce(old->>'type','') then p:=p||jsonb_build_object('typeId',null);end if;
 update public.bank_catalog set confirmed=confirmed||p||jsonb_build_object('reviewConfirmed',true) where revision_id=r;
 update public.bank_revisions set visibility='approved',review_version=review_version+1,reviewer_id=auth.uid(),reviewed_at=now() where id=r;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'review_save',jsonb_build_object('revision',r,'before',old,'patch',p)::text);
 return jsonb_build_object('version',v.review_version+1);
end $$;
revoke all on function public.bank_review_save(uuid,jsonb,integer) from public,anon;
grant execute on function public.bank_review_save(uuid,jsonb,integer) to authenticated;

create or replace function public.bank_type_matches(m jsonb,c jsonb,wanted text) returns boolean
language plpgsql immutable set search_path='' as $$
declare ts jsonb;t jsonb;
begin
 if coalesce(wanted,'')='' then return true;end if;
 ts:=coalesce(c->'types',m#>'{classification,confirmed,types}',m#>'{classification,types}');
 if c?'types' and jsonb_typeof(c->'types')='array' then
  for t in select value from jsonb_array_elements(c->'types') loop
   if wanted in (t->>'name',t->>'label',t->>'id',t->>'repeatKey',t#>>'{coreTask,name}') then return true;end if;
  end loop;return false;
 end if;
 if coalesce(nullif(c->>'type',''),nullif(c->>'typeId','')) is not null then return wanted in (c->>'type',c->>'typeId');end if;
 t:=coalesce(m#>'{classification,confirmed,types,0}',m#>'{classification,confirmed,type}',m#>'{classification,types,0}');
 if jsonb_typeof(t)='string' then return t#>>'{}'=wanted;end if;
 return coalesce(wanted in (t->>'name',t->>'label',t->>'id',t->>'repeatKey',t#>>'{coreTask,name}'),false);
end $$;
revoke all on function public.bank_type_matches(jsonb,jsonb,text) from public,anon,authenticated;
