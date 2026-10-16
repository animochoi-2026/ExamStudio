# Queue completed-exam admission check (0.4.52)

Start and Resume now query `bank_queue_exam_preflight` before queue execution. The authenticated read-only RPC matches original SHA256 or the complete existing school/grade/year/semester/exam identity, retaining school ID checks when both sides supply IDs. Read access and request grade scope are enforced. It returns only committed, current, non-archived original questions, grouped by source document ID, plus the existing source progress/numbering facts. Source assets without committed questions are partial, not complete.

The app requires the server expected count to match all distinct original questions. Confirmed complete server state or a complete numbered inventory is required; duplicates, unknown numbers, missing/unexpected numbers and explicit partial/in-progress states prevent completion. Local held/failed/unknown/service-wait steps remain resume work.

One modal defaults all completed exams to exclude. Bulk exclude, confirmed bulk reupload, per-exam selection, cancel and proceed are available. No completed exams means no extra modal. Cancellation does not change queue state. Main-process approval is single-use, expires after five minutes and binds the queue snapshot; lookup failure or intervening changes block start. The queued original's hash is checked before lookup. Exclusions are refreshed on each start and are enforced by both item selection and stage admission.

Reupload retains recognition, solution and prior upload result/revision data and enters the unchanged safe upload path. This may reuse an already identical committed result. Protected correction metadata, source single-flight/claims, retries and concurrency are unchanged. No source deletion or blanket reset is introduced.

Validation: five bounded admission tests; seven isolated Electron DOM modal checks; seven adjacent recovery/source-upload tests; required canonical 84 tests and export contract. Server read-only probes matched a renamed original by SHA and an exam by full metadata; a different year did not match. Anonymous execute is denied. No live queue start, question upload or paid AI call occurred. New migration only: 20261016082240. No web, PDF renderer or Edge Function deployment.

Security advisor still reports existing repository-wide warnings, including authenticated SECURITY DEFINER RPCs. This RPC follows the existing private catalog/progress access pattern with explicit membership, per-revision permission checks, fixed empty search_path and revoked anonymous execution; it grants no table access.
