-- LOCAL PROPOSAL ONLY. Not in migrations, not applied to production.
-- Retire approved OLD payloads, keeping revision IDs/parent links and audit
-- tombstones. Existing owner gate and confirmed Storage DELETE policy reused.
begin;
create table public.bank_revision_prunes(
 id uuid primary key, space_id uuid not null references public.bank_spaces,
 actor_id uuid not null references auth.users, token text not null,
 manifest jsonb not null, plan jsonb not null, completed boolean not null default false,
 created_at timestamptz not null default now(), completed_at timestamptz);
create table public.bank_revision_prune_marks(
 revision_id uuid primary key references public.bank_revisions,
 job_id uuid not null references public.bank_revision_prunes,
 receipt jsonb not null);
alter table public.bank_revision_prunes enable row level security;
alter table public.bank_revision_prune_marks enable row level security;
revoke all on public.bank_revision_prunes,public.bank_revision_prune_marks from public,anon,authenticated;

create function public.bank_revision_prune_plan(s uuid,manifest jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rid uuid;rev public.bank_revisions;e public.bank_entries;f jsonb;
 ids uuid[]:='{}';eligible uuid[]:='{}';approved uuid[];reason text;
 files jsonb:='[]';excluded jsonb:='[]';names jsonb;bytes bigint;result jsonb;context text;inventory_token text;
begin
 if not public.bank_member(s,true) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended('revision-prune:'||s::text,0));
 if manifest->>'spaceId' is distinct from s::text or manifest->>'schema' is distinct from '1'
 or jsonb_typeof(manifest->'files') is distinct from 'array'
 or jsonb_typeof(manifest->'revisions') is distinct from 'array'
 or jsonb_array_length(manifest->'files')>2000 or jsonb_array_length(manifest->'revisions')>1000
 or length(manifest::text)>1000000 or coalesce(manifest->>'approvalHash','') !~ '^[a-f0-9]{64}$'
 or coalesce((manifest->>'ceilingBytes')::bigint,-1)<0 then raise exception 'Invalid approved manifest';end if;
 select array_agg((x->>'id')::uuid order by x->>'id') into approved from jsonb_array_elements(manifest->'files') x;
 if cardinality(approved) is distinct from (select count(distinct x) from unnest(approved) x)
 or (select count(distinct x) from jsonb_array_elements_text(manifest->'revisions') x)<>jsonb_array_length(manifest->'revisions')
 then raise exception 'Duplicate manifest ID';end if;
 for rid in select x::uuid from jsonb_array_elements_text(manifest->'revisions') x order by x loop
  select r.* into rev from public.bank_revisions r join public.bank_questions q on q.id=r.question_id where r.id=rid and q.space_id=s;
  reason:=null;
  if not found then reason:='missing_or_foreign_revision';
  elsif exists(select 1 from public.bank_revision_prune_marks where revision_id=rid) then reason:='already_frozen_or_retired';
  elsif not rev.committed then reason:='incomplete';
  elsif rev.parent_id is null then reason:='original_root';
  elsif not exists(select 1 from public.bank_catalog where revision_id=rid) then reason:='missing_catalog';
  elsif not exists(select 1 from public.bank_revisions where parent_id=rid and committed)
   or rid=(select c.revision_id from public.bank_catalog c where c.question_id=rev.question_id order by c.created_at desc,c.revision_id desc limit 1) then reason:='current_head';
  elsif exists(select 1 from public.bank_revisions where parent_id=rid and not committed) then reason:='incomplete_base';
  elsif exists(select 1 from public.bank_exam_drafts d,jsonb_array_elements(d.document->'items') i where i->>'revisionId'=rid::text)
   or exists(select 1 from public.bank_exam_history h,jsonb_array_elements(h.document->'items') i where i->>'revisionId'=rid::text) then reason:='exam_or_history_pin';
  elsif exists(select 1 from public.bank_maintenance_items where base_id=rid or result_id=rid) then reason:='maintenance';
  elsif exists(select 1 from public.bank_proposals where revision_id=rid)
   or exists(select 1 from public.bank_difficulty_ratings where revision_id=rid)
   or exists(select 1 from public.bank_scope_evidence where revision_id=rid) then reason:='review_or_evidence';
  elsif exists(select 1 from public.bank_question_deletions where question_id=rev.question_id) then reason:='question_deletion';
  elsif exists(select 1 from public.bank_catalog c where c.revision_id<>rid and jsonb_path_exists(c.metadata,'$.** ? (@ == $target)',jsonb_build_object('target',rid::text))) then reason:='content_relation';
  elsif exists(select 1 from public.bank_revision_files l join public.bank_entries b on b.id=l.file_id where l.revision_id=rid and b.props->>'role'<>'source' and not(b.id=any(approved)))
   or exists(select 1 from public.bank_catalog c where c.revision_id=rid and (not(c.commit_id=any(approved))
    or exists(select 1 from jsonb_array_elements(c.files) d join public.bank_entries b on b.id=(d->>'id')::uuid where b.props->>'role'<>'source' and not(b.id=any(approved))))) then reason:='approval_missing_file';
  end if;
  if reason is null then ids:=array_append(ids,rid);else excluded:=excluded||jsonb_build_array(jsonb_build_object('revisionId',rid,'reason',reason));end if;
 end loop;
 for f in select x from jsonb_array_elements(manifest->'files') x order by x->>'id' loop
  select * into e from public.bank_entries where id=(f->>'id')::uuid and space_id=s;
  if not found or e.kind<>'file' or not e.verified or e.props->>'role' is null or e.props->>'role'='source'
   or not exists(select 1 from public.bank_revision_files where file_id=e.id and revision_id=any(ids)) then continue;end if;
  if e.size is distinct from (f->>'size')::bigint or e.sha256 is distinct from f->>'sha256'
   or e.chunks is distinct from (f->>'chunks')::integer or e.chunks<>ceil(e.size::numeric/6291456)::integer then raise sqlstate 'PT409' using message='Approved file changed';end if;
  -- Shared files survive, including catalog-only and incomplete references.
  if exists(select 1 from public.bank_revision_files where file_id=e.id and not(revision_id=any(ids)))
   or exists(select 1 from public.bank_catalog c where not(c.revision_id=any(ids)) and (c.commit_id=e.id or c.files @> jsonb_build_array(jsonb_build_object('id',e.id::text))))
   or exists(select 1 from public.bank_entries where parent_id=e.id)
   or exists(select 1 from public.bank_revision_prunes j,jsonb_array_elements(j.plan->'files') x where x->>'id'=e.id::text)
   or (e.props ? 'revisionId' and not((e.props->>'revisionId')::uuid=any(ids))) then continue;end if;
  -- Read actual inventory, not generated object names. Reject unknown, extra,
  -- missing, or wrong-sized chunks rather than guessing Storage contents.
  select coalesce(jsonb_agg(o.name order by o.name),'[]'),coalesce(sum((o.metadata->>'size')::bigint),0) into names,bytes
   from storage.objects o where o.bucket_id='question-bank' and o.name like s::text||'/'||e.id::text||'/%'
   and o.metadata->>'size' ~ '^[0-9]+$';
  if jsonb_array_length(names)<>e.chunks or bytes<>e.size
   or (select count(*) from storage.objects o where o.bucket_id='question-bank' and o.name like s::text||'/'||e.id::text||'/%')<>e.chunks
   or exists(select 1 from generate_series(0,e.chunks-1) n where not exists(select 1 from storage.objects o where o.bucket_id='question-bank'
    and o.name=s::text||'/'||e.id::text||'/'||lpad(n::text,3,'0') and (o.metadata->>'size')::bigint=least(6291456,e.size-n::bigint*6291456)))
   then raise sqlstate 'PT409' using message='Storage inventory incomplete or changed';end if;
  select md5(string_agg(to_jsonb(o)::text,'' order by o.name)) into inventory_token from storage.objects o where o.bucket_id='question-bank' and o.name like s::text||'/'||e.id::text||'/%';
  files:=files||jsonb_build_array(jsonb_build_object('id',e.id,'chunks',e.chunks,'size',e.size,'sha256',e.sha256,'objectNames',names,'inventoryToken',inventory_token));
 end loop;
 select coalesce(array_agg(distinct l.revision_id order by l.revision_id),'{}') into eligible from public.bank_revision_files l,jsonb_array_elements(files) item where l.file_id=(item->>'id')::uuid and l.revision_id=any(ids);
 if (select coalesce(sum((item->>'size')::bigint),0) from jsonb_array_elements(files) item)>(manifest->>'ceilingBytes')::bigint then raise exception 'Approval ceiling exceeded';end if;
 -- CAS includes relevant state beyond selected files. No hidden owner pins leaked.
 select md5(coalesce((select string_agg(to_jsonb(c)::text,'' order by c.revision_id) from public.bank_catalog c where c.space_id=s),'')||
  coalesce((select string_agg(to_jsonb(r)::text,'' order by r.id) from public.bank_revisions r join public.bank_questions q on q.id=r.question_id where q.space_id=s),'')||
  coalesce((select string_agg(d.document::text,'' order by d.id) from public.bank_exam_drafts d where d.space_id=s),'')||
  coalesce((select string_agg(h.document::text,'' order by h.exam_id,h.version) from public.bank_exam_history h join public.bank_exam_drafts d on d.id=h.exam_id where d.space_id=s),'')) into context;
 result:=jsonb_build_object('spaceId',s,'revisions',to_jsonb(eligible),'files',files,'excluded',excluded,'context',context,
 'bytes',(select coalesce(sum((x->>'size')::bigint),0) from jsonb_array_elements(files) x),
 'policy','payload_only_keep_lineage_and_audit_tombstones');
 return result||jsonb_build_object('token',md5(manifest::text||result::text));
