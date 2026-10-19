-- Replace only the repeated metadata scan; retain every lock and file check.
DO $$ BEGIN
 IF md5(replace(pg_get_functiondef('public.bank_revision_prune_freeze_guard()'::regprocedure),E'\r\n',E'\n')) <> 'ee162bd743ab39d85731a96af70a0c20' THEN
  RAISE EXCEPTION 'Reference guard changed; review current definition before applying';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.bank_revision_prune_freeze_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb:=to_jsonb(new);s uuid;refs text[]:='{}';frefs text[]:='{}';x jsonb;scan_metadata jsonb;inherited_metadata jsonb;audit_path text[];audit_value jsonb;history_record jsonb;history_index text;history_audit_path text[];parent_snapshot jsonb;begin
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
    -- Difficulty history contains immutable audit snapshots, never file links.
    -- Permit only an exact parent snapshot or an unchanged inherited history entry.
    -- The initial v2 client also emitted a transitional snapshot whose sole
    -- difference is the explicit, current, zero proof adjustment; retain it.
    if jsonb_typeof(scan_metadata#>'{difficulty,history}')='array' then
     for history_record,history_index in select value,(ordinality-1)::text
      from jsonb_array_elements(scan_metadata#>'{difficulty,history}') with ordinality loop
      parent_snapshot:=(inherited_metadata->'difficulty')-array['history','rubricAssessments','activeRubricAssessment'];
      if jsonb_typeof(history_record)='object' and (
       history_record=parent_snapshot
       or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(inherited_metadata#>'{difficulty,history}')='array' then inherited_metadata#>'{difficulty,history}' else '[]'::jsonb end) prior where prior=history_record)
       or (history_record-'proofAdjustment'=parent_snapshot-'proofAdjustment'
        and scan_metadata#>>'{difficulty,criteriaVersion}'='fixed-learner-access-v2'
        and history_record->'proofAdjustment'=scan_metadata#>'{difficulty,proofAdjustment}'
        and history_record->'proofAdjustment'=jsonb_build_object('version','fixed-learner-no-proof-bonus-v2','rawScore',(scan_metadata#>>'{difficulty,aiScore}')::numeric,'score',(scan_metadata#>>'{difficulty,aiScore}')::numeric,'delta',0,'evidence',null))
      ) then
       for history_audit_path in select p from (values
        (array['assessment','revisionBinding','revisionId']),
        (array['assessment','revisionBinding','fromRevisionId']),
        (array['proofAdjustment','baseRevisionId'])
       ) allowed(p) loop
        audit_value:=history_record#>history_audit_path;
        if jsonb_typeof(audit_value)='string' and exists(
         select 1 from public.bank_revision_prune_marks mark
         join public.bank_revisions audit_revision on audit_revision.id=mark.revision_id
         where mark.revision_id::text=audit_value#>>'{}'
          and audit_revision.question_id=(v->>'question_id')::uuid)
        then scan_metadata:=scan_metadata#-(array['difficulty','history',history_index]||history_audit_path);end if;
       end loop;
      end if;
     end loop;
    end if;
   end if;
  end if;
 -- Compare scalar string sets once. Same references and freezes as the loop,
 -- without rescanning OLD metadata for every nested evaluation string.
 refs:=refs||array(select value#>>'{}' from (
  select value from jsonb_path_query(scan_metadata,'$.**') incoming(value) where jsonb_typeof(value)='string'
  except
  select value from jsonb_path_query(coalesce(to_jsonb(old)->'metadata','{}'),'$.**') previous(value) where tg_op='UPDATE' and jsonb_typeof(value)='string'
 ) added);
 end if;
 if tg_table_schema='storage' and exists(select 1 from public.bank_question_deletions d,jsonb_array_elements(d.files) f where f->>'id'=any(frefs)) then raise sqlstate 'PT409' using message='삭제 중인 파일은 다시 업로드할 수 없습니다';end if;
 if exists(select 1 from public.bank_revision_prune_marks where revision_id::text=any(refs))
 or exists(select 1 from public.bank_revision_prunes j,jsonb_array_elements(j.plan->'files') f where f->>'id'=any(frefs))
 then raise sqlstate 'PT409' using message='Revision payload frozen or retired';end if;
 if tg_table_name='bank_question_deletions' and exists(select 1 from public.bank_revision_prune_marks m join public.bank_revisions r on r.id=m.revision_id join public.bank_revision_prunes j on j.id=m.job_id where r.question_id=(v->>'question_id')::uuid and not j.completed)
 then raise sqlstate 'PT409' using message='Revision retirement is still running';end if;
 return new;
end $function$

