# v1.2.1 desktop and activation request: preflight

The execution request was read from the attached `1-문제공방-난이도-v1.2.1-데스크톱적용-운영전환-통합요청서.md`. It authorizes desktop release and subsequent atomic activation, with no AI calls, body edits, or bulk migration push. It also requires matching evaluation versions and input hashes, and explicitly requires stopping when any activation gate fails.

## Completed preparation

- Canonical checkout includes the shared canonical commit. Starting HEAD: `9d105608a30eb457fba480f788a1f411320301fe`.
- `scripts/preflight-difficulty-v121-final-set.cjs` joins the accepted audit results without invoking validators/scorers or AI. It checks evidence hashes, selected result status, score/tier presence, uniqueness, target membership, and original target revisions.
- Frozen local candidate set: `artifacts/difficulty-v121/activation-preflight-20261019/candidate-manifest.json`. Its IDs are content-addressed artifact references, not imported DB evaluation IDs. Its batch is not activated.
- 1,266 selected, failed 0, unresolved 0, missing score/tier 0, duplicate questions/results 0. 3,770 evidence files were hash checked.
- Distribution: T0 715, T1 0, T2 464, T3 86, T4 0, T5 1. No scores were recalculated.
- Read-only production query found no `bank_v121.jobs` rows. Three sampled current catalog rows still contain the original, uncorrected content. Query evidence is in `database-readonly-check.json` next to the candidate manifest. Full current revision/content/image comparison is not complete.

## Blockers under the requested exact-match contract

1. Original call prompts: base 1,259 and intended-answer 7. They have different actual prompt hashes. Among selected full records, 1,188 use normalizer 6 and 64 use normalizer 7; 14 more accepted results live in separate review artifacts. The separate answer-equivalence review also preserves its historical normalizer-7 record. Do not relabel historical versions as a single hash.
2. Fourteen accepted review results need an explicit production review envelope. One of these selects a successful saved-response review while preserving a historically failed runner record. That runner record must not be silently changed to complete.
3. Seven intended-answer evaluation inputs differ from their original inputs. Three additional local corrections change question text/choices: 청담중 2023 2학기 기말 1 (넓이비 → 닮음비), 신구중 2025 2학기 기말 6 (선지④ DE → DF), 신구중 같은 시험 5 (원기둥 → 원뿔 in an explicitly reviewed derivative). Production originals remain unchanged.

Proposed resolution for user decision: preserve actual historical versions in an explicit allowlist, retain separate source-content and reviewed-evaluation-input hashes linked by the approved review, and use the latest common normalizer and intended-answer policy for future desktop evaluations. Keep identical schema/scorer constants, all historical responses and warnings, and do no AI reevaluation. This changes the request's single-version/single-input-hash gate, so it was not applied automatically.

No app policy change, desktop build/install, server migration, score activation, cache refresh, or production write was performed. AI calls 0, Computer Use 0, production body/answer/solution changes 0. Local script syntax and its complete join/assertion run passed. DB transaction/rollback tests have not run because no activation implementation was changed.

Do not run the older bulk import as a substitute: its original run contains failed/unresolved records and it does not join this final accepted set. The frozen candidate manifest must be preserved; the preflight script intentionally refuses to overwrite it.
