# HWPX compatibility contract

The accepted 0.4.21 baseline (10fbd76) uses file version 5.1.0.1, XML/head 1.4 and hwpx-2018-profile-1. Generated paragraph properties use explicit margin and lineSpacing children. Equal template case/default branches are flattened; unused styles with genuinely different branches are preserved. Native equation width, height and baseLine remain zero for automatic measurement.

Do not introduce reader-specific paragraph branches, double fallback spacing, fixed equation boxes or a different template as a side effect of UI, grade, title or other feature work. e22743b reintroduced modern/legacy branches based on a local Hancom 2018 re-save; this differed from the accepted baseline. The 2026-10-13 repair removes that serialization pass while preserving the DOCX layout fixes and security metadata. It is not proof of the sole cause of the user's Hancom 2020 issue.

Run `node scripts/run-export-checks.cjs` before shipping changes to the shared export engine. `tests/test_hwpx_2018_profile.py` must validate the final emitted ZIP from the exact staged engine, including paragraph properties actually referenced by document paragraphs and native equation metrics. Test edits must preserve this compatibility contract rather than silently accepting a new structure.

Generate a representative real exam containing text, equations, tables and figures. Keep before/after files and inspect every rendered page. Treat PDF, DOCX, local Hancom 2018, Hancom 2020 and mobile output as separate acceptance scopes. A successful local opening or XML/package check does not establish Hancom 2020 rendering. Preserve editable text/equations/tables, question order, answer linkage, headers, footer, two columns and slot placement.

Automatic arrangement remains response format first (objective/non-written before written), then curriculum unit, then ascending difficulty within a known unit. Question sets remain consecutive in original member order. Preserve original order for restored source exams and user-arranged saved papers. Tests in `tests/mock-exam.test.cjs` and `tests/bank-exam-quadrants.test.cjs` protect ordering and layout independently.
