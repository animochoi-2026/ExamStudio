-- Keep bank_question_sets_get/page authorization and result semantics unchanged.
-- The old plan detoasted the full catalog for each original question number.
set local lock_timeout = '2s';
set local statement_timeout = '15s';
create index bank_sets_catalog_source_number
 on public.bank_catalog (space_id, (metadata #>> '{source,documentId}'),
   (metadata #>> '{source,originalNumber}'), created_at desc)
 where coalesce(metadata #>> '{relations,originalQuestionId}', '') = ''
   and coalesce(metadata #>> '{relations,derivedFromQuestionId}', '') = '';
create index bank_sets_committed_parent
 on public.bank_revisions (parent_id) where committed;
