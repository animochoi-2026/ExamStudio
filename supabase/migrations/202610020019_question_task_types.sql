-- No new write privileges. Reuse the existing owner maintenance transaction.
-- Lock the parent before reading confirmations, including scope updates which
-- intentionally do not increment review_version.
create or replace function public.bank_maintenance_commit_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare i public.bank_maintenance_items; prior public.bank_catalog; incoming public.bank_catalog; actor_role text; a jsonb; b jsonb;
begin
 if not new.committed or old.committed then return new;end if;
 select * into i from public.bank_maintenance_items where result_id=new.id;
 if i.result_id is not null then
  perform 1 from public.bank_revisions where id=i.base_id and review_version=i.review_version for update;
  if not found then raise exception '검수값이 수정되었습니다. 다시 계획하세요.' using errcode='PT409';end if;
 end if;
 select * into prior from public.bank_catalog where revision_id=new.parent_id for update;
 if i.result_id is not null then
  select m.role into actor_role from public.bank_members m join auth.users u on lower(u.email)=m.email where u.id=new.actor_id and m.space_id=prior.space_id and m.enabled and u.email_confirmed_at is not null;
  if actor_role is distinct from 'owner' then raise insufficient_privilege;end if;
  if i.report->'rules' @> '["types"]'::jsonb then
   if jsonb_typeof(i.report->'typeExpected') is distinct from 'object'
    or i.report->'typeExpected' is distinct from jsonb_build_object('metadata',prior.metadata,'content',prior.content,'confirmed',prior.confirmed,'files',prior.files)
   then raise exception '수정 충돌: 유형 계획 이후 본문·확정값·메타데이터·파일이 변경되었습니다.' using errcode='PT409';end if;
   if coalesce(nullif(prior.confirmed->>'type',''),nullif(prior.confirmed->>'typeId','')) is not null
    or coalesce(prior.metadata#>'{classification,types}','[]') <> '[]'::jsonb
    or coalesce(prior.metadata#>'{classification,confirmed,types}','[]') <> '[]'::jsonb
   then raise exception '수정 충돌: 기존 출제유형을 보존하세요.' using errcode='PT409';end if;
   select * into incoming from public.bank_catalog where revision_id=new.id;
   a=(prior.metadata #- '{classification,types}' #- '{classification,typeRecommendation}' #- '{classification,suggested,types}') - 'processing';
   b=(incoming.metadata #- '{classification,types}' #- '{classification,typeRecommendation}' #- '{classification,suggested,types}') - 'processing';
   if coalesce(a#>'{classification,suggested}','null') in ('{}'::jsonb,'null'::jsonb) then a=a #- '{classification,suggested}';end if;
   if coalesce(b#>'{classification,suggested}','null') in ('{}'::jsonb,'null'::jsonb) then b=b #- '{classification,suggested}';end if;
   if incoming.content is distinct from prior.content or a is distinct from b
    or jsonb_typeof(incoming.metadata#>'{classification,types}') is distinct from 'array'
    or jsonb_array_length(incoming.metadata#>'{classification,types}')=0
   then raise exception '출제유형 외 내용 변경을 차단했습니다.';end if;
   if prior.metadata ? 'processing' and
    (((prior.metadata->'processing') - 'nativeInput') #- '{rules,types}') is distinct from (((incoming.metadata->'processing') - 'nativeInput') #- '{rules,types}')
   then raise exception '기존 처리 기록 변경을 차단했습니다.';end if;
   select coalesce(jsonb_agg(jsonb_build_array(f->>'role',f->>'sha256',f->>'size') order by f->>'role',f->>'sha256',f->>'size'),'[]') into a from jsonb_array_elements(prior.files) f where f->>'role' not in ('data','commit');
   select coalesce(jsonb_agg(jsonb_build_array(f->>'role',f->>'sha256',f->>'size') order by f->>'role',f->>'sha256',f->>'size'),'[]') into b from jsonb_array_elements(incoming.files) f where f->>'role' not in ('data','commit');
   if a is distinct from b then raise exception '유형 보완 중 원본·그림·DOCX·미리보기 변경을 차단했습니다.';end if;
  end if;
  update public.bank_catalog set confirmed=prior.confirmed where revision_id=new.id;
  select visibility,review_version into new.visibility,new.review_version from public.bank_revisions where id=i.base_id;
  update public.bank_maintenance_items set status='complete',committed_at=now() where result_id=new.id;
 end if;
 if prior.metadata ? 'processing' and i.result_id is null and not exists(select 1 from public.bank_catalog c where c.revision_id=new.id and public.bank_metadata_keys_preserved(prior.metadata,c.metadata)) then
  raise exception '문제공방 업데이트 필요: 이전 앱이 일괄 처리 기록을 지우는 등록을 차단했습니다.';
 end if;
 return new;
end $$;

create function public.bank_type_matches(m jsonb,c jsonb,wanted text) returns boolean
language plpgsql immutable set search_path='' as $$
declare t jsonb;
begin
 if coalesce(wanted,'')='' then return true;end if;
 if coalesce(nullif(c->>'type',''),nullif(c->>'typeId','')) is not null then return wanted in (c->>'type',c->>'typeId');end if;
 t=coalesce(m#>'{classification,confirmed,types,0}',m#>'{classification,confirmed,type}',m#>'{classification,types,0}');
 if jsonb_typeof(t)='string' then return t#>>'{}'=wanted;end if;
 return coalesce(wanted in (t->>'name',t->>'label',t->>'id'),false);
end $$;
revoke all on function public.bank_type_matches(jsonb,jsonb,text) from public,anon,authenticated;

-- Keep bank_search as the version-aware export API. UI queries use current revisions.
create or replace function public.bank_search_current(s uuid,filters jsonb default '{}',start_at integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 return (with latest as (
 select distinct on(c.question_id) c.*,r.visibility,r.review_version,q.owner_email,
 (select count(*)>1 from public.bank_revisions h where h.question_id=c.question_id and h.committed and public.bank_read_revision(h.id) and not exists(select 1 from public.bank_revisions child where child.parent_id=h.id and child.committed)) revision_conflict,
 coalesce(nullif(c.confirmed->>'difficulty',''),nullif(c.metadata#>>'{difficulty,userScore}',''),nullif(c.metadata#>>'{difficulty,aiScore}',''))::numeric score
 from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id
 where c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id)
 order by c.question_id,c.created_at desc,c.revision_id desc
 ), filtered as (
 select revision_id,question_id,space_id,commit_id,metadata,confirmed,created_at,visibility,review_version,owner_email,revision_conflict,
 jsonb_build_object('body',left(content->>'body',350)) content,
 (select coalesce(jsonb_agg(f),'[]') from jsonb_array_elements(files) f where f->>'role'='preview') files
 from latest c where
 (coalesce(filters->>'text','')='' or (metadata::text||content::text||confirmed::text) ilike '%'||(filters->>'text')||'%')
 and(coalesce(filters->>'school','')='' or metadata#>>'{source,school}'=filters->>'school')
 and(coalesce(filters->>'academicYear','')='' or metadata#>>'{source,academicYear}'=filters->>'academicYear')
 and(coalesce(filters->>'grade','')='' or metadata#>>'{source,grade}'=filters->>'grade')
 and(coalesce(filters->>'semester','')='' or metadata#>>'{source,semester}'=filters->>'semester')
 and(coalesce(filters->>'unit','')='' or coalesce(nullif(confirmed->>'primaryUnit',''),metadata#>>'{classification,primaryUnit,name}')=filters->>'unit')
 and public.bank_type_matches(metadata,confirmed,filters->>'type')
 and(coalesce(filters->>'owner','')='' or owner_email=filters->>'owner')
 and(coalesce(filters->>'status','')='' or visibility=filters->>'status')
 and(not(filters?'min') or score>=(filters->>'min')::numeric)
 and(not(filters?'max') or score<=(filters->>'max')::numeric)
 order by created_at desc,revision_id desc limit 50 offset greatest(0,start_at)
 ) select coalesce(jsonb_agg(to_jsonb(filtered)),'[]') from filtered);
end $$;
revoke execute on function public.bank_search_current(uuid,jsonb,integer) from public,anon;
grant execute on function public.bank_search_current(uuid,jsonb,integer) to authenticated;

