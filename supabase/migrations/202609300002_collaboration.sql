-- Additive migration: preserve v1 questions/files. Existing unreviewed material becomes pending.
alter table public.bank_members drop constraint bank_members_role_check;
alter table public.bank_members add constraint bank_members_role_check check(role in ('owner','reviewer','teacher'));
alter table public.bank_questions add column archived boolean not null default false;
alter table public.bank_revisions add column visibility text not null default 'shared_pending' check(visibility in ('private','shared_pending','approved'));
alter table public.bank_revisions add column review_version integer not null default 0;
alter table public.bank_revisions add column reviewer_id uuid references auth.users;
alter table public.bank_revisions add column reviewed_at timestamptz;
alter table public.bank_revisions add column change_reason text;
create table public.bank_catalog(revision_id uuid primary key references public.bank_revisions,space_id uuid not null references public.bank_spaces,question_id uuid not null references public.bank_questions,commit_id uuid not null references public.bank_entries,metadata jsonb not null,content jsonb not null,files jsonb not null,confirmed jsonb not null default '{}',created_at timestamptz not null default now());
create table public.bank_revision_files(revision_id uuid references public.bank_revisions,file_id uuid references public.bank_entries,primary key(revision_id,file_id));
create index bank_revision_files_file on public.bank_revision_files(file_id);
create table public.bank_proposals(id uuid primary key default gen_random_uuid(),revision_id uuid not null references public.bank_revisions,author_id uuid not null references auth.users,author_email text not null,patch jsonb not null,reason text not null,status text not null default 'pending' check(status in ('pending','accepted','rejected')),base_review_version integer not null,created_at timestamptz not null default now(),reviewed_by uuid references auth.users);
create table public.bank_personal(user_id uuid references auth.users,question_id uuid references public.bank_questions,note text not null default '',favorite boolean not null default false,primary key(user_id,question_id));
create table public.bank_taxonomy(space_id uuid references public.bank_spaces,id uuid not null,label text not null,kind text not null,parent_id uuid,version integer not null default 1,retired boolean not null default false,primary key(space_id,id));

create function public.bank_reviewer(s uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.bank_member(s) and exists(select 1 from public.bank_members m join auth.users u on u.id=auth.uid() where m.space_id=s and m.email=lower(u.email) and m.role in ('owner','reviewer')) $$;
create function public.bank_read_revision(r uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bank_revisions v join public.bank_questions q on q.id=v.question_id where v.id=r and public.bank_member(q.space_id) and (not q.archived or public.bank_member(q.space_id,true)) and (v.actor_id=auth.uid() or (v.committed and (v.visibility='approved' or (v.visibility='shared_pending' and public.bank_reviewer(q.space_id))))));
$$;
create function public.bank_read_folder(f uuid) returns boolean language sql stable security definer set search_path='' as $$
 with recursive visible(id,parent_id) as (
 select e.id,e.parent_id from public.bank_entries e where e.kind='file' and public.bank_member(e.space_id) and (e.owner_id=auth.uid() or (e.verified and exists(select 1 from public.bank_revision_files rf where rf.file_id=e.id and public.bank_read_revision(rf.revision_id))))
 union select p.id,p.parent_id from public.bank_entries p join visible child on child.parent_id=p.id
 ) select exists(select 1 from visible where id=f);
$$;
revoke all on function public.bank_read_folder(uuid) from public,anon,authenticated;
create function public.bank_read_entry(f uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bank_entries e where e.id=f and public.bank_member(e.space_id) and ((e.kind='folder' and (e.id=e.space_id or public.bank_read_folder(e.id))) or e.owner_id=auth.uid() or (e.verified and exists(select 1 from public.bank_revision_files rf where rf.file_id=e.id and public.bank_read_revision(rf.revision_id)))));
$$;
drop policy member_read on public.bank_audit;
create policy member_read on public.bank_audit for select to authenticated using(public.bank_member(space_id) and (public.bank_member(space_id,true) or actor_id=auth.uid()));
drop policy member_read on public.bank_questions;
create policy member_read on public.bank_questions for select to authenticated using(public.bank_member(space_id) and (owner_id=auth.uid() or exists(select 1 from public.bank_revisions r where r.question_id=bank_questions.id and public.bank_read_revision(r.id))));
drop policy member_read on public.bank_revisions;
create policy member_read on public.bank_revisions for select to authenticated using(public.bank_read_revision(id));
drop policy member_read on public.bank_entries;
create policy member_read on public.bank_entries for select to authenticated using(public.bank_read_entry(id));
create or replace function public.bank_object_allowed(object_name text, writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bank_entries e where object_name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[0-9]{3}$' and e.id::text=split_part(object_name,'/',2) and e.space_id::text=split_part(object_name,'/',1) and split_part(object_name,'/',3)::integer<e.chunks and public.bank_member(e.space_id) and case when writing then e.owner_id=auth.uid() and not e.verified else public.bank_read_entry(e.id) end);
$$;
alter table public.bank_catalog enable row level security;
alter table public.bank_revision_files enable row level security;
alter table public.bank_proposals enable row level security;
alter table public.bank_personal enable row level security;
alter table public.bank_taxonomy enable row level security;
create policy read_catalog on public.bank_catalog for select to authenticated using(public.bank_read_revision(revision_id));
create policy read_files on public.bank_revision_files for select to authenticated using(public.bank_read_revision(revision_id));
create policy read_proposals on public.bank_proposals for select to authenticated using(public.bank_read_revision(revision_id) and (author_id=auth.uid() or exists(select 1 from public.bank_questions q join public.bank_revisions r on r.question_id=q.id where r.id=revision_id and public.bank_reviewer(q.space_id))));
create policy read_personal on public.bank_personal for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.bank_questions q where q.id=question_id and public.bank_member(q.space_id)));
create policy read_taxonomy on public.bank_taxonomy for select to authenticated using(public.bank_member(space_id));
revoke all on public.bank_catalog,public.bank_revision_files,public.bank_proposals,public.bank_personal,public.bank_taxonomy from anon,authenticated;
grant select on public.bank_catalog,public.bank_revision_files,public.bank_proposals,public.bank_personal,public.bank_taxonomy to authenticated;

