CREATE OR REPLACE FUNCTION public.bank_revision_prune_freeze_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 for x in select jsonb_path_query(v->'metadata','$.**') loop
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
end $function$
;
