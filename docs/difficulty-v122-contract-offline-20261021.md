# Difficulty v1.2.2 — 별도 계약 후보 오프라인 검증

기존 frozen Successor RC를 그대로 보존하고, `difficulty-v122-contract-offline` worktree에서 생성 계약만 수정했다. 추가 AI 호출·운영 변경·배포는 없다. 전체 재평가를 재개하지 않았다.

## 기준과 후보

- 기준 commit: `5f8a58356de25329036c6cd73060f5561dd64e59`
- 기준 bundle: `b03f9709b4a6350e5c6d7eee04f5be069529861c6e328c0c3c7a2a557711327a`
- 기준 criteria payload: `dee40ef2a609f22cea13c835deb40ff620bd024f6c87365703737bcd8bc1198b`
- 후보 criteria payload: `33ad3f94a6c210d8cf077d69edee0cc77909b74990620007630364d65a2f35ff`
- 기준 보존 tag: `codex/difficulty-v122-contract-offline-baseline-20261021`

criteria payload hash는 평가 디렉터리 전체 파일의 identity이므로 출력 계약 코드 변경으로 달라진다. 수학적 기준 변경을 의미하지 않는다. 원래 frozen release manifest는 역사적 기준으로 남으며 이 후보의 유효 release manifest로 사용하지 않는다.

## 수정 범위

`wire-contract.cjs`에 생성 전용 제약을 추가하고 `schema.cjs`, `prompt.cjs`에서 연결했다.

1. 동일 basis·role·route에 근거 관계가 유일하면 모델이 ID를 다시 고르지 못하도록 빈 `evidence_relation_ids`를 사용한다. 기존 validator의 유일 관계 자동 연결과 정확히 같은 기준이다.
2. 복수 관계에 대해서만 명시적 ID 선택을 허용한다. unique/shared 관계 ID는 그 선택 목록에서 제외한다. 선택한 ID와 basis·role·route·target의 최종 결합 검사는 기존 validator가 그대로 수행한다. 복수 근거를 합쳐 사용하는 분석 노드를 단일 근거로 강제하지 않는다.
3. `structure_audit`의 기존 규칙을 출력 JSON Schema에 반영했다. true이면 공백이 아닌 evidence, false이면 공백이 아닌 non-trigger reason과 direct-clue quote를 요구한다.
4. 이미 사용자 승인된 role overlay의 출력 Schema·프롬프트는 원형을 유지한다.

서로 다른 JSON 필드의 모든 조합을 생성 Schema만으로 보장한다고 주장하지 않는다. 복수 관계의 정확한 연결은 기존 strict validator가 계속 거부·검증한다. 기존 응답의 잘못된 명시적 ID를 자동 삭제하거나 교체하는 복구 코드는 없다.

수학 지침 `prompt.json`, 정적 내부 `schema.json`, C/R/B/H·M2·티어·승급 정책, source builder/review, evidence·response validator, projection, scorer 및 stage runner를 수정하지 않았다. 신구중 10번의 승인 projection도 유지했다.

## 저장 응답 4건

입력·원시 응답·호출 envelope·당시 Schema·렌더링 프롬프트를 원래 staging에서 byte-identical 복사하고 hash를 확인했다.

| 문항 | 원본 결과 | 명시적 ID만 빈 배열로 바꾼 진단용 복사본 |
|---|---|---|
| 광희중 2025 13번 | 동일한 관계 결합 오류 | 답 취합 역할에 허용 관계가 없어 실패 |
| 목운중 2026 20번 | 동일한 관계 결합 오류 | 후속 검증 통과 |
| 청담중 2023 8번 | 동일한 관계 결합 오류 | 후속 검증 통과 |
| 신구중 2026 16번 | 동일한 관계 결합 오류 | 직접 단서 인용 2개 누락으로 실패 |

원본 4건은 모두 실패 상태로 남아 있다. 진단용 복사본은 새 모델 응답이나 완료 평가가 아니며 점수 결과·checkpoint·ledger에 등록하지 않았다. 진단용 복사본을 기준 RC와 후보 validator에 각각 넣은 결과는 완전히 같았다. source 역할, 축, 의존 관계, 작업량, audit 판단은 복사본에서도 변경하지 않았다.

