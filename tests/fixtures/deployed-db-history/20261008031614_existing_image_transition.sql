DO $$ BEGIN IF md5(replace(pg_get_functiondef('public.bank_finish(uuid,uuid,jsonb)'::regprocedure),E'\r\n',E'\n')) IS DISTINCT FROM '3dc683a1532227b4be268b49ffaa80b6' THEN RAISE EXCEPTION 'Live bank_finish drift'; END IF; END $$;
CREATE SCHEMA bank_image_migration;
REVOKE ALL ON SCHEMA bank_image_migration FROM PUBLIC,anon,authenticated,service_role;
-- Additive, service-only finalization after authenticated Edge byte/pixel verification.
CREATE TABLE public.bank_image_transitions (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES auth.users(id),
 question_id uuid NOT NULL REFERENCES public.bank_questions(id),
 base_revision_id uuid NOT NULL REFERENCES public.bank_revisions(id),
 target_revision_id uuid NOT NULL UNIQUE REFERENCES public.bank_revisions(id),
 request jsonb NOT NULL, proofs jsonb NOT NULL, new_revision jsonb NOT NULL,
 new_catalog jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 rolled_back_at timestamptz
);
CREATE INDEX bank_image_transitions_actor ON public.bank_image_transitions(actor_id);
CREATE INDEX bank_image_transitions_question ON public.bank_image_transitions(question_id);
CREATE INDEX bank_image_transitions_base ON public.bank_image_transitions(base_revision_id);
ALTER TABLE public.bank_image_transitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_image_transitions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.bank_image_transitions TO service_role;