end $$;

create function public.bank_revision_prune_claim(s uuid,j uuid,manifest jsonb,expected_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old public.bank_revision_prunes;p jsonb;rid uuid;begin
 if not public.bank_member(s,true) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended('revision-prune:'||s::text,0));
 select * into old from public.bank_revision_prunes where id=j for update;
 if found then
  if old.space_id<>s or old.actor_id<>auth.uid() or old.token<>expected_token or old.manifest<>manifest then raise sqlstate 'PT409' using message='Claim identity changed';end if;
  return old.plan||jsonb_build_object('jobId',j,'complete',old.completed,'resuming',true);
 end if;
 p:=public.bank_revision_prune_plan(s,manifest);
 if p->>'token' is distinct from expected_token then raise sqlstate 'PT409' using message='References changed; run dry-run again';end if;
 if jsonb_array_length(p->'files')=0 then raise exception 'No eligible approved files';end if;
 insert into public.bank_revision_prunes(id,space_id,actor_id,token,manifest,plan) values(j,s,auth.uid(),expected_token,manifest,p);
 for rid in select x::uuid from jsonb_array_elements_text(p->'revisions') x loop
  insert into public.bank_revision_prune_marks(revision_id,job_id,receipt)
   select rid,j,jsonb_build_object('revision',to_jsonb(r),'catalog',to_jsonb(c),'files',(select jsonb_agg(to_jsonb(e)) from public.bank_revision_files l join public.bank_entries e on e.id=l.file_id where l.revision_id=rid))
   from public.bank_revisions r join public.bank_catalog c on c.revision_id=r.id where r.id=rid;
 end loop;
 return p||jsonb_build_object('jobId',j,'complete',false);
