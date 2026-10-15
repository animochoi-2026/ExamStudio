# Desktop scope and stored upload recovery

The queue start dialog used a remembered grade/semester/exam scope from another
school as the initial selection. Unspecified scope now remains the full selected
grade. Explicit saved choices remain; changing grade clears the choice. OCR's
legacy display scope cannot confirm an unknown queue scope.

Tall structured questions were initially rendered with resolved print assets,
but the pagination fragmenter received the bare snapshot. It now receives the
same print snapshot, preserving both structured diagrams and original crops.

The scope scanner no longer treats an explicit “원주각 정리가 아니라 …” statement
as use of that theorem. Explicit used-concept reports and actual uses elsewhere
still trigger the existing restriction. Saved-result rechecking preserves source
warnings, original content and teacher review state.

`examQueueRecoverStored` recovers only unfinished questions of the chosen exam.
It reuses saved solutions and combined classification; missing results are held
without dispatching AI. Existing remote commits are checked before retrying an
upload, and unfinished upload job/revision IDs are retained. Other exams are not
resumed. No source file is moved and no teacher approval is granted.

Validation before installation: 49 queue/scope/integration checks passed with
isolated PostgreSQL and simulated transport/AI; the actual Edge verifier remains
in the fixture. The fixture now supplies the platform's EdgeRuntime.waitUntil.
The missing-scope test explicitly removes grade as well, since a known grade
now intentionally supplies a default range.

Electron tall-question PDF regression passed with synthetic structured figures.
Read-only copies of the two failing upload snapshots also produced PDFs: 127700
and 248288 bytes, each one question page plus its existing answer content. No
production source snapshot was rewritten. Installation and remote recovery
results are recorded separately after verification.