광희중은 [별도 역할 검토안](difficulty-v122-gwanghui13-role-review-20261021.md)만 작성했다. 역할 주석·span 분할·overlay를 적용하지 않았다. 신구중의 인용을 추측해서 채우거나 인용 요구를 완화하지 않았다.

## 검증 결과

- 새 계약 회귀 검사 16개 통과.
- 기존 근거 관계 22개, 승인 role overlay 19개, 신구중 10번 5개 통과.
- 저장 4건의 generation schema와 빈 문자열·공백·true/false 조건을 Python JSON Schema로 144회 검사하여 전부 통과.
- 원본 frozen 코드 93개 hash 일치. 핵심 기준·source·validator·projection·scorer 등 보호 파일 18개는 후보에서도 동일하다.
- 전체 선택 검사: 기준 92개 중 86개 통과/6개 실패, 후보 108개 중 102개 통과/동일 6개 실패. 신규 실패는 없다.

기준부터 존재하는 6개 실패는 다음과 같다. 기존 기대값이나 과거 fixture를 수정하지 않았다.

| 구분 | 건수 | 원인 |
|---|---:|---|
| 과거 로컬 fixture 부재 | 3 | response-contract의 before.json·DB write detector, formula-targets의 과거 manifest |
| 로컬 의존성 부재 | 1 | phase-batch의 이미지 검사에 필요한 `sharp` 없음 |
| 기존 계약과 테스트 기대값 충돌 | 2 | source hash가 입력 전체에서 없어야 한다는 기대값, 이미 제거된 역할별 모델 출력 필드를 참조하는 portability 검사 |

JSON Schema 검사는 로컬 의미 검증이다. 새 Schema를 실제 Luna/Sol에서 받아 새 응답을 생성하는 검증은 하지 않았다.

## 산출물과 재현

- `artifacts/difficulty-v122-contract-offline/inputs/`: 원본 4건의 복사본과 해시 manifest
- `artifacts/difficulty-v122-contract-offline/diagnostic-only/`: 진단용 복사본, 평가 결과 아님
- `artifacts/difficulty-v122-contract-offline/offline-regression.json`: 재현·실패·보존 증거
- `artifacts/difficulty-v122-contract-offline/schema-validation.json`: JSON Schema 검증 결과
- `artifacts/difficulty-v122-contract-offline/baseline-tests/`, `candidate-tests/`: 수정 전후 검사 로그
- `release/difficulty-v122-contract-offline-20261021/candidate-manifest.json`: 후보 파일 hash와 준비 상태

후보 폴더에서 다음 순서로 오프라인 재현할 수 있다. 입력 복사본과 기존 frozen worktree가 필요하다.

```powershell
node scripts/check-difficulty-v122-contract-offline.cjs
python scripts/check-difficulty-v122-wire-schema-offline.py artifacts/difficulty-v122-contract-offline artifacts/difficulty-v122-evidence-rc/schema-deps
$env:EXAMSTUDIO_TEST_OUTPUT = Join-Path (Get-Location) 'artifacts/difficulty-v122-contract-offline/recheck'
node scripts/test-offline.cjs tests/difficulty-v122-wire-contract.test.cjs tests/difficulty-v122-evidence.test.cjs tests/difficulty-v122-role-overlay.test.cjs tests/difficulty-v122-shingu10-approved.test.cjs
```

## 상태

코드 수정·요청된 오프라인 회귀 검증 완료. 광희중 역할 미확정, 신구중 인용 누락, 실제 신규 생성 계약 미검증으로 전체 재평가 준비 완료 상태가 아니다.

`approved_for_full_rollout=false`, `RC_READY_FOR_FULL_ROLLOUT=false`, 추가 AI 호출 0, productionWrites 0, deployments 0, Computer Use 0, 브라우저 자동화 0, PDF 생성 0.

기존 staging의 `full_rollout_started=true` 이력은 그대로 보존한다. 기존 run의 완료 상태를 변경하지 않았고 새 후보 평가는 시작하지 않았다. snapshot·checkpoint가 다른 후보 hash로 재사용되도록 변경하지 않았다.