create function public.bank_set_role(s uuid,email_address text,new_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.bank_member(s,true) or new_role not in ('reviewer','teacher') then raise insufficient_privilege; end if;
 update public.bank_members set role=new_role where space_id=s and email=lower(trim(email_address)) and role<>'owner';if not found then raise exception '변경 가능한 회원이 없습니다.';end if;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'role:'||new_role,email_address);
end $$;
create function public.bank_set_visibility(r uuid,v text,reason text) returns void language plpgsql security definer set search_path='' as $$
declare q public.bank_questions; begin
 select b.* into q from public.bank_questions b join public.bank_revisions x on x.question_id=b.id where x.id=r;
 if not public.bank_member(q.space_id) or q.owner_id<>auth.uid() or v not in ('private','shared_pending') then raise insufficient_privilege; end if;
 if exists(select 1 from public.bank_revisions where id=r and visibility='approved') then raise exception '확정 버전은 바꾸지 말고 새 버전 또는 수정안을 등록하세요.'; end if;
 update public.bank_revisions set visibility=v,change_reason=left(reason,2000) where id=r;
end $$;
create function public.bank_valid_patch(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text; begin
 if p is null or jsonb_typeof(p)<>'object' then return false;end if;
 for k in select jsonb_object_keys(p) loop if k not in ('tags','primaryUnit','unitId','type','typeId','difficulty','sharingNote','sharingAllowed') then return false;end if;end loop;
 if p ? 'difficulty' and p->'difficulty'<>'null'::jsonb and (p->>'difficulty' !~ '^-?[0-9]+\.[0-9]$' or (p->>'difficulty')::numeric>10) then return false;end if;
 if p ? 'tags' and jsonb_typeof(p->'tags')<>'array' then return false;end if;
 if p ? 'sharingAllowed' and jsonb_typeof(p->'sharingAllowed')<>'boolean' then return false;end if;
 return octet_length(p::text)<=20000;
end $$;
create function public.bank_patch_taxonomy(s uuid,p jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare key_name text;label_name text;label_value text;begin
 for key_name,label_name in select * from (values('unitId','primaryUnit'),('typeId','type')) as names(k,l) loop
  if p ? key_name and p->key_name<>'null'::jsonb then
   select label into label_value from public.bank_taxonomy where space_id=s and id::text=p->>key_name and kind=case when key_name='unitId' then 'unit' else 'type' end and not retired;
   if not found then raise exception '공동 분류 기준이 없거나 사용 중지되었습니다.';end if;
   p=p||jsonb_build_object(label_name,label_value);
  end if;
 end loop;return p;end $$;
revoke all on function public.bank_patch_taxonomy(uuid,jsonb) from public,anon,authenticated;
create function public.bank_propose(r uuid,p jsonb,reason_text text,expected integer) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;begin
 if not public.bank_read_revision(r) then raise insufficient_privilege;end if;
 if not public.bank_valid_patch(p) or length(trim(reason_text))<1 then raise exception '수정 내용·이유를 확인하세요.';end if;
 if not exists(select 1 from public.bank_revisions where id=r and review_version=expected) then raise exception '검수 정보가 바뀌었습니다. 다시 읽어 주세요.';end if;
 p=public.bank_patch_taxonomy((select q.space_id from public.bank_questions q join public.bank_revisions v on v.question_id=q.id where v.id=r),p);
 insert into public.bank_proposals(revision_id,author_id,author_email,patch,reason,base_review_version) values(r,auth.uid(),(select email from auth.users where id=auth.uid()),p,left(reason_text,2000),expected) returning id into result;return result;
end $$;
create function public.bank_review(r uuid,p jsonb,reason_text text,expected integer,approve boolean default true,proposal uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare s uuid;v public.bank_revisions;before_value jsonb;begin
 select q.space_id into s from public.bank_questions q join public.bank_revisions x on x.question_id=q.id where x.id=r;
 if not public.bank_reviewer(s) or not public.bank_read_revision(r) then raise insufficient_privilege;end if;
 select * into v from public.bank_revisions where id=r for update;
 if not v.committed or v.review_version<>expected then raise exception '동시 수정이 있습니다. 다시 읽고 비교하세요.';end if;
 if not public.bank_valid_patch(p) or length(trim(reason_text))<1 then raise exception '검수 내용·이유를 확인하세요.';end if;
 if proposal is not null and not exists(select 1 from public.bank_proposals where id=proposal and revision_id=r and status='pending' and base_review_version=expected and patch=p) then raise exception '수정안이 변경되었습니다.';end if;
 p=public.bank_patch_taxonomy(s,p);
 select confirmed into before_value from public.bank_catalog where revision_id=r;
 if approve and coalesce((p->>'sharingAllowed')::boolean,(before_value->>'sharingAllowed')::boolean,false) is not true then raise exception '공동 이용 가능 여부를 확인해야 승인할 수 있습니다.';end if;
 update public.bank_catalog set confirmed=confirmed||p where revision_id=r;
 update public.bank_revisions set visibility=case when approve then 'approved' else 'shared_pending' end,review_version=review_version+1,reviewer_id=auth.uid(),reviewed_at=now(),change_reason=left(reason_text,2000) where id=r;
 if proposal is not null then update public.bank_proposals set status='accepted',reviewed_by=auth.uid() where id=proposal;end if;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'review',jsonb_build_object('revision',r,'before',before_value,'after',before_value||p,'reason',reason_text,'approved',approve)::text);
end $$;
create function public.bank_personal_save(q uuid,n text,f boolean) returns void language plpgsql security definer set search_path='' as $$
begin if not exists(select 1 from public.bank_revisions where question_id=q and public.bank_read_revision(id)) then raise insufficient_privilege;end if;
 insert into public.bank_personal values(auth.uid(),q,left(n,10000),f) on conflict(user_id,question_id) do update set note=excluded.note,favorite=excluded.favorite;end $$;
create function public.bank_archive(q uuid,archived_value boolean,reason_text text) returns void language plpgsql security definer set search_path='' as $$
declare s uuid;begin select space_id into s from public.bank_questions where id=q;
 if not public.bank_member(s,true) then raise insufficient_privilege;end if;
 if length(trim(reason_text))<1 then raise exception '사유를 입력하세요.';end if;
 update public.bank_questions set archived=archived_value where id=q;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),case when archived_value then 'archive' else 'restore' end,q::text||':'||left(reason_text,2000));end $$;
