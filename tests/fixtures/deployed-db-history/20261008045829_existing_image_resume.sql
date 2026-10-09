CREATE FUNCTION bank_image_migration.resume(a uuid, migration_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE z public.bank_image_transitions; q public.bank_questions; b public.bank_revisions; r public.bank_revisions; c public.bank_catalog; oldcat public.bank_catalog; ce public.bank_entries; d jsonb; e public.bank_entries; expected jsonb; actual jsonb;
BEGIN
 SELECT * INTO z FROM public.bank_image_transitions WHERE id=migration_id;
 IF z.id IS NULL OR z.actor_id<>a THEN RAISE insufficient_privilege; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(z.question_id::text,0));
 SELECT * INTO z FROM public.bank_image_transitions WHERE id=migration_id FOR UPDATE;
 SELECT * INTO q FROM public.bank_questions WHERE id=z.question_id FOR UPDATE;
 SELECT * INTO b FROM public.bank_revisions WHERE id=z.base_revision_id FOR UPDATE;
 SELECT * INTO r FROM public.bank_revisions WHERE id=z.target_revision_id FOR UPDATE;
 SELECT * INTO c FROM public.bank_catalog WHERE revision_id=r.id FOR UPDATE;
 SELECT * INTO oldcat FROM public.bank_catalog WHERE revision_id=b.id FOR UPDATE;
 SELECT * INTO ce FROM public.bank_entries WHERE id=c.commit_id FOR UPDATE;
 IF z.rolled_back_at IS NULL THEN
  IF r.committed AND ce.verified THEN RETURN jsonb_build_object('committed',true,'reused',true); END IF;
  RAISE EXCEPTION 'Receipt state mismatch' USING errcode='PT409';
 END IF;
 IF q.owner_id<>a OR to_jsonb(q) IS DISTINCT FROM z.request#>'{plan,before,question}'
 OR to_jsonb(b) IS DISTINCT FROM z.request#>'{plan,before,revision}' OR to_jsonb(oldcat) IS DISTINCT FROM z.request#>'{plan,before,catalog}'
 OR (to_jsonb(r)-'committed') IS DISTINCT FROM (z.new_revision-'committed') OR r.committed OR ce.verified
 OR to_jsonb(c) IS DISTINCT FROM z.new_catalog
 OR EXISTS(SELECT 1 FROM public.bank_revisions x WHERE x.parent_id=r.id)
 OR EXISTS(SELECT 1 FROM public.bank_revisions x WHERE x.question_id=q.id AND x.id<>r.id AND x.created_at>z.created_at)
 OR EXISTS(SELECT 1 FROM public.bank_revisions x WHERE x.question_id=q.id AND x.committed AND x.id<>b.id AND NOT EXISTS(SELECT 1 FROM public.bank_revisions child WHERE child.parent_id=x.id AND child.committed))
 THEN RAISE EXCEPTION 'Resume conflicts with user changes' USING errcode='PT409'; END IF;
 LOCK TABLE public.bank_difficulty_ratings,public.bank_scope_evidence,public.bank_proposals IN SHARE ROW EXCLUSIVE MODE;
 SELECT coalesce(jsonb_agg(x-'revision_id' ORDER BY x->>'user_id'),'[]') INTO expected FROM jsonb_array_elements(z.request#>'{plan,ratings}') x;
 SELECT coalesce(jsonb_agg(to_jsonb(x)-'revision_id' ORDER BY x.user_id),'[]') INTO actual FROM public.bank_difficulty_ratings x WHERE x.revision_id=b.id;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Base ratings changed' USING errcode='PT409'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)-'revision_id' ORDER BY x.user_id),'[]') INTO actual FROM public.bank_difficulty_ratings x WHERE x.revision_id=r.id;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Target ratings changed' USING errcode='PT409'; END IF;
 SELECT coalesce(jsonb_agg(x-'revision_id' ORDER BY x->>'updated_at'),'[]') INTO expected FROM jsonb_array_elements(z.request#>'{plan,scopeEvidence}') x;
 SELECT coalesce(jsonb_agg(to_jsonb(x)-'revision_id' ORDER BY x.updated_at),'[]') INTO actual FROM public.bank_scope_evidence x WHERE x.revision_id=b.id;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Base scope changed' USING errcode='PT409'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)-'revision_id' ORDER BY x.updated_at),'[]') INTO actual FROM public.bank_scope_evidence x WHERE x.revision_id=r.id;
 IF actual IS DISTINCT FROM expected OR EXISTS(SELECT 1 FROM public.bank_proposals WHERE revision_id IN(b.id,r.id) AND status='pending') THEN RAISE EXCEPTION 'Target teacher input changed' USING errcode='PT409'; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(c.files) LOOP
  SELECT * INTO e FROM public.bank_entries WHERE id=(d->>'id')::uuid FOR UPDATE;
  IF e.id IS NULL OR NOT e.verified OR e.sha256 IS DISTINCT FROM d->>'sha256' OR e.size IS DISTINCT FROM (d->>'size')::bigint OR e.name IS DISTINCT FROM d->>'name' THEN RAISE EXCEPTION 'Stored file changed' USING errcode='PT409'; END IF;
 END LOOP;
 UPDATE public.bank_entries SET verified=true WHERE id=ce.id;
 UPDATE public.bank_revisions SET committed=true WHERE id=r.id;
 UPDATE public.bank_image_transitions SET rolled_back_at=null WHERE id=z.id;
 INSERT INTO public.bank_audit(space_id,actor_id,actor_email,action,target) VALUES(q.space_id,a,(SELECT email FROM auth.users WHERE id=a),'image_lossless_resume',z.id::text);
 RETURN jsonb_build_object('committed',true,'reused',true,'revisionId',r.id);
END $$;
REVOKE ALL ON FUNCTION bank_image_migration.resume(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
DO $patch$
DECLARE definition text; needle text := ' ELSIF record->>''operation''=''existing-image-rollback-v1'' THEN';
BEGIN
 definition:=pg_get_functiondef('public.bank_finish(uuid,uuid,jsonb)'::regprocedure);
 IF strpos(definition,needle)=0 OR strpos(definition,'existing-image-resume-v1')>0 THEN RAISE EXCEPTION 'Dispatcher drift'; END IF;
 definition:=replace(definition,needle,E' ELSIF record->>''operation''=''existing-image-resume-v1'' THEN\n  IF NOT EXISTS(SELECT 1 FROM public.bank_image_transitions z WHERE z.id=(record->>''migrationId'')::uuid AND z.actor_id=actor AND z.new_catalog->>''commit_id''=f::text) THEN RAISE insufficient_privilege; END IF;\n  PERFORM bank_image_migration.resume(actor,(record->>''migrationId'')::uuid);\n  RETURN;\n'||needle);
 EXECUTE definition;
END $patch$;

