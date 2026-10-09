create function public.bank_printed_key(src jsonb) returns text language plpgsql immutable set search_path='' as $$
declare n text;part text;begin
 n:=trim(coalesce(src->>'originalNumber',''));part:=src#>>'{numbering,section}';
 if part='unknown' then return null;end if;
 if n~'(서술|서답|주관|단답|논술)' then if part='objective' then return null;end if;part:='written';end if;
 if n~'(객관|선택)' and part='written' then return null;end if;
 part:=coalesce(part,'objective');if part not in ('objective','written') then return null;end if;
 n:=regexp_replace(n,'^(서술|서답|주관|단답|논술|객관|선택)(형|식)?\s*','');n:=regexp_replace(n,'^문제\s*','');n:=regexp_replace(trim(n),'\s*번?[.．:]?$','');
 if n!~'^[1-9][0-9]{0,3}([-\.][0-9]+|\([0-9]+\))?$' then return null;end if;
 return part||':'||n;
end $$;
create function public.bank_original_key(src jsonb) returns text language plpgsql immutable set search_path='' as $$
declare k text;v text;parts text[]:='{}';n text;begin
 if src->>'kind' is distinct from '학교기출' then return null;end if;
 foreach k in array array['school','grade','academicYear','semester','exam'] loop
  v:=regexp_replace(coalesce(src->>k,''),'\s+','','g');if k='academicYear' then v:=regexp_replace(v,'학년도$|년도$|년$','');end if;
  if v='' then return null;end if;parts:=array_append(parts,v);
 end loop;
 n:=public.bank_printed_key(src);if n is null then return null;end if;
 return md5(array_to_json(array_append(parts,n))::text);
