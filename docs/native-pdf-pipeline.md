# Native PDF pipeline

The four web workflows use `native-pdf.js` to serialize the measured pages once.
Text, KaTeX and SVG remain native; original raster illustrations remain images.
Noto Sans KR regular/bold and KaTeX fonts are embedded as data resources. The
renderer blocks external requests and checks prepared fonts, images, page geometry
and per-question watermark positions. There is no full-page raster fallback.

`bank-native-pdf` validates the current account and delegates to the service-only
`bank_native_pdf_service`. Private slots are isolated by account, parent, variant,
section and answer mode. The signature includes document output settings, source
revision content/files, renderer version and watermark identifier. Parent access,
grade, expiry and the official download authorization are checked on every request.

The server reserves a pending object under a locked slot. Generation leases expire
after ten minutes. A verified R2 upload becomes active atomically; older objects
enter retryable cleanup. Parent deletion/archive/expiry invalidates slots, and the
minute cleanup job removes only keys in the native-pdf namespace. No original
question object is part of this cleanup. Existing v1 PDFs remain available to old
clients during the lazy migration.

The private Cloudflare renderer uses one Durable Object to serialize browser work
and reconnect to its own browser session. Each document uses a fresh isolated
browser context, closed after output. This avoids new-browser rate limits and
cross-user state. The idle session expires after sixty seconds. No HTML or PDF is
stored in the Durable Object; only the renderer session ID is retained.

Public web deployment remains `canonical-release.cjs deploy`. The separate private
backend deploy entry is `deploy-pdf-renderer.cjs`, which enforces the same baseline,
unchanged contracts, common tests, production asset check and shared release lock.
Its secret is server-side only. Apply only the two new PDF migrations, not db push.

Desktop output was already native Chromium PDF. Its new cache uses the same R2
gateway and account isolation, with a signature over selected questions, settings
and actual referenced file bytes. Unauthenticated local projects still use local
native output; they cannot store private PDFs in an authenticated cloud cache.
DOCX/HWPX retain their existing measurement and export contracts.

Validation evidence and production status are recorded separately in the release
record when deployment has been verified. Physical printer output is not implied
by PDF generation or browser tests.
