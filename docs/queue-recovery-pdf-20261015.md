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

## Final desktop recovery and remaining PDF blocker

Desktop 0.4.44 (source `60e8085`) is installed. All 3,931 package files match;
9,143 user-data files were unchanged during installation. Yangdong, Mokun and
Wolchon now each show 24/24 uploaded. Read-only server verification found all
72 committed current heads and zero automatic review approvals. Wolchon 21 was
registered as a new revision through the existing UI, then reconciled using
the exact input signature and latest remote revision. No new AI calls were
made; the queue usage counter remains 1,131. Original-number and total-count
warnings are retained and are not upload failures.

Web deployment `9bb1885a` (`9a6c7b9`) exposes the actual HTTP error body before
closing the request. All 342 assets match on both deployment and production
URLs; an initial propagation mismatch was resolved by an independent complete
hash verification before releasing the deployment lock.

The actual MuHak 52-question button returned Cloudflare browser-launch 429.
The account dashboard shows Workers Free and eight sessions on 2026-10-15 UTC
totalling 662 seconds against the documented 600-second daily allowance.
Seven sessions ended after idle timeout. The renderer now reuses a browser
only for already queued work and closes it after the final request. Source
`7c06978`, renderer version `35e16d8e-96f0-4620-95f7-f0f22d2d8134` deployed;
84 common checks, export contract, session cleanup and sequential queue tests
pass. Anonymous requests still return 403. This does not restore the already
consumed allowance. Billing was not changed; the user was asked whether to
wait for the reset or upgrade themselves. Actual post-limit PDF success and
the full per-menu audit remain unverified. See `release-records/pdf-quota-20261015.json`.