end $$;
create table public.bank_source_identities(space_id uuid not null,identity_key text not null,question_id uuid not null references public.bank_questions on delete cascade,primary key(space_id,identity_key));
alter table public.bank_source_identities enable row level security;
revoke all on public.bank_source_identities from public,anon,authenticated;
insert into public.bank_source_identities(space_id,identity_key,question_id)
 select space_id,key,min(question_id::text)::uuid from (select distinct c.space_id,c.question_id,public.bank_original_key(c.metadata->'source') key from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id where r.committed and nullif(c.metadata#>>'{relations,originalQuestionId}','') is null) x where key is not null group by space_id,key having count(distinct question_id)=1 on conflict do nothing;
create function public.bank_source_identity_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare k text;target uuid;relation text;begin
 foreach relation in array array['originalQuestionId','derivedFromQuestionId'] loop
  if nullif(new.metadata#>>array['relations',relation],'') is not null then
   target:=(new.metadata#>>array['relations',relation])::uuid;perform 1 from public.bank_questions where id=target for share;
   if exists(select 1 from public.bank_question_deletions where question_id=target) then raise sqlstate 'PT409' using message='삭제 중인 원문에는 새 관계를 연결할 수 없습니다';end if;
  end if;
 end loop;
 if nullif(new.metadata#>>'{relations,originalQuestionId}','') is not null then return new;end if;
 k:=public.bank_original_key(new.metadata->'source');if k is null then return new;end if;
 insert into public.bank_source_identities values(new.space_id,k,new.question_id) on conflict do nothing;
 select question_id into target from public.bank_source_identities where space_id=new.space_id and identity_key=k;
 if target<>new.question_id then raise sqlstate 'PT409' using message='같은 원본 번호가 이미 등록되었습니다. 기존 문항을 선택하여 갱신하세요';end if;
 return new;
end $$;
create trigger bank_source_identity_guard before insert or update of metadata on public.bank_catalog for each row execute function public.bank_source_identity_guard();

create function public.bank_source_candidates(s uuid,source jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if length(coalesce(source->>'school',''))=0 then return '[]'::jsonb;end if;
 return (with latest as (select distinct on(c.question_id) c.question_id,c.revision_id,c.metadata,q.owner_id,r.created_at
 from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id
 where c.space_id=s and r.committed and not q.archived and public.bank_read_revision(r.id) and c.metadata#>>'{source,kind}'='학교기출' and nullif(c.metadata#>>'{relations,originalQuestionId}','') is null
 order by c.question_id,r.created_at desc,r.id desc),matched as (select * from latest c where not exists(select 1 from unnest(array['school','grade','academicYear','semester','exam']) k where coalesce(source->>k,'')<>'' and regexp_replace(coalesce(c.metadata#>>array['source',k],''),'\s+','','g')<>regexp_replace(source->>k,'\s+','','g')) order by created_at desc limit 200)
 select coalesce(jsonb_agg(to_jsonb(matched)),'[]'::jsonb) from matched);
end $$;
create table public.bank_source_numbering(space_id uuid not null,source_id text not null,numbering jsonb not null,primary key(space_id,source_id));
alter table public.bank_source_numbering enable row level security;
revoke all on public.bank_source_numbering from public,anon,authenticated;
-- These two facts are scoped to exact preserved exam document IDs and metadata.
-- They are user-confirmed totals, not defaults for a school/year.
insert into public.bank_source_numbering
 select distinct c.space_id,c.metadata#>>'{source,documentId}',jsonb_build_object('total',case c.metadata#>>'{source,school}' when '광희중' then 25 else 24 end,'objectiveCount',case c.metadata#>>'{source,school}' when '광희중' then 25 else 22 end,'writtenCount',case c.metadata#>>'{source,school}' when '광희중' then 0 else 2 end,'confirmed',true,'evidence','사용자 전체 수 확인; 보존된 현재 원문 번호 목록 대조')
 from public.bank_catalog c where c.metadata#>>'{source,academicYear}'='2026' and c.metadata#>>'{source,grade}'='중2' and c.metadata#>>'{source,semester}'='2학기' and c.metadata#>>'{source,exam}'='중간고사'
 and ((c.metadata#>>'{source,documentId}'='be94a0df-4da5-449e-affb-b3ec842083eb' and c.metadata#>>'{source,school}'='광희중') or (c.metadata#>>'{source,documentId}'='61fba6e6-b1af-420a-a501-f28f93f1c9d3' and c.metadata#>>'{source,school}'='신구중')) on conflict do nothing;
create function public.bank_capture_source_numbering() returns trigger language plpgsql security definer set search_path='' as $$
declare n jsonb;k text;total integer;objective integer;written integer;begin
 n:=new.metadata#>'{source,numbering}';k:=new.metadata#>>'{source,documentId}';
 if k is null or n is null or n->>'total'!~'^[1-9][0-9]{0,3}$' or length(coalesce(n->>'evidence',''))=0 then return new;end if;
 total:=(n->>'total')::integer;if total>2000 then raise exception '원본 전체 수를 확인하세요';end if;
 if n->>'objectiveCount' is not null and n->>'writtenCount' is not null then
  objective:=(n->>'objectiveCount')::integer;written:=(n->>'writtenCount')::integer;
  if objective<0 or written<0 or objective+written<>total then raise exception '객관식·서술형 수의 합이 전체 수와 다릅니다';end if;
 end if;
 -- A partial upload never replaces the established exam inventory.
 insert into public.bank_source_numbering values(new.space_id,k,n) on conflict do nothing;
 return new;
end $$;
create trigger bank_capture_source_numbering after insert on public.bank_catalog for each row execute function public.bank_capture_source_numbering();
revoke all on function public.bank_capture_source_numbering() from public,anon;
create or replace function public.bank_source_progress_get(s uuid,k text) returns jsonb language plpgsql security definer set search_path='' as $$
declare n jsonb;p jsonb;begin
 if not public.bank_member(s) or not exists(select 1 from public.bank_catalog c where c.space_id=s and public.bank_read_revision(c.revision_id) and coalesce(nullif(c.metadata#>>'{source,documentId}',''),(select f->>'sourceId' from jsonb_array_elements(c.files) f where f->>'role'='source' limit 1))=k) then raise insufficient_privilege;end if;
 select numbering into n from public.bank_source_numbering where space_id=s and source_id=k;
 if n is null then select c.metadata#>'{source,numbering}' into n from public.bank_catalog c where c.space_id=s and c.metadata#>>'{source,documentId}'=k and c.metadata#>>'{source,numbering,total}'~'^[1-9][0-9]{0,3}$' and length(coalesce(c.metadata#>>'{source,numbering,evidence}',''))>0 order by c.created_at desc limit 1;end if;
 select to_jsonb(x) into p from public.bank_source_progress x where space_id=s and source_id=k;
 return coalesce(p,'{}'::jsonb)||jsonb_build_object('numbering',n,'expected_count',coalesce((p->>'expected_count')::integer,(n->>'total')::integer));
end $$;
revoke all on function public.bank_printed_key(jsonb),public.bank_original_key(jsonb),public.bank_source_identity_guard(),public.bank_source_candidates(uuid,jsonb) from public,anon;
grant execute on function public.bank_source_candidates(uuid,jsonb) to authenticated;
