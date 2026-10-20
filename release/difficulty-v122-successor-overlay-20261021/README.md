# Difficulty v1.2.2 successor RC — 저장 Luna 응답 재생 동결

기존 실제 Luna 응답 3건을 최종 계약으로 재생해 통과했다. 이번 작업의 신규 AI 호출은 0회다. 기존 frozen RC와 과거 실패 기록을 보존했다.

## 변경 범위

- 릴리스 검사에서 11번의 과거 `score == 1.4` 조건 제거.
- 구조·identity·overlay·T0 band·승급 없음·assembly 없음·Stage 1 확정 조건 유지.
- 현재 저장 응답의 계산 결과 `1.2/T0`는 관찰값으로 검증하며 scorer 출력에 대입하지 않음.
- 이번 요청에서 evaluator/prompt/Schema/scorer/overlay/Edge bytes 변경 0. 앞서 승인된 evidence/overlay 변경을 포함한 현재 후보를 successor 소스 commit으로 보존.

## 결과

| 대상 | 저장 응답 재생 | 라우팅 |
|---|---|---|
| 신동중 11번 | 1.2/T0, promotions 없음, assembly 없음 | Stage 1 확정, Stage 2 후보 0 |
| 신동중 13번 | 4.7/T2 불변, 비자동 M2 유지, assembly 없음 | Stage 1 확정 |
| 신동중 9번 | 6.7/T3 불변 | Stage 2 후보 1, 중복 0 |

11번: shared premise 연결 1, 중복 0, required 5, system context 1, excluded aggregation 1, optional 0. 공통 전제와 답 모음의 discovery/assembly/execution 집계는 0이다.

역사 비교:

```text
historical_reference_score=1.4
historical_reference_tier=T0
current_replay_score=1.2
current_replay_tier=T0
exact_decimal_match_required=false
tier_match=true
semantic_contract_match=true
```

## 검증 범위

- 최소 코드 검사: 8 통과 / 0 실패.
- 저장 응답 재생: 3 통과 / 0 실패.
- 11번 세부 acceptance: 17 통과 / 0 실패.
- 포장 검증: 실제 응답 3건의 원래 API 성공·Schema·raw hash 확인. 원래 요청의 identity/계약 hash와 현재 재생 hash를 각각 보존.
- source commit 파일 93개, 증거 28개, parent 보호 파일 148개 해시 불일치 0.
- 원래 rendered payload의 Markdown 줄바꿈용 공백 12곳은 원본 해시 보존을 위해 유지했다. 새 작성 파일의 whitespace 검사는 통과했다.
- 전체 Preflight/corpus/cache/역사/queue/GUI 검사는 재실행하지 않음.
- 이전 대표 진입점 mock 증거를 보존. 그중 Edge mock은 overlay 없는 대표 경로였으며 이번에 새 Edge 실행은 하지 않음.

## 동결

- source commit: `e93ab0089e001f6f7238e248f0f26ac1c3cd07ee`
- bundle hash: `b03f9709b4a6350e5c6d7eee04f5be069529861c6e328c0c3c7a2a557711327a`
- criteria payload hash: `dee40ef2a609f22cea13c835deb40ff620bd024f6c87365703737bcd8bc1198b`
- bundle hash는 코드 파일 경로→파일 SHA256 맵의 canonical JSON SHA256이다.
- 이 디렉터리를 추가하는 release commit은 위 source commit의 후속 commit이며 evaluator bytes는 같다.

산출물:

- [release-candidate-frozen.json](release-candidate-frozen.json)
- [rollback-package.json](rollback-package.json)
- [full-rollout-readiness.json](full-rollout-readiness.json)
- [full-rollout-request-template.md](full-rollout-request-template.md)
- [latest-luna-contract-replay-attestation.json](latest-luna-contract-replay-attestation.json)
- [freeze-verification.json](freeze-verification.json)

```text
verification_mode=actual_luna_response_replay
new_ai_calls=0
source_response_was_actual_luna=true
source_response_api_passed=true
source_response_schema_passed=true
final_contract_replay_passed=true
LUNA_LATEST_CONTRACT_SMOKE_PASSED=true
RC_READY_FOR_FULL_ROLLOUT=true
approved_for_full_rollout=false
requires_separate_user_approval=true
full_rollout_started=false
```

위 smoke 상태값은 기존 실제 응답의 최종 계약 재생 통과를 의미한다. 새 모델 호출을 의미하지 않는다.

신규 Luna/Sol/재시도/다른 문항 호출, 운영 write, 배포, 전체 corpus 호출, Computer Use 모두 0. 전체 재평가는 미시작이며 남은 hard blocker는 없다. 운영 적용 완료를 의미하지 않는다.
