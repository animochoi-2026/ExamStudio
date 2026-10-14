# PDF output lifetime correction — 2026-10-14

The ordinary editor is opened inside `loadingTask`. That task cancels its
`initialLoad` guard after the initial preview finishes. `prepareDraftPdf` spread
the editor context into a new hidden editor, including that expired guard. The
hidden render returned false, producing “PDF 배치를 완료하지 못했습니다” despite
the visible preview being ready. The pre-fix source reproduced this on 390px and
1280px browser viewports (one expired-guard call, zero PDF render requests).

The editor now serializes its ready, paginated pages on a PDF cache miss. It no
longer rereads questions or repeats layout for an unchanged preview. Saved-paper
preparation owns a fresh initial-load lifetime and cannot overwrite the caller's
output handle. Real layout failures retain their specific error message.

The server cache, authorization, watermarks, original data, paper order, scores,
renderer engine and DB schema are unchanged. No migration is needed.

Validation: `node tests/pdf-lifecycle-browser.cjs` uses the real editor, reader,
loading-task lifecycle, PDF serializer and local Chromium PDF engine. Synthetic
25-question documents exercise real pointer clicks at 390/1280px, question-only,
quick-answer-only, combined, detailed answers, cache reuse without new reads or
render requests, saved-paper preparation after screen loading ends, and an actual
reader failure. Cache service/storage are fixtures, not production evidence.
PDF files are reopened for text/page inspection and rendered visually. Production
deployment and actual server download checks are recorded separately in
`release-records/pdf-layout-lifetime-20261014.json` after verification.

Physical mobile devices and physical printer output are not tested here.
