-- Run inside a transaction with the migration definition, then ROLLBACK.
do $$
declare c public.bank_catalog;v public.bank_revisions;u uuid;e jsonb;result jsonb;after_c public.bank_catalog;after_v public.bank_revisions;
begin
 if has_function_privilege('anon','public.bank_upload_review_save(uuid,jsonb,jsonb,integer)','EXECUTE') then raise exception 'anonymous execute';end if;
 if not has_function_privilege('authenticated','public.bank_upload_review_save(uuid,jsonb,jsonb,integer)','EXECUTE') then raise exception 'missing authenticated execute';end if;
 select b.* into c from public.bank_catalog b join public.bank_revisions r on r.id=b.revision_id join public.bank_questions q on q.id=r.question_id where r.committed and r.visibility='shared_pending' and not q.archived and exists(select 1 from bank_access.owners o where o.space_id=b.space_id) limit 1;
 if c.revision_id is null then raise exception 'no rollback fixture';end if;
 select * into v from public.bank_revisions where id=c.revision_id;
 select user_id into u from bank_access.owners where space_id=c.space_id limit 1;
 e:=jsonb_build_object('reviews',coalesce(c.metadata->'reviews','{}'::jsonb),'management',coalesce(c.metadata->'management','{}'::jsonb));
 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
 begin perform public.bank_upload_review_save(c.revision_id,'["테스트 확인"]',e,v.review_version);raise exception 'missing auth accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 begin perform public.bank_upload_review_save(c.revision_id,'["테스트 확인"]',e,v.review_version);raise exception 'nonmember accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.headers','{"x-exam-grade":"h3"}',true);
 if bank_grade.normalize(c.metadata#>>'{source,grade}')='h3' then perform set_config('request.headers','{"x-exam-grade":"m1"}',true);end if;
 begin perform public.bank_upload_review_save(c.revision_id,'["테스트 확인"]',e,v.review_version);raise exception 'wrong grade accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.headers','{}',true);
 begin perform public.bank_upload_review_save(c.revision_id,'["테스트 확인"]',e,-1);raise exception 'stale version accepted';exception when sqlstate 'PT409' then null;end;
 begin perform public.bank_upload_review_save(c.revision_id,'["테스트 확인"]','{}',v.review_version);raise exception 'stale evidence accepted';exception when sqlstate 'PT409' then null;end;
 result:=public.bank_upload_review_save(c.revision_id,'["테스트 확인"]',e,v.review_version);
 select * into after_c from public.bank_catalog where revision_id=c.revision_id;
 select * into after_v from public.bank_revisions where id=c.revision_id;
 if after_c.metadata is distinct from c.metadata or after_c.content is distinct from c.content or after_c.files is distinct from c.files or (after_c.confirmed-'uploadReview') is distinct from (c.confirmed-'uploadReview') then raise exception 'original data changed';end if;
 if after_v.visibility is distinct from v.visibility or after_v.reviewer_id is distinct from v.reviewer_id or after_v.review_version<>v.review_version+1 then raise exception 'full review state changed';end if;
 if result#>'{review,reasons}'<>'["테스트 확인"]'::jsonb then raise exception 'ack not saved';end if;
 if not exists(select 1 from public.bank_audit where action='upload_review_acknowledge' and target::jsonb->>'revision'=c.revision_id::text and actor_id=u) then raise exception 'audit missing';end if;
 begin perform public.bank_upload_review_save(c.revision_id,'["두 번째"]',e,v.review_version);raise exception 'concurrent save accepted';exception when sqlstate 'PT409' then null;end;
end $$;