create function public.bank_taxonomy_save(s uuid,item uuid,label_value text,kind_value text,parent_value uuid,expected integer,retired_value boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin if not public.bank_member(s,true) then raise insufficient_privilege;end if;
 if length(trim(label_value))<1 or kind_value not in ('unit','type','concept') then raise exception '분류 이름과 종류를 확인하세요.';end if;
 if expected=0 then insert into public.bank_taxonomy values(s,item,left(label_value,200),kind_value,parent_value,1,retired_value);
 else update public.bank_taxonomy set label=left(label_value,200),kind=kind_value,parent_id=parent_value,version=version+1,retired=retired_value where space_id=s and id=item and version=expected;if not found then raise exception '분류가 바뀌었습니다. 다시 읽으세요.';end if;end if;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'taxonomy',item::text||':'||label_value);end $$;

-- Verified commit metadata is a query index, not a replacement for the native file.
drop function public.bank_finish(uuid,uuid);
create function public.bank_finish(f uuid,actor uuid,record jsonb default null) returns void language plpgsql security definer set search_path='' as $$
declare e public.bank_entries;d jsonb;begin
 select * into e from public.bank_entries where id=f for update;
 if e.owner_id is distinct from actor or not exists(select 1 from public.bank_members m join auth.users u on u.id=actor where m.space_id=e.space_id and m.enabled and m.email=lower(u.email) and (m.user_id is null or m.user_id=actor) and u.email_confirmed_at is not null) then raise insufficient_privilege;end if;
 if e.props->>'role'='commit' then
  if record is null or record->>'revisionId' is distinct from e.props->>'revisionId' then raise exception '검증된 완료 기록이 필요합니다.';end if;
  insert into public.bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files) values((e.props->>'revisionId')::uuid,e.space_id,(e.props->>'questionId')::uuid,e.id,record->'metadata',coalesce(record->'content','{}'),record->'files') on conflict do nothing;
  for d in select * from jsonb_array_elements(record->'files') loop insert into public.bank_revision_files values((e.props->>'revisionId')::uuid,(d->>'id')::uuid) on conflict do nothing;end loop;
  insert into public.bank_revision_files values((e.props->>'revisionId')::uuid,f) on conflict do nothing;
  update public.bank_revisions set committed=true where id=(e.props->>'revisionId')::uuid and actor_id=actor;if not found then raise insufficient_privilege;end if;
  if not e.verified then insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(e.space_id,actor,(select email from auth.users where id=actor),'commit',e.props->>'revisionId');end if;
 end if;
 update public.bank_entries set verified=true where id=f;
