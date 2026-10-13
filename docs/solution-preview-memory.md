# Detailed solution preview memory (2026-10-14)

The reported case is Cheongdam middle school, grade 2, semester 2, triangle and
quadrilateral properties, 2023/2024/2025 midterms: 20 + 21 + 19 = 60 questions.
The real stored solutions produce 34 answer pages (1,814 formulas).

`solution-flow.js` previously cloned the entire answer stream into every page
and translated/clipped it. This multiplied DOM, math layout and paint work by
the page count. The answer stream contains about 52,000 elements; 34 clones
retained roughly 1.77 million elements. A desktop browser can survive this;
the user's phone reported a terminated tab. A physical phone crash was not
reproduced or diagnosed from device logs.

`solution-fragments.js` now reads the native column rectangles and text ranges,
keeps math nodes intact, and clones only each column's content. Measured widths
and offsets preserve subpixel column geometry. Content is retained once, with
small wrappers at column boundaries (52,639 elements for the real answer book).
Rendering yields periodically and honors cancellation. `past-print.js` reuses
the placed question pages and loaded data when changing only answer mode;
`past-print-render.js` renders the answers independently.

Validation:

- `node tests/solution-memory-browser.cjs`: long multi-column solutions, math,
  exact content order, visible math, page count, before/after pixel comparison,
  and a 60-question stress case. 363,080 elements became 36,510; 7,200 cloned
  formulas became 720. No test expectation for existing content was weakened.
- Optional `REAL_SOLUTION_SAMPLE=<private captured fixture>` runs the same
  comparison on the 60 real questions. All 34 pages were compared; inputs and
  images stay in ignored `artifacts/solution-memory`, not in Git.
- `node tests/past-print-browser.cjs`: selection/save/reopen, both answer modes,
  PDF export including all answer watermarks, mobile/desktop and navigation.
  Long fixture data is now set before opening the paper, since changing answer
  mode intentionally no longer reloads the questions. It asserts node identity
  and zero reader calls on the mode switch.
- `tests/solution-flow-local.cjs`: long solutions flowing through columns/pages,
  existing PDF export and editable DOCX; Python can come from EXAM_EXPORT_PYTHON.
- Real-data candidate UI: mobile touch emulation, 60 questions, 34 answer pages,
  repeated quick/detailed toggles, no additional question API requests and no
  page errors. Read-only source queries; no saved-paper/DB writes or AI calls.
- Actual PDF generated, reopened with Poppler, all 34 pages rendered and checked
  as a contact sheet. Physical Android/iOS browser and printer remain untested.
- Canonical 84 tests and export contract passed. An initial timing-only worker
  test exceeded 10 seconds while heavy browser comparisons were running; after
  those finished the unchanged test and full suite passed.

No database, RLS, download policy, stored questions, desktop installation or
HWPX XML changes. Do not restore the per-page whole-stream clone as a shortcut.