end $$;

create function public.bank_revision_prune_status(s uuid,j uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.bank_revision_prunes;begin
 if not public.bank_member(s,true) then raise insufficient_privilege;end if;
 select * into job from public.bank_revision_prunes where id=j;
 if not found then return jsonb_build_object('exists',false);end if;
 if job.space_id<>s or job.actor_id<>auth.uid() then raise insufficient_privilege;end if;
 return jsonb_build_object('exists',true,'complete',job.completed,'token',job.token,'approvalHash',job.manifest->>'approvalHash','bytes',job.plan->'bytes');
end $$;

create function public.bank_revision_prune_freeze_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare v jsonb:=to_jsonb(new);s uuid;refs text[]:='{}';frefs text[]:='{}';x jsonb;begin
 -- Same space serialization for ALL reference writers closes claim/pin races.
 s:=nullif(v->>'space_id','')::uuid;
 if s is null and v ? 'question_id' then select space_id into s from public.bank_questions where id=(v->>'question_id')::uuid;end if;
 if s is null and v ? 'exam_id' then select space_id into s from public.bank_exam_drafts where id=(v->>'exam_id')::uuid;end if;
 if s is null and v ? 'revision_id' then select q.space_id into s from public.bank_revisions r join public.bank_questions q on q.id=r.question_id where r.id=(v->>'revision_id')::uuid;end if;
 if tg_table_schema='storage' then
  if new.bucket_id<>'question-bank' or new.name !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/' then return new;end if;
  s:=split_part(new.name,'/',1)::uuid;frefs:=array_append(frefs,split_part(new.name,'/',2));
 end if;
 if s is not null then perform pg_advisory_xact_lock(hashtextextended('revision-prune:'||s::text,0));end if;
 foreach x in array ARRAY[to_jsonb(v->>'revision_id'),to_jsonb(v->>'base_id'),to_jsonb(v->>'result_id')] loop
  if x is not null then refs:=array_append(refs,x#>>'{}');end if;
 end loop;
 if tg_table_name='bank_revisions' then refs:=refs||ARRAY[new.id::text,new.parent_id::text];end if;
 if tg_table_name='bank_entries' then frefs:=array_append(frefs,new.id::text);refs:=array_append(refs,new.props->>'revisionId');end if;
 if v ? 'file_id' then frefs:=array_append(frefs,v->>'file_id');end if;
 if v ? 'commit_id' then frefs:=array_append(frefs,v->>'commit_id');end if;
 for x in select * from jsonb_array_elements(coalesce(v->'files','[]')) loop frefs:=array_append(frefs,x->>'id');end loop;
 for x in select * from jsonb_array_elements(coalesce(v#>'{document,items}','[]')) loop refs:=array_append(refs,x->>'revisionId');end loop;
 if v ? 'metadata' then
  for x in select jsonb_path_query(v->'metadata','$.**') loop
   if jsonb_typeof(x)='string' then refs:=array_append(refs,x#>>'{}');end if;
  end loop;
 end if;
 if exists(select 1 from public.bank_revision_prune_marks where revision_id::text=any(refs))
 or exists(select 1 from public.bank_revision_prunes j,jsonb_array_elements(j.plan->'files') f where f->>'id'=any(frefs))
 then raise sqlstate 'PT409' using message='Revision payload frozen or retired';end if;
 if tg_table_name='bank_question_deletions' and exists(select 1 from public.bank_revision_prune_marks m join public.bank_revisions r on r.id=m.revision_id where r.question_id=(v->>'question_id')::uuid)
 then raise sqlstate 'PT409' using message='Revision retirement audit retained';end if;
 return new;
end $$;
-- Existing reference guards remain installed; no ordinary data permission widened.
create trigger bank_prune_freeze before insert or update on public.bank_revisions for each row execute function public.bank_revision_prune_freeze_guard();
create trigger bank_prune_freeze before insert or update on public.bank_entries for each row execute function public.bank_revision_prune_freeze_guard();
create trigger bank_prune_freeze before insert or update on public.bank_revision_files for each row execute function public.bank_revision_prune_freeze_guard();
create trigger bank_prune_freeze before insert or update on public.bank_catalog for each row execute function public.bank_revision_prune_freeze_guard();
create trigger bank_prune_freeze before insert or update on public.bank_exam_drafts for each row execute function public.bank_revision_prune_freeze_guard();
create trigger bank_prune_freeze before insert or update on public.bank_exam_history for each row execute function public.bank_revision_prune_freeze_guard();
create trigger bank_prune_freeze before insert or update on public.bank_maintenance_items for each row execute function public.bank_revision_prune_freeze_guard();
create trigger bank_prune_freeze before insert or update on public.bank_proposals for each row execute function public.bank_revision_prune_freeze_guard();
create trigger bank_prune_freeze before insert or update on public.bank_difficulty_ratings for each row execute function public.bank_revision_prune_freeze_guard();
create trigger bank_prune_freeze before insert or update on public.bank_scope_evidence for each row execute function public.bank_revision_prune_freeze_guard();
create trigger bank_prune_freeze before insert on public.bank_question_deletions for each row execute function public.bank_revision_prune_freeze_guard();
create trigger bank_prune_freeze before insert or update on storage.objects for each row execute function public.bank_revision_prune_freeze_guard();

create or replace function public.bank_deletion_object_allowed(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bank_question_deletions j,jsonb_array_elements(j.files) f where not j.completed and public.bank_member(j.space_id,true)
 and object_name ~ ('^'||j.space_id::text||'/'||(f->>'id')||'/[0-9]{3}$'))
 or exists(select 1 from public.bank_revision_prunes j,jsonb_array_elements(j.plan->'files') f where not j.completed
  and j.actor_id=auth.uid() and public.bank_member(j.space_id,true) and f->'objectNames' @> to_jsonb(ARRAY[object_name]));
$$;

-- Do NOT hide retained bank_revisions metadata: clients derive the current
-- head from parent links. Hiding an intermediate row creates phantom heads.
-- Existing read authority stays intact; retired catalogs/commit files vanish
-- at finish and persistent reference guards reject new pins/base reuse.

create function public.bank_revision_prune_finish(s uuid,j uuid,expected_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.bank_revision_prunes;begin
 if not public.bank_member(s,true) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended('revision-prune:'||s::text,0));
 select * into job from public.bank_revision_prunes where id=j for update;
 if not found or job.space_id<>s or job.actor_id<>auth.uid() or job.token is distinct from expected_token then raise insufficient_privilege;end if;
 if job.completed then return jsonb_build_object('complete',true,'replayed',true,'bytes',job.plan->'bytes');end if;
 if exists(select 1 from storage.objects o,jsonb_array_elements(job.plan->'files') f where o.bucket_id='question-bank'
  and o.name like s::text||'/'||(f->>'id')||'/%') then raise exception 'Storage removal incomplete; resume same job';end if;
 -- No lineage/FK/audit rewriting. Frozen retired IDs remain permanent receipts.
 delete from public.bank_catalog where revision_id in(select x::uuid from jsonb_array_elements_text(job.plan->'revisions') x);
 delete from public.bank_revision_files where file_id in(select (f->>'id')::uuid from jsonb_array_elements(job.plan->'files') f);
 delete from public.bank_entries where id in(select (f->>'id')::uuid from jsonb_array_elements(job.plan->'files') f);
 update public.bank_revision_prunes set completed=true,completed_at=now() where id=j;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'revision_payload_prune',jsonb_build_object('jobId',j,'approvalHash',job.manifest->>'approvalHash','bytes',job.plan->'bytes')::text);
 return jsonb_build_object('complete',true,'bytes',job.plan->'bytes');
end $$;
revoke all on function public.bank_revision_prune_plan(uuid,jsonb),public.bank_revision_prune_claim(uuid,uuid,jsonb,text),public.bank_revision_prune_status(uuid,uuid),public.bank_revision_prune_finish(uuid,uuid,text),public.bank_revision_prune_freeze_guard() from public,anon,authenticated;
grant execute on function public.bank_revision_prune_plan(uuid,jsonb),public.bank_revision_prune_claim(uuid,uuid,jsonb,text),public.bank_revision_prune_status(uuid,uuid),public.bank_revision_prune_finish(uuid,uuid,text) to authenticated;
commit;
