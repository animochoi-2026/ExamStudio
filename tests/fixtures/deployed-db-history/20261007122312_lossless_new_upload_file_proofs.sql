-- Isolated candidate. Additive column only. No new table, function or GRANT.
-- Apply only after exact live definition/ACL/data/object/Edge backup is verified.
BEGIN;
DO $$ BEGIN
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid='public.bank_finish(uuid,uuid,jsonb)'::regprocedure) IS DISTINCT FROM '1e2a4d21ae0431afbc03216089457cde' THEN RAISE EXCEPTION 'Live bank_finish changed'; END IF;
 IF has_function_privilege('authenticated','public.bank_finish(uuid,uuid,jsonb)','EXECUTE') OR has_function_privilege('anon','public.bank_finish(uuid,uuid,jsonb)','EXECUTE') OR NOT has_function_privilege('service_role','public.bank_finish(uuid,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Unexpected bank_finish ACL'; END IF;
 IF has_table_privilege('authenticated','public.bank_entries','INSERT,UPDATE,DELETE') OR has_table_privilege('anon','public.bank_entries','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Unexpected direct entry writes'; END IF;
END $$;
CREATE TEMP TABLE lossless_function_security ON COMMIT DROP AS SELECT proowner,proacl,prosecdef,proconfig FROM pg_proc WHERE oid='public.bank_finish(uuid,uuid,jsonb)'::regprocedure;
CREATE TEMP TABLE lossless_table_security ON COMMIT DROP AS SELECT relowner,relacl,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.bank_entries'::regclass;
ALTER TABLE public.bank_entries ADD COLUMN lossless_proof jsonb CHECK(lossless_proof IS NULL OR jsonb_typeof(lossless_proof)='object');
CREATE OR REPLACE FUNCTION public.bank_finish(f uuid, actor uuid, record jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE e public.bank_entries; rev public.bank_revisions; cat public.bank_catalog;
        d jsonb; heads uuid[]; reference_parent public.bank_catalog; reference_file public.bank_entries;
BEGIN
 SELECT * INTO e FROM public.bank_entries WHERE id=f FOR UPDATE;
 IF e.owner_id IS DISTINCT FROM actor OR NOT EXISTS(
  SELECT 1 FROM public.bank_members m JOIN auth.users u ON u.id=actor
  WHERE m.space_id=e.space_id AND m.enabled AND m.email=lower(u.email)
   AND (m.user_id IS NULL OR m.user_id=actor) AND u.email_confirmed_at IS NOT NULL
 ) THEN RAISE insufficient_privilege; END IF;
 IF e.props->>'losslessUpload'='lossless-upload-v1' THEN
  IF e.props->>'role' IS DISTINCT FROM 'asset' OR record->'losslessProof' IS NULL
   OR record#>>'{losslessProof,policy}' IS DISTINCT FROM 'lossless-upload-v1'
   OR record#>>'{losslessProof,bindingPolicy}' IS DISTINCT FROM 'lossless-native-source-v1'
   OR record#>>'{losslessProof,fileId}' IS DISTINCT FROM e.id::text
   OR record#>>'{losslessProof,spaceId}' IS DISTINCT FROM e.space_id::text
   OR record#>>'{losslessProof,ownerId}' IS DISTINCT FROM actor::text
   OR record#>>'{losslessProof,questionId}' IS DISTINCT FROM e.props->>'questionId'
   OR record#>>'{losslessProof,originRevisionId}' IS DISTINCT FROM e.props->>'revisionId'
   OR record#>>'{losslessProof,descriptor,id}' IS DISTINCT FROM e.id::text
   OR record#>>'{losslessProof,descriptor,sha256}' IS DISTINCT FROM e.sha256
   OR (record#>>'{losslessProof,descriptor,size}')::bigint IS DISTINCT FROM e.size
   OR record#>>'{losslessProof,descriptor,name}' IS DISTINCT FROM e.name
   OR record#>>'{losslessProof,descriptor,role}' IS DISTINCT FROM 'asset'
   OR record#>>'{losslessProof,descriptor,encoding,policy}' IS DISTINCT FROM 'lossless-upload-v1'
   OR coalesce(record#>>'{losslessProof,nativeBindingSha256}','') !~ '^[a-f0-9]{64}$'
   OR coalesce(record#>>'{losslessProof,originalSha256}','') !~ '^[a-f0-9]{64}$'
   OR coalesce(record#>>'{losslessProof,pixelSha256}','') !~ '^[a-f0-9]{64}$'
   OR coalesce(record#>>'{losslessProof,canonicalPngSha256}','') !~ '^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'Server lossless proof required' USING errcode='PT409'; END IF;
  IF e.verified THEN
   IF e.lossless_proof IS DISTINCT FROM record->'losslessProof' THEN RAISE EXCEPTION 'Lossless proof replay differs' USING errcode='PT409'; END IF;
   RETURN;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bank_revisions r JOIN public.bank_questions q ON q.id=r.question_id WHERE r.id=(e.props->>'revisionId')::uuid AND r.actor_id=actor AND NOT r.committed AND q.id=(e.props->>'questionId')::uuid AND q.owner_id=actor AND q.space_id=e.space_id)
  THEN RAISE insufficient_privilege; END IF;
  UPDATE public.bank_entries SET lossless_proof=record->'losslessProof',verified=true WHERE id=f;
  RETURN;
 ELSIF record ? 'losslessProof' THEN RAISE EXCEPTION 'Unexpected lossless proof';
 END IF;
 IF e.props->>'role'='commit' THEN
  IF record IS NULL OR record->>'revisionId' IS DISTINCT FROM e.props->>'revisionId'
   OR record->>'questionId' IS DISTINCT FROM e.props->>'questionId'
   OR jsonb_typeof(record->'files') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION '검증된 완료 기록이 필요합니다.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(e.props->>'questionId',0));
  SELECT * INTO rev FROM public.bank_revisions WHERE id=(e.props->>'revisionId')::uuid FOR UPDATE;
  IF rev.id IS NULL OR rev.actor_id IS DISTINCT FROM actor
   OR rev.question_id::text IS DISTINCT FROM e.props->>'questionId'
   OR NOT EXISTS(SELECT 1 FROM public.bank_questions q WHERE q.id=rev.question_id
                 AND q.space_id=e.space_id)
  THEN RAISE insufficient_privilege; END IF;
  IF rev.parent_id IS DISTINCT FROM nullif(record->>'parentRevisionId','')::uuid
  THEN RAISE EXCEPTION '수정 충돌: 요청의 기준 버전이 다릅니다.' USING errcode='PT409'; END IF;

  -- Recheck immutable references inside the same completion transaction.
  -- A completed revision uses its own persisted links; its parent's payload
  -- may legitimately have been pruned after this revision was completed.
  IF record ? 'immutableReferencePolicy' THEN
   IF record->>'immutableReferencePolicy' IS DISTINCT FROM 'difficulty-only-v1'
    OR jsonb_typeof(record->'baseReviewVersion') IS DISTINCT FROM 'number'
   THEN RAISE EXCEPTION 'Invalid immutable reference policy'; END IF;
   IF NOT rev.committed THEN
    SELECT * INTO reference_parent FROM public.bank_catalog WHERE revision_id=rev.parent_id FOR UPDATE;
    IF reference_parent.revision_id IS NULL OR reference_parent.space_id IS DISTINCT FROM e.space_id
     OR reference_parent.question_id IS DISTINCT FROM rev.question_id
     OR NOT EXISTS(SELECT 1 FROM public.bank_questions q WHERE q.id=rev.question_id AND q.owner_id=actor AND q.space_id=e.space_id)
     OR NOT EXISTS(SELECT 1 FROM public.bank_revisions p WHERE p.id=rev.parent_id AND p.committed AND p.review_version=(record->>'baseReviewVersion')::integer)
     OR NOT EXISTS(SELECT 1 FROM public.bank_maintenance_items i JOIN public.bank_maintenance_jobs j ON j.id=i.job_id
      WHERE i.result_id=rev.id AND i.base_id=rev.parent_id AND i.question_id=rev.question_id AND i.review_version=(record->>'baseReviewVersion')::integer
       AND j.actor_id=actor AND j.space_id=e.space_id)
    THEN RAISE EXCEPTION 'Reference parent or review changed' USING errcode='PT409'; END IF;
    IF coalesce(nullif(reference_parent.confirmed->>'difficulty',''),nullif(reference_parent.confirmed->>'difficultyBand',''),
      nullif(reference_parent.metadata#>>'{difficulty,userScore}',''),nullif(reference_parent.metadata#>>'{difficulty,teacherBand}',''),
      nullif(record#>>'{metadata,difficulty,userScore}',''),nullif(record#>>'{metadata,difficulty,teacherBand}','')) IS NOT NULL
    THEN RAISE EXCEPTION 'Teacher difficulty is protected' USING errcode='PT409'; END IF;
    IF (reference_parent.metadata - 'difficulty') IS DISTINCT FROM ((record->'metadata') - 'difficulty')
     OR reference_parent.metadata#>'{difficulty,scope}' IS DISTINCT FROM record#>'{metadata,difficulty,scope}'
     OR reference_parent.content IS DISTINCT FROM coalesce(record->'content','{}'::jsonb)
     OR (SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(reference_parent.files) x WHERE x->>'role' NOT IN ('data','commit'))
       IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(record->'files') x WHERE x->>'role' NOT IN ('data','commit'))
    THEN RAISE EXCEPTION 'Non-difficulty content or descriptors changed' USING errcode='PT409'; END IF;
   END IF;
  END IF;
  FOR d IN SELECT * FROM jsonb_array_elements(record->'files') LOOP
   SELECT * INTO reference_file FROM public.bank_entries WHERE id=(d->>'id')::uuid FOR SHARE;
   IF reference_file.id IS NULL OR NOT reference_file.verified OR reference_file.space_id IS DISTINCT FROM e.space_id
    OR reference_file.size IS DISTINCT FROM (d->>'size')::bigint OR reference_file.sha256 IS DISTINCT FROM d->>'sha256'
    OR reference_file.props->>'role' IS DISTINCT FROM d->>'role'
   THEN RAISE EXCEPTION 'Required file not verified' USING errcode='PT409'; END IF;
   IF d ? 'encoding' OR reference_file.lossless_proof IS NOT NULL OR reference_file.props ? 'losslessUpload' THEN
    IF reference_file.props->>'losslessUpload' IS DISTINCT FROM 'lossless-upload-v1'
     OR d#>>'{encoding,policy}' IS DISTINCT FROM 'lossless-upload-v1'
     OR reference_file.lossless_proof->'descriptor' IS DISTINCT FROM d
     OR reference_file.lossless_proof->>'policy' IS DISTINCT FROM 'lossless-upload-v1'
     OR reference_file.lossless_proof->>'spaceId' IS DISTINCT FROM e.space_id::text
     OR reference_file.lossless_proof->>'questionId' IS DISTINCT FROM rev.question_id::text
     OR reference_file.lossless_proof->>'ownerId' IS DISTINCT FROM actor::text
    THEN RAISE EXCEPTION 'Lossless descriptor proof mismatch' USING errcode='PT409'; END IF;
   END IF;
   IF d->>'role'<>'source' THEN
    IF reference_file.owner_id IS DISTINCT FROM actor OR reference_file.props->>'questionId' IS DISTINCT FROM rev.question_id::text
    THEN RAISE EXCEPTION 'Foreign revision file' USING errcode='PT409'; END IF;
    IF reference_file.props->>'revisionId' IS DISTINCT FROM rev.id::text THEN
     IF record->>'immutableReferencePolicy' IS DISTINCT FROM 'difficulty-only-v1'
      OR d->>'role' NOT IN ('docx','preview','asset','attachment')
      OR NOT EXISTS(SELECT 1 FROM public.bank_revision_files l WHERE l.revision_id=CASE WHEN rev.committed THEN rev.id ELSE rev.parent_id END AND l.file_id=reference_file.id)
      OR NOT rev.committed AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(reference_parent.files) x WHERE x=d)
     THEN RAISE EXCEPTION 'Immutable reference mismatch' USING errcode='PT409'; END IF;
    END IF;
   END IF;
  END LOOP;
  SELECT * INTO cat FROM public.bank_catalog WHERE revision_id=rev.id;
  IF rev.committed THEN
   -- Preserve the existing explicit reindex path for a missing derived catalog.
   -- The verifier has re-read the immutable completed files and native payload.
   IF cat.revision_id IS NULL AND e.verified
    AND EXISTS(SELECT 1 FROM public.bank_revision_files WHERE revision_id=rev.id AND file_id=f)
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(record->'files') x
     WHERE NOT EXISTS(SELECT 1 FROM public.bank_revision_files l JOIN public.bank_entries b ON b.id=l.file_id
      WHERE l.revision_id=rev.id AND l.file_id=(x->>'id')::uuid AND b.verified
       AND b.size=(x->>'size')::bigint AND b.sha256=x->>'sha256'))
   THEN
    INSERT INTO public.bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files)
     VALUES(rev.id,e.space_id,rev.question_id,f,record->'metadata',coalesce(record->'content','{}'),record->'files')
     RETURNING * INTO cat;
   END IF;
   -- A lost response may replay an OLD completed revision after a newer edit.
   -- Verify the original immutable result, not today's review/confirmed fields.
   IF NOT e.verified OR cat.commit_id IS DISTINCT FROM f
    OR cat.question_id IS DISTINCT FROM rev.question_id OR cat.space_id IS DISTINCT FROM e.space_id
    OR cat.metadata IS DISTINCT FROM record->'metadata'
    OR cat.content IS DISTINCT FROM coalesce(record->'content','{}'::jsonb)
    OR cat.files IS DISTINCT FROM record->'files'
    OR NOT EXISTS(SELECT 1 FROM public.bank_revision_files WHERE revision_id=rev.id AND file_id=f)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(record->'files') x
      WHERE NOT EXISTS(SELECT 1 FROM public.bank_revision_files l JOIN public.bank_entries b ON b.id=l.file_id
       WHERE l.revision_id=rev.id AND l.file_id=(x->>'id')::uuid AND b.verified
         AND b.size=(x->>'size')::bigint AND b.sha256=x->>'sha256'))
   THEN RAISE EXCEPTION '수정 충돌: 이미 완료된 요청의 결과와 일치하지 않습니다.' USING errcode='PT409'; END IF;
   RETURN;
  END IF;
  SELECT array_agg(r.id) INTO heads FROM public.bank_revisions r
   WHERE r.question_id=rev.question_id AND r.committed
    AND NOT EXISTS(SELECT 1 FROM public.bank_revisions child WHERE child.parent_id=r.id AND child.committed);
  IF coalesce(cardinality(heads),0)>1
   OR cardinality(heads)=1 AND rev.parent_id IS DISTINCT FROM heads[1]
   OR coalesce(cardinality(heads),0)=0 AND rev.parent_id IS NOT NULL
  THEN RAISE EXCEPTION '수정 충돌: 기준 버전 이후 새 변경이 있습니다. 최신본을 불러와 비교하세요.' USING errcode='PT409'; END IF;
  IF cat.revision_id IS NOT NULL THEN
   RAISE EXCEPTION '수정 충돌: 미완료 버전의 기존 기록을 확인하세요.' USING errcode='PT409';
  END IF;
  INSERT INTO public.bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files)
   VALUES(rev.id,e.space_id,rev.question_id,f,record->'metadata',coalesce(record->'content','{}'),record->'files');
  FOR d IN SELECT * FROM jsonb_array_elements(record->'files') LOOP
   INSERT INTO public.bank_revision_files VALUES(rev.id,(d->>'id')::uuid) ON CONFLICT DO NOTHING;
  END LOOP;
  INSERT INTO public.bank_revision_files VALUES(rev.id,f) ON CONFLICT DO NOTHING;
  UPDATE public.bank_revisions SET committed=true WHERE id=rev.id;
  INSERT INTO public.bank_audit(space_id,actor_id,actor_email,action,target)
   VALUES(e.space_id,actor,(SELECT email FROM auth.users WHERE id=actor),'commit',rev.id::text);
 END IF;
 IF NOT e.verified THEN UPDATE public.bank_entries SET verified=true WHERE id=f; END IF;
END $function$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN lossless_function_security s WHERE p.oid='public.bank_finish(uuid,uuid,jsonb)'::regprocedure AND ROW(p.proowner,p.proacl,p.prosecdef,p.proconfig) IS DISTINCT FROM ROW(s.proowner,s.proacl,s.prosecdef,s.proconfig)) THEN RAISE EXCEPTION 'Function security drift'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class p CROSS JOIN lossless_table_security s WHERE p.oid='public.bank_entries'::regclass AND ROW(p.relowner,p.relacl,p.relrowsecurity,p.relforcerowsecurity) IS DISTINCT FROM ROW(s.relowner,s.relacl,s.relrowsecurity,s.relforcerowsecurity)) THEN RAISE EXCEPTION 'Table security drift'; END IF;
END $$;
COMMIT;

