# 2026-10-15 desktop upload recovery and print-path correction

## Installed desktop

Version 0.4.43 uses desktop fixes in `ef26793` and `8c2b4b5`.
The package also includes the five web PDF module changes committed with this
document; it was built from the preserved working tree, not a pristine 8c2b4b5
archive. The standard updater verified 3,931 installed files. Before/after
installation checks confirmed that 9,111 user-data files were unchanged.

- Unselected upload scope no longer inherits a previous paper's unit range.
  It uses the selected grade's default range; explicit user selections remain.
- Stored queue results can be recovered without rerunning AI. Recovery checks
  the stored content fingerprint and server commit before marking an upload done.
- Native PDF measurement now uses the same normalized font settings as output.
  Tall-question fragmentation receives resolved source assets.
- Active structured source figures count as original diagrams only when the
  referenced files and crop coordinates are valid. Hidden or missing figures
  still fail validation. Original warnings and review status are retained.
- One held problem no longer aborts all remaining stored-result recovery.

The normal package gates passed: 84 tests, zero skips, and the export contract.
On this PC, restricting the build process to two cores avoided concurrent test
contention without changing the protected test thresholds or release runner.
Actual failed Mokun/Wolchon snapshots also exported PDF and DOCX locally.

At the time of this record: Yangdong 24/24 and Mokun 24/24 queue uploads are
complete; Wolchon 23/24 is complete. Wolchon original 21 has an older committed
server revision whose solution differs from the current saved result. It is
intentionally not marked current. Normal single-question revision registration
is pending Windows UI activation. No new AI inference was performed.

## Web PDF correction

The direct past-print download omitted the document override sent by My Papers.
Consequently it omitted the current set/output-rendering signature and could
regenerate an already stored file when switching entry points. It now supplies
the same document and set validation through `nativePdfCache`.

Past-print rendering now accepts `questions`, `answers`, or `all`. Answer-only
requests load question/solution data but do not download/render question figures
or paginate question pages. Question-only requests skip answer layout. Stage
timings flow to the existing PDF result. No raster fallback was introduced.

Validation: a synthetic 24-question browser fixture produces the same page text
and page counts as full rendering (7 question pages and 2 answer pages). The
answer path performs 24 data loads and zero question renders; the question path
performs 24 renders and no answer layout. Six isolated PDF database/gateway/
session tests pass, including bookkeeping-insensitive cache reuse, invalidation,
atomic publication, group authorization, and watermark separation.

This is not a claim that every production menu and every PDF variant has been
retested. Full per-menu production audit, physical mobile/printing, and timing
comparisons remain separate verification work. Production deployment must use
`scripts/canonical-release.cjs deploy` and its resulting asset evidence.