end $$;

create or replace function public.bank_commits(s uuid,q uuid default null,start_at integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
begin if not public.bank_member(s) then raise insufficient_privilege;end if;
 if start_at<0 then raise exception '잘못된 페이지';end if;
 return coalesce((select jsonb_agg(v.entry) from (select to_jsonb(e)||jsonb_build_object('author',jsonb_build_object('id',b.owner_id,'email',b.owner_email)) as entry from public.bank_entries e join public.bank_questions b on b.id=(e.props->>'questionId')::uuid where e.space_id=s and e.verified and e.props->>'role'='commit' and public.bank_read_revision((e.props->>'revisionId')::uuid) and (q is null or b.id=q) order by e.created_at desc,e.id desc limit 100 offset start_at) v),'[]'::jsonb);end $$;
create function public.bank_search(s uuid,filters jsonb default '{}',start_at integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
begin if not public.bank_member(s) then raise insufficient_privilege;end if;
 if start_at<0 then raise exception '잘못된 페이지';end if;
 return coalesce((select jsonb_agg(to_jsonb(t)) from (select c.revision_id,c.space_id,c.question_id,c.commit_id,c.metadata,c.confirmed,c.created_at,jsonb_build_object('body',left(c.content->>'body',350)) as content,(select coalesce(jsonb_agg(f),'[]'::jsonb) from jsonb_array_elements(c.files) f where f->>'role'='preview') as files,r.visibility,r.review_version,r.reviewer_id,r.reviewed_at,r.change_reason,q.owner_email,q.archived from public.bank_catalog c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id where c.space_id=s and public.bank_read_revision(r.id)
 and (coalesce(filters->>'text','')='' or (c.metadata::text||c.content::text||c.confirmed::text) ilike '%'||(filters->>'text')||'%')
 and (coalesce(filters->>'school','')='' or c.metadata#>>'{source,school}'=filters->>'school')
 and (coalesce(filters->>'academicYear','')='' or c.metadata#>>'{source,academicYear}'=filters->>'academicYear')
 and (coalesce(filters->>'grade','')='' or c.metadata#>>'{source,grade}'=filters->>'grade')
 and (coalesce(filters->>'semester','')='' or c.metadata#>>'{source,semester}'=filters->>'semester')
 and (coalesce(filters->>'unit','')='' or coalesce((select label from public.bank_taxonomy where space_id=s and id::text=c.confirmed->>'unitId'),c.confirmed->>'primaryUnit',c.metadata#>>'{classification,primaryUnit,name}')=filters->>'unit')
 and (coalesce(filters->>'type','')='' or coalesce((select label from public.bank_taxonomy where space_id=s and id::text=c.confirmed->>'typeId'),c.confirmed->>'type')=filters->>'type')
 and (coalesce(filters->>'owner','')='' or q.owner_email=filters->>'owner')
 and (coalesce(filters->>'status','')='' or r.visibility=filters->>'status')
 and (not(filters?'min') or (c.confirmed->>'difficulty')::numeric >= (filters->>'min')::numeric)
 and (not(filters?'max') or (c.confirmed->>'difficulty')::numeric <= (filters->>'max')::numeric)
 order by c.created_at desc,c.revision_id desc limit 50 offset start_at) t),'[]'::jsonb);end $$;
create function public.bank_usage(s uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin if not public.bank_member(s,true) then raise insufficient_privilege;end if;
 return jsonb_build_object('questions',(select count(*) from public.bank_questions where space_id=s),'versions',(select count(*) from public.bank_revisions r join public.bank_questions q on q.id=r.question_id where q.space_id=s),'reservedBytes',(select coalesce(sum(size),0) from public.bank_entries where space_id=s),'verifiedBytes',(select coalesce(sum(size),0) from public.bank_entries where space_id=s and verified),'actualStorageBytes',(select coalesce(sum((metadata->>'size')::bigint),0) from storage.objects where bucket_id='question-bank' and split_part(name,'/',1)=s::text),'egress',null,'billingMeasured',false);end $$;

-- Explicit RPC grants: default PUBLIC execute must not expose definer functions.
revoke execute on function public.bank_reviewer(uuid),public.bank_read_revision(uuid),public.bank_read_entry(uuid),public.bank_set_role(uuid,text,text),public.bank_set_visibility(uuid,text,text),public.bank_valid_patch(jsonb),public.bank_propose(uuid,jsonb,text,integer),public.bank_review(uuid,jsonb,text,integer,boolean,uuid),public.bank_personal_save(uuid,text,boolean),public.bank_archive(uuid,boolean,text),public.bank_taxonomy_save(uuid,uuid,text,text,uuid,integer,boolean),public.bank_finish(uuid,uuid,jsonb),public.bank_search(uuid,jsonb,integer),public.bank_usage(uuid) from public,anon,authenticated;
grant execute on function public.bank_reviewer(uuid),public.bank_read_revision(uuid),public.bank_read_entry(uuid),public.bank_set_role(uuid,text,text),public.bank_set_visibility(uuid,text,text),public.bank_propose(uuid,jsonb,text,integer),public.bank_review(uuid,jsonb,text,integer,boolean,uuid),public.bank_personal_save(uuid,text,boolean),public.bank_archive(uuid,boolean,text),public.bank_taxonomy_save(uuid,uuid,text,text,uuid,integer,boolean),public.bank_search(uuid,jsonb,integer),public.bank_usage(uuid) to authenticated;
grant execute on function public.bank_finish(uuid,uuid,jsonb) to service_role;
create function public.bank_audit_export(s uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin if not public.bank_member(s,true) then raise insufficient_privilege;end if;return coalesce((select jsonb_agg(to_jsonb(a) order by id) from public.bank_audit a where space_id=s),'[]'::jsonb);end $$;
revoke execute on function public.bank_audit_export(uuid) from public,anon;
grant execute on function public.bank_audit_export(uuid) to authenticated;
