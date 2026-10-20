# Difficulty v1.2.2 전체 재평가 별도 승인 요청서

- 동결 후보: difficulty-v122-successor-overlay-20261021
- 소스 commit: e93ab0089e001f6f7238e248f0f26ac1c3cd07ee
- bundle hash: b03f9709b4a6350e5c6d7eee04f5be069529861c6e328c0c3c7a2a557711327a
- criteria payload hash: dee40ef2a609f22cea13c835deb40ff620bd024f6c87365703737bcd8bc1198b
- 검증 방식: 기존 실제 Luna raw 3건의 최종 계약 재생, 신규 AI 호출 0회
- 새 대상 ID/revision/입력 snapshot 및 제외 목록: 별도 승인 시 고정
- 모델: gpt-6-luna/medium → gpt-6.1-sol/medium → gpt-6.1-sol/high
- 전체 Luna/medium 완료(동시성 3) → Stage 2 후보 manifest 동결 → 후보 전체 Sol/medium 완료(동시성 3) → Stage 3 후보 manifest 동결 → 구조 실패 후보 전체 Sol/high 완료(동시성 3) → 최종 병합
- 서로 다른 stage 동시 실행 0, 자동 재시도 0, 결과 미확인 자동 재호출 금지
- 단계별 대상 수·최대 신규 호출 수·총 상한: 별도 사용자 승인에 명시
- 운영 write/점수 활성화/배포는 별도 승인

RC_READY_FOR_FULL_ROLLOUT=true
LUNA_LATEST_CONTRACT_SMOKE_PASSED=true
approved_for_full_rollout=false
requires_separate_user_approval=true
full_rollout_started=false
