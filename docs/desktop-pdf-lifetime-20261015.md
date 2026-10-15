# Desktop PDF lifecycle correction

The installed 0.4.44 scope and upload reconciliation changes are preserved.
Desktop preview/export uses Electron `webContents.printToPDF` locally. Its
`bank-native-pdf` operations are claim/read/upload/abort, never cloud render;
Cloudflare Browser Run allowance is not consumed by this native path. Opening
the production website in an external browser still uses the website pipeline.

0.4.45 bounds the hidden print window lifetime to 180 seconds, destroys it on
success/failure/timeout, prevents late results from publishing after timeout,
and allows a new attempt. Images/fonts are awaited again after fragmentation,
which can reconstruct image elements. No raster-page fallback is introduced.
Existing authorization, watermark, R2 cache, abort and atomic publish are kept.

Validation: 9 targeted tests; canonical 84 tests; export contract passed with
the bundled dependency Python. Actual isolated Electron tall-figure export and
measurement passed (55,920 bytes), as did the math-unit fixture. Cache service
test uses a controlled fake service: one local generation and upload, repeated
download with identical bytes, changed-document failure/abort and successful
retry. This is not a live R2 cache acceptance test.

Known unresolved regression: `tests/desktop-pdf-columns.cjs` reports blank page
5 on the long-answer fixture. Re-executing the same test with HEAD 3019197's
unmodified pdf-export module gives exactly the same failure. The final page is
visually blank. No test assertion was relaxed and no PDF page was deleted.
Full production menu/variant acceptance, live desktop cache reuse and physical
printing remain unverified. Cloudflare quota reset/plan upgrade is not performed.

No AI, DB migration, source question modification, queue edit or web deployment
is part of this desktop correction. Installation and hashes are recorded
separately after applying the standard ZIP updater.

Installed 0.4.45: 3,932 package files verified, 9,143 user-data files
unchanged during installation. Restarted with the existing R2 shortcut. Actual
Preview button on the unchanged current Wolchon selection displayed 3 PDF
pages. Cache-hit status was not measured. All three recovered queues remain
24/24 uploaded and idle.