CREATE FUNCTION bank_image_migration.finish(a uuid, p jsonb, c jsonb, changes jsonb, proofs jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE q public.bank_questions; b public.bank_revisions; t public.bank_revisions;
 oldcat public.bank_catalog; newcat public.bank_catalog; ce public.bank_entries;
 f public.bank_entries; oldfile public.bank_entries; x jsonb; change jsonb;
 receipt public.bank_image_transitions; rating_snapshot jsonb; scope_snapshot jsonb;
 request_value jsonb := jsonb_build_object('plan',p,'commit',c,'changes',changes);
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p->>'questionId',0));
 SELECT * INTO q FROM public.bank_questions WHERE id=(p->>'questionId')::uuid FOR UPDATE;
 IF q.id IS NULL OR q.owner_id IS DISTINCT FROM a OR q.space_id::text IS DISTINCT FROM p->>'spaceId'
 OR NOT EXISTS(SELECT 1 FROM public.bank_members m JOIN auth.users u ON u.id=a WHERE m.space_id=q.space_id AND m.enabled AND m.email=lower(u.email) AND (m.user_id IS NULL OR m.user_id=a) AND u.email_confirmed_at IS NOT NULL)
 THEN RAISE insufficient_privilege; END IF;
 SELECT * INTO receipt FROM public.bank_image_transitions WHERE id=(p->>'id')::uuid FOR UPDATE;
 IF receipt.id IS NOT NULL THEN
  IF receipt.actor_id=a AND receipt.request=request_value AND receipt.rolled_back_at IS NULL THEN RETURN jsonb_build_object('committed',true,'reused',true,'revisionId',receipt.target_revision_id); END IF;
  RAISE EXCEPTION 'Migration ID changed or rolled back' USING errcode='PT409';
 END IF;
 SELECT * INTO b FROM public.bank_revisions WHERE id=(p->>'baseRevisionId')::uuid FOR UPDATE;
 SELECT * INTO oldcat FROM public.bank_catalog WHERE revision_id=b.id FOR UPDATE;
 SELECT * INTO t FROM public.bank_revisions WHERE id=(p->>'targetRevisionId')::uuid FOR UPDATE;
 IF to_jsonb(q) IS DISTINCT FROM p#>'{before,question}' OR to_jsonb(b) IS DISTINCT FROM p#>'{before,revision}' OR to_jsonb(oldcat) IS DISTINCT FROM p#>'{before,catalog}'
 OR NOT b.committed OR t.id IS NULL OR t.committed OR t.question_id<>q.id OR t.parent_id<>b.id OR t.actor_id<>a
 OR EXISTS(SELECT 1 FROM public.bank_revisions r WHERE r.question_id=q.id AND r.committed AND r.id<>b.id AND NOT EXISTS(SELECT 1 FROM public.bank_revisions child WHERE child.parent_id=r.id AND child.committed))
 THEN RAISE EXCEPTION 'Latest revision or review changed' USING errcode='PT409'; END IF;
 LOCK TABLE public.bank_difficulty_ratings,public.bank_scope_evidence,public.bank_proposals IN SHARE ROW EXCLUSIVE MODE;
 SELECT coalesce(jsonb_agg(to_jsonb(z) ORDER BY z.user_id),'[]') INTO rating_snapshot FROM public.bank_difficulty_ratings z WHERE z.revision_id=b.id;
 SELECT coalesce(jsonb_agg(to_jsonb(z)),'[]') INTO scope_snapshot FROM public.bank_scope_evidence z WHERE z.revision_id=b.id;
 IF rating_snapshot IS DISTINCT FROM p->'ratings' OR scope_snapshot IS DISTINCT FROM p->'scopeEvidence'
 OR EXISTS(SELECT 1 FROM public.bank_proposals WHERE revision_id=b.id AND status='pending')
 THEN RAISE EXCEPTION 'Teacher input changed' USING errcode='PT409'; END IF;
 SELECT * INTO ce FROM public.bank_entries WHERE id=(c->>'commitId')::uuid FOR UPDATE;
 IF ce.id IS NULL OR ce.verified OR ce.owner_id<>a OR ce.space_id<>q.space_id OR ce.props->>'role'<>'commit' OR ce.props->>'revisionId'<>t.id::text
 OR ce.props->>'questionId'<>q.id::text OR c->>'revisionId'<>t.id::text OR c->>'questionId'<>q.id::text OR c->>'rootId'<>q.space_id::text OR c->>'parentRevisionId'<>b.id::text
 OR c->'metadata' IS DISTINCT FROM oldcat.metadata OR c->'content' IS DISTINCT FROM oldcat.content
 OR jsonb_typeof(changes)<>'array' OR jsonb_array_length(changes)=0 OR jsonb_array_length(changes)<>jsonb_array_length(proofs)
 OR (SELECT count(*) FROM jsonb_array_elements(c->'files'))<>(SELECT count(DISTINCT d->>'id') FROM jsonb_array_elements(c->'files') d)
 OR (SELECT count(*) FROM jsonb_array_elements(c->'files'))<>(SELECT count(DISTINCT d->>'key') FROM jsonb_array_elements(c->'files') d)
 THEN RAISE EXCEPTION 'Invalid migration commit' USING errcode='PT409'; END IF;
 FOR change IN SELECT * FROM jsonb_array_elements(changes) LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(oldcat.files) d WHERE d=change->'oldDescriptor') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c->'files') d WHERE d=change->'newDescriptor')
  OR change#>>'{oldDescriptor,role}' NOT IN ('asset','preview') OR change#>>'{oldDescriptor,role}' IS DISTINCT FROM change#>>'{newDescriptor,role}'
  OR change#>>'{oldDescriptor,key}' IS DISTINCT FROM change#>>'{newDescriptor,key}'
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(proofs) z WHERE z->'oldDescriptor'=change->'oldDescriptor' AND z->'newDescriptor'=change->'newDescriptor' AND z->>'fullRgbaEqual'='true' AND z->>'pixelSha256' ~ '^[a-f0-9]{64}$')
  THEN RAISE EXCEPTION 'Migration pixel proof mismatch' USING errcode='PT409'; END IF;
 END LOOP;
 IF (SELECT jsonb_agg(d ORDER BY i) FROM jsonb_array_elements(oldcat.files) WITH ORDINALITY a(d,i) WHERE d->>'role'<>'data') IS DISTINCT FROM
 (SELECT jsonb_agg(coalesce((SELECT z->'oldDescriptor' FROM jsonb_array_elements(changes) z WHERE z->'newDescriptor'=d),d) ORDER BY i) FROM jsonb_array_elements(c->'files') WITH ORDINALITY a(d,i) WHERE d->>'role'<>'data')
 THEN RAISE EXCEPTION 'Non-image descriptors changed' USING errcode='PT409'; END IF;
 FOR x IN SELECT * FROM jsonb_array_elements(c->'files') LOOP
  SELECT * INTO f FROM public.bank_entries WHERE id=(x->>'id')::uuid FOR SHARE;
  IF f.id IS NULL OR NOT f.verified OR f.space_id<>q.space_id OR f.sha256 IS DISTINCT FROM x->>'sha256' OR f.size IS DISTINCT FROM (x->>'size')::bigint OR f.props->>'role' IS DISTINCT FROM x->>'role'
  THEN RAISE EXCEPTION 'File descriptor not verified' USING errcode='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(changes) z WHERE z->'newDescriptor'=x) OR x->>'role'='data' THEN
   IF f.owner_id<>a OR f.props->>'questionId'<>q.id::text OR f.props->>'revisionId'<>t.id::text THEN RAISE insufficient_privilege; END IF;
   IF x->>'role'='asset' AND (f.lossless_proof->'descriptor' IS DISTINCT FROM x OR f.lossless_proof->>'questionId'<>q.id::text OR f.lossless_proof->>'policy'<>'lossless-upload-v1') THEN RAISE EXCEPTION 'Server asset proof missing'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM public.bank_revision_files l WHERE l.revision_id=b.id AND l.file_id=f.id) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(oldcat.files) d WHERE d=x)
  THEN RAISE EXCEPTION 'Old immutable reference changed' USING errcode='PT409'; END IF;
 END LOOP;
 INSERT INTO public.bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files,confirmed) VALUES(t.id,q.space_id,q.id,ce.id,oldcat.metadata,oldcat.content,c->'files',oldcat.confirmed) RETURNING * INTO newcat;
 INSERT INTO public.bank_revision_files SELECT t.id,(descriptor_value->>'id')::uuid FROM jsonb_array_elements(c->'files') descriptor_value;
 INSERT INTO public.bank_revision_files VALUES(t.id,ce.id);
 INSERT INTO public.bank_difficulty_ratings SELECT t.id,user_id,score,adopted,adopted_by,updated_at FROM public.bank_difficulty_ratings WHERE revision_id=b.id;
 INSERT INTO public.bank_scope_evidence SELECT t.id,evidence,reviewer_id,updated_at FROM public.bank_scope_evidence WHERE revision_id=b.id;
 UPDATE public.bank_revisions SET committed=true,visibility=b.visibility,review_version=b.review_version,reviewer_id=b.reviewer_id,reviewed_at=b.reviewed_at,change_reason=b.change_reason WHERE id=t.id RETURNING * INTO t;
 UPDATE public.bank_entries SET verified=true WHERE id=ce.id;
 INSERT INTO public.bank_image_transitions(id,actor_id,question_id,base_revision_id,target_revision_id,request,proofs,new_revision,new_catalog) VALUES((p->>'id')::uuid,a,q.id,b.id,t.id,request_value,proofs,to_jsonb(t),to_jsonb(newcat));
 INSERT INTO public.bank_audit(space_id,actor_id,actor_email,action,target) VALUES(q.space_id,a,(SELECT email FROM auth.users WHERE id=a),'image_lossless_transition',jsonb_build_object('id',p->>'id','base',b.id,'target',t.id,'images',jsonb_array_length(changes))::text);
 RETURN jsonb_build_object('committed',true,'reused',false,'revisionId',t.id);
