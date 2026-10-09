-- Captured read-only production definition; isolated test replay only.
CREATE OR REPLACE FUNCTION public.bank_revision_prune_plan(s uuid, manifest jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rid uuid;rev public.bank_revisions;e public.bank_entries;f jsonb;
 ids uuid[]:='{}';eligible uuid[]:='{}';approved uuid[];reason text;
 force_past boolean:=coalesce(manifest->>'retentionPolicy','')='all_past_files';
 files jsonb:='[]';excluded jsonb:='[]';names jsonb;bytes bigint;result jsonb;context text;inventory_token text;
begin
 if not public.bank_member(s,true) then raise insufficient_privilege;end if;
 if force_past and (manifest->>'acknowledgeHistoryUnavailable') is distinct from 'true' then raise exception 'Explicit past-history deletion acknowledgement required';end if;
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
 elsif not force_past and rev.parent_id is null then reason:='original_root';
 elsif not exists(select 1 from public.bank_catalog where revision_id=rid) then reason:='missing_catalog';
 elsif (not force_past and not exists(select 1 from public.bank_revisions where parent_id=rid and committed))
   or rid=(select c.revision_id from public.bank_catalog c where c.question_id=rev.question_id order by c.created_at desc,c.revision_id desc limit 1) then reason:='current_head';
 elsif not force_past and exists(select 1 from public.bank_revisions where parent_id=rid and not committed) then reason:='incomplete_base';
 elsif not force_past and (exists(select 1 from public.bank_exam_drafts d,jsonb_array_elements(d.document->'items') i where i->>'revisionId'=rid::text)
   or exists(select 1 from public.bank_exam_history h,jsonb_array_elements(h.document->'items') i where i->>'revisionId'=rid::text)) then reason:='exam_or_history_pin';
 elsif not force_past and exists(select 1 from public.bank_maintenance_items where base_id=rid or result_id=rid) then reason:='maintenance';
 elsif not force_past and (exists(select 1 from public.bank_proposals where revision_id=rid)
   or exists(select 1 from public.bank_difficulty_ratings where revision_id=rid)
   or exists(select 1 from public.bank_scope_evidence where revision_id=rid)) then reason:='review_or_evidence';
 elsif exists(select 1 from public.bank_question_deletions where question_id=rev.question_id) then reason:='question_deletion';
 elsif not force_past and exists(select 1 from public.bank_catalog c where c.revision_id<>rid and jsonb_path_exists(c.metadata,'$.** ? (@ == $target)',jsonb_build_object('target',rid::text))) then reason:='content_relation';
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
 'policy',case when force_past then 'all_past_files_keep_current_source_lineage_and_receipts' else 'payload_only_keep_lineage_and_audit_tombstones' end);
 return result||jsonb_build_object('token',md5(manifest::text||result::text));
end $function$
;
