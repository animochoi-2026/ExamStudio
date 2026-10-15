# Browser image PDF transition

The user's final decision on 2026-10-15 replaces native server rendering with
the previous scale-3 PNG/browser PDF contract. This intentionally supersedes
earlier text/vector requirements. It does not roll back other features.

`image-pdf.js` uses the former `web-export.js` implementation from the parent
of c8e7c0b: sequential html2canvas pages, separate math painting, PNG, jsPDF FAST,
A4, and the existing per-question watermark. Canvases are released per page.
`image-pdf-cache.js` checks the authenticated server slot before invoking its
lazy preparation callback. Editor, saved library, restoration, mock papers and
past-print use it. "기출프린트" and "직전대비 프린트" are the `past-print` route.
Mock batch output keeps its ZIP of individual PDFs; it does not rasterize a
previous PDF again. Existing desktop output uses the same image module.

`bank-image-pdf` validates Auth, parent/group/grade access and download tickets.
Private slots identify space, actor, parent, variant, section, mode and watermark.
The final R2 key is `<space>/image-pdf/<slot>/current.pdf`. The server hashes
actual uploaded bytes, checks header/EOF/size, backs up the committed file,
copies the validated temporary object to the stable key, and commits metadata.
A lost commit response is reconciled before rollback. Scheduled recovery handles
interrupted promotion; failed temporary uploads are garbage-collected. Read URLs
are short-lived and no-store. Browser keys are never trusted as upload targets.

Expiry is the saved parent's original created_at plus six calendar months,
never extended on download or replacement. Local desktop slots cap client dates
at server now and retain the first slot expiry. Cleanup touches PDF-derived keys
only. Original assets and all historical migrations remain intact.

Rollout is additive first: image service/schema/CORS; then tested web/app;
then the separate retirement migration and old gateway generation guard.
Old native PDF reads and expiry remain available; no bulk conversion runs.

Controlled validation: 7 cache/gateway/desktop tests pass; stable key, failure
rollback, lost responses, lease/cancellation, permissions, watermark separation,
expiry and old-cache retirement. Actual Chrome generated 2 and 34 synthetic
pages (158658 bytes / 3.413 seconds; 2693796 bytes / 41.008 seconds). These are
not the user's Cheongdam or Muhak documents. 390px completion dialog fits.
Cancellation at page 9/34 produced the cancelled state. The confirmation now
uses accessible in-page buttons instead of a browser-native dialog.

Actual isolated Electron long-answer export passes the new contract: one
scale-3 image per A4 page, measured answer columns, complete 120 solution-step
DOM and no overflow. Its former native-text assertions were replaced because
native text is explicitly no longer the requested PDF format. DOCX/HWPX
contracts remain unchanged.

Production menu acceptance, real document timings, overwrite/cache readback,
deployment hashes and hardware boundaries are recorded separately in the final
release record. Code/test evidence alone does not establish those outcomes.
