-- LOCAL PROPOSAL ONLY: no operating execution, data rewrite, finalize or deletion.
-- Only the existing guard function body changes. No grants, RLS or trigger changes.
-- Baseline: actual operating function captured 2026-10-03T18:08:53Z.
-- Hashes normalize CRLF to LF; any other baseline difference aborts.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE target regprocedure; p pg_proc; signature jsonb;
BEGIN
 target:=to_regprocedure('public.bank_revision_prune_freeze_guard()');
 IF target IS NULL THEN RAISE EXCEPTION 'Expected freeze guard missing'; END IF;
 SELECT * INTO STRICT p FROM pg_proc WHERE oid=target;
 IF md5(replace(p.prosrc,E'\r\n',E'\n')) IS DISTINCT FROM '5e0e4cd0e7b354accfe05770a840d62a'
  OR p.prorettype<>'trigger'::regtype OR NOT p.prosecdef
  OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
 THEN RAISE EXCEPTION 'Freeze guard definition differs; stop for review'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgfoid=target
  AND t.tgrelid='public.bank_catalog'::regclass AND NOT t.tgisinternal
  AND t.tgenabled IN ('O','A') AND (t.tgtype::integer & 23)=23)
 THEN RAISE EXCEPTION 'Expected active catalog INSERT/UPDATE guard missing'; END IF;
 signature:=jsonb_build_object('function',jsonb_build_object('oid',p.oid,'owner',p.proowner,'acl',p.proacl::text,'language',p.prolang,'securityDefiner',p.prosecdef,'config',p.proconfig,'returnType',p.prorettype,'volatile',p.provolatile,'strict',p.proisstrict,'parallel',p.proparallel,'cost',p.procost,'rows',p.prorows),'triggers',(select coalesce(jsonb_agg(jsonb_build_object('oid',t.oid,'table',t.tgrelid,'name',t.tgname,'type',t.tgtype,'enabled',t.tgenabled,'args',encode(t.tgargs,'hex')) order by t.oid),'[]'::jsonb) from pg_trigger t where t.tgfoid=p.oid));
 PERFORM set_config('examstudio.audit_guard_signature',signature::text,true);
END $preflight$;

