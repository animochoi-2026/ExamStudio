-- Validate under the same question lock BEFORE catalog/file writes.
-- No row migration, history cleanup, privilege change or forced completion.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.bank_finish(f uuid,actor uuid,record jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.bank_entries; rev public.bank_revisions; cat public.bank_catalog;
        d jsonb; heads uuid[];
BEGIN
 SELECT * INTO e FROM public.bank_entries WHERE id=f FOR UPDATE;
 IF e.owner_id IS DISTINCT FROM actor OR NOT EXISTS(
  SELECT 1 FROM public.bank_members m JOIN auth.users u ON u.id=actor
  WHERE m.space_id=e.space_id AND m.enabled AND m.email=lower(u.email)
   AND (m.user_id IS NULL OR m.user_id=actor) AND u.email_confirmed_at IS NOT NULL
 ) THEN RAISE insufficient_privilege; END IF;
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
END $$;
COMMIT;
