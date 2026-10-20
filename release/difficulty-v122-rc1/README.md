# Difficulty v1.2.2 RC1 — local freeze

운영 배포와 전체 평가 승인은 없습니다. 난이도 수학 기준·C/R/B/H·M2 projection·승급 게이트·scorer 산식은 유지했습니다.

## 이번 계약 수정

- source_manifest_hash는 요청 전에 고정한 시스템 envelope에만 보관합니다. 모델 출력으로 덮어쓸 수 없으며 request/question/revision/basis/source/input 연결을 확인합니다.
- target_statement_id와 conclusion_discovery_id를 분리합니다. 입력의 target_conclusion_relations가 같은 route와 target에 선언된 실제 discovery 선택 관계를 지정하며 존재·branch·연결을 각각 검사합니다. 별도 결론 ID를 발명하거나 없는 discovery를 참조하면 실패합니다.
- shared premise/answer aggregation 및 난이도 산식은 변경하지 않았습니다.

## 검증과 실제 스모크

변경 범위 검사 55개 통과, 외부 I/O 격리 4개 통과 증거 재사용, 실패 0. 1,252 corpus와 4,216 역사 검사 전체는 재실행하지 않았습니다.

| 문항 | 최종 모델 | 점수 | 티어 | 확인 |
|---|---|---:|---|---|
| 신동중 11 | Sol/medium | 1.4 | T0 | shared premise 한 번 계산, assembly 없음 |
| 신동중 13 | Sol/medium | 4.7 | T2 | M2 반례, assembly 없음 |
| 신동중 9 | Sol/medium | 8.6 | T4 | convergence assembly |

실제 신규 호출: Luna/medium 3회, Sol/medium 3회, Sol/high 0회, 자동 재시도 0회. 단계별 병렬 3이며 세 Luna 응답 종료 후 Sol 후보 manifest를 동결했습니다.

**검증 범위:** 최초 Luna 3건은 결론 연결 구조 실패였습니다. 허용된 로컬 wire 계약을 수정한 뒤 기존 실패를 후보 근거로 보존하여 Sol/medium 단계만 진행했습니다. 최신 계약으로 Luna를 다시 호출하지 않았습니다. 서로 다른 두 단계의 실제 prompt/schema/criteria hash를 보존했으며 최초 실패를 성공으로 바꾸지 않았습니다.

기존 신구중 10번 4.8/T2 승인 projection과 30개 legacy non-blocker는 원래 해시와 provenance를 보존했습니다. 운영 카탈로그 1,629행, 평가 결과 1,266행, activation batch 1행의 전후 전체 행 해시는 동일합니다.

## 동결 산출물

- [전체 파일 및 최종 해시](release-candidate-frozen.json)
- [복구 패키지](rollback-package.json)
- [전체 평가 준비 상태와 검증 한계](full-rollout-readiness.json)
- [전체 평가 별도 승인 요청서](full-rollout-request-template.md)

RC_READY_FOR_FULL_ROLLOUT=true
approved_for_full_rollout=false
requires_separate_user_approval=true

운영 write·배포·전체 corpus AI 재평가·Computer Use: 모두 0.