CREATE OR REPLACE FUNCTION public.bank_revision_prune_freeze_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb:=to_jsonb(new);s uuid;refs text[]:='{}';frefs text[]:='{}';x jsonb;scan_metadata jsonb;inherited_metadata jsonb;audit_path text[];audit_value jsonb;begin
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
 if tg_table_name='bank_revisions' then
 refs:=array_append(refs,new.id::text);
 if tg_op<>'UPDATE' then refs:=array_append(refs,new.parent_id::text);
 elsif new.parent_id is distinct from old.parent_id then refs:=array_append(refs,new.parent_id::text);end if;
 end if;
 if tg_table_name='bank_entries' then frefs:=array_append(frefs,new.id::text);refs:=array_append(refs,new.props->>'revisionId');end if;
 if v ? 'file_id' then frefs:=array_append(frefs,v->>'file_id');end if;
 if v ? 'commit_id' then frefs:=array_append(frefs,v->>'commit_id');end if;
 for x in select * from jsonb_array_elements(coalesce(v->'files','[]')) loop frefs:=array_append(frefs,x->>'id');end loop;
 for x in select * from jsonb_array_elements(coalesce(v#>'{document,items}','[]')) loop refs:=array_append(refs,x->>'revisionId');end loop;
 if v ? 'metadata' then
  -- Scan a copy only; NEW.metadata and every stored audit record stay intact.
  scan_metadata:=v->'metadata';
  if tg_table_schema='public' and tg_table_name='bank_catalog' and tg_op='INSERT' then
   select parent_catalog.metadata into inherited_metadata
   from public.bank_revisions child
   join public.bank_questions question on question.id=child.question_id
   join public.bank_revisions parent on parent.id=child.parent_id
    and parent.question_id=child.question_id and parent.committed
   join public.bank_catalog parent_catalog on parent_catalog.revision_id=parent.id
    and parent_catalog.question_id=child.question_id
    and parent_catalog.space_id=question.space_id
   where child.id=(v->>'revision_id')::uuid and not child.committed
    and child.question_id=(v->>'question_id')::uuid
    and question.space_id=(v->>'space_id')::uuid;
   if found then
    for audit_path in select p from (values
     (array['difficulty','assessment','revisionBinding','revisionId']),
     (array['difficulty','assessment','revisionBinding','fromRevisionId']),
     (array['difficulty','proofAdjustment','baseRevisionId'])
    ) allowed(p) loop
     audit_value:=scan_metadata#>audit_path;
     if jsonb_typeof(audit_value)='string'
      and audit_value is not distinct from inherited_metadata#>audit_path
      and exists(select 1 from public.bank_revision_prune_marks mark
       join public.bank_revisions audit_revision on audit_revision.id=mark.revision_id
       where mark.revision_id::text=audit_value#>>'{}'
        and audit_revision.question_id=(v->>'question_id')::uuid)
     then scan_metadata:=scan_metadata#-audit_path;end if;
    end loop;
   end if;
  end if;
 for x in select jsonb_path_query(scan_metadata,'$.**') loop
 if jsonb_typeof(x)='string' then
 if tg_op='UPDATE' then
 if not exists(select 1 from jsonb_path_query(coalesce(to_jsonb(old)->'metadata','{}'),'$.**') previous(value) where previous.value=x) then refs:=array_append(refs,x#>>'{}');end if;
 else refs:=array_append(refs,x#>>'{}');end if;
 end if;
 end loop;
 end if;
 if exists(select 1 from public.bank_revision_prune_marks where revision_id::text=any(refs))
 or exists(select 1 from public.bank_revision_prunes j,jsonb_array_elements(j.plan->'files') f where f->>'id'=any(frefs))
 then raise sqlstate 'PT409' using message='Revision payload frozen or retired';end if;
 if tg_table_name='bank_question_deletions' and exists(select 1 from public.bank_revision_prune_marks m join public.bank_revisions r on r.id=m.revision_id where r.question_id=(v->>'question_id')::uuid)
 then raise sqlstate 'PT409' using message='Revision retirement audit retained';end if;
 return new;
end $function$;

DO $postflight$
DECLARE p pg_proc; signature jsonb;
BEGIN
 SELECT * INTO STRICT p FROM pg_proc
  WHERE oid='public.bank_revision_prune_freeze_guard()'::regprocedure;
 IF md5(replace(p.prosrc,E'\r\n',E'\n')) IS DISTINCT FROM '4ba28e8444d8fd0d84e654952447da1b'
 THEN RAISE EXCEPTION 'Patched guard definition mismatch; rollback'; END IF;
 signature:=jsonb_build_object('function',jsonb_build_object('oid',p.oid,'owner',p.proowner,'acl',p.proacl::text,'language',p.prolang,'securityDefiner',p.prosecdef,'config',p.proconfig,'returnType',p.prorettype,'volatile',p.provolatile,'strict',p.proisstrict,'parallel',p.proparallel,'cost',p.procost,'rows',p.prorows),'triggers',(select coalesce(jsonb_agg(jsonb_build_object('oid',t.oid,'table',t.tgrelid,'name',t.tgname,'type',t.tgtype,'enabled',t.tgenabled,'args',encode(t.tgargs,'hex')) order by t.oid),'[]'::jsonb) from pg_trigger t where t.tgfoid=p.oid));
 IF signature IS DISTINCT FROM current_setting('examstudio.audit_guard_signature')::jsonb
 THEN RAISE EXCEPTION 'Function attributes or trigger bindings changed; rollback'; END IF;
END $postflight$;

SELECT 'public.bank_revision_prune_freeze_guard()'::regprocedure AS target,
 md5(replace(prosrc,E'\r\n',E'\n')) AS expected_patched_body_md5,
 pg_get_functiondef(oid) AS installed_function_definition
FROM pg_proc WHERE oid='public.bank_revision_prune_freeze_guard()'::regprocedure;
COMMIT;