END $$;
REVOKE ALL ON FUNCTION bank_image_migration.finish(uuid,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;


CREATE FUNCTION bank_image_migration.rollback(a uuid, migration_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE receipt public.bank_image_transitions; q public.bank_questions; r public.bank_revisions; cat public.bank_catalog; expected_ratings jsonb; actual_ratings jsonb;
BEGIN
 SELECT * INTO receipt FROM public.bank_image_transitions WHERE id=migration_id;
 IF receipt.id IS NULL OR receipt.actor_id<>a THEN RAISE insufficient_privilege; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(receipt.question_id::text,0));
 SELECT * INTO receipt FROM public.bank_image_transitions WHERE id=migration_id FOR UPDATE;
 IF receipt.rolled_back_at IS NOT NULL THEN RETURN jsonb_build_object('rolledBack',true,'reused',true); END IF;
 SELECT * INTO q FROM public.bank_questions WHERE id=receipt.question_id FOR UPDATE;
 SELECT * INTO r FROM public.bank_revisions WHERE id=receipt.target_revision_id FOR UPDATE;
 SELECT * INTO cat FROM public.bank_catalog WHERE revision_id=r.id FOR UPDATE;
 IF q.owner_id<>a OR to_jsonb(q) IS DISTINCT FROM receipt.request#>'{plan,before,question}' OR to_jsonb(r) IS DISTINCT FROM receipt.new_revision OR to_jsonb(cat) IS DISTINCT FROM receipt.new_catalog
 OR EXISTS(SELECT 1 FROM public.bank_revisions WHERE parent_id=r.id) THEN RAISE EXCEPTION 'Rollback conflicts with later changes' USING errcode='PT409'; END IF;
 LOCK TABLE public.bank_difficulty_ratings,public.bank_scope_evidence,public.bank_proposals IN SHARE ROW EXCLUSIVE MODE;
 SELECT coalesce(jsonb_agg(to_jsonb(z)-'revision_id' ORDER BY user_id),'[]') INTO actual_ratings FROM public.bank_difficulty_ratings z WHERE revision_id=r.id;
 SELECT coalesce(jsonb_agg(z-'revision_id' ORDER BY z->>'user_id'),'[]') INTO expected_ratings FROM jsonb_array_elements(receipt.request#>'{plan,ratings}') z;
 IF actual_ratings IS DISTINCT FROM expected_ratings OR EXISTS(SELECT 1 FROM public.bank_proposals WHERE revision_id=r.id) THEN RAISE EXCEPTION 'Rollback teacher input changed' USING errcode='PT409'; END IF;
 -- Retain all new and old files, catalog rows, links and evidence. Hide only the
 -- migration commit from commit discovery so the previous revision becomes head.
 UPDATE public.bank_entries SET verified=false WHERE id=cat.commit_id;
 UPDATE public.bank_revisions SET committed=false WHERE id=r.id;
 UPDATE public.bank_image_transitions SET rolled_back_at=now() WHERE id=migration_id;
 INSERT INTO public.bank_audit(space_id,actor_id,actor_email,action,target) VALUES(q.space_id,a,(SELECT email FROM auth.users WHERE id=a),'image_lossless_rollback',migration_id::text);
 RETURN jsonb_build_object('rolledBack',true,'reused',false,'previousRevisionId',receipt.base_revision_id);
END $$;
REVOKE ALL ON FUNCTION bank_image_migration.rollback(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;


-- EXISTING_SERVICE_DISPATCH
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
 IF record->>'operation'='existing-image-finalize-v1' THEN
  IF record#>>'{commit,commitId}' IS DISTINCT FROM f::text THEN RAISE EXCEPTION 'Migration commit mismatch'; END IF;
  PERFORM bank_image_migration.finish(actor,record->'plan',record->'commit',record->'changes',record->'proofs');
  RETURN;
 ELSIF record->>'operation'='existing-image-rollback-v1' THEN
  IF NOT EXISTS(SELECT 1 FROM public.bank_image_transitions z WHERE z.id=(record->>'migrationId')::uuid AND z.new_catalog->>'commit_id'=f::text AND z.actor_id=actor) THEN RAISE insufficient_privilege; END IF;
  PERFORM bank_image_migration.rollback(actor,(record->>'migrationId')::uuid);
  RETURN;
 END IF;
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
END $function$
;
