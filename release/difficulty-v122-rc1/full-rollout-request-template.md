# 전체 평가 별도 승인 요청서

현재 RC는 동결되었으며 전체 평가 승인은 없습니다.

- RC commit: 승인 시 실제 commit 지정
- 대상 문항 목록 및 snapshot hash: 승인 시 고정
- 제외 대상과 기존 성공 결과 재사용 조건: 승인 시 명시
- 정책: Luna/medium 전체 → 후보만 Sol/medium → 정의된 구조 실패만 Sol/high
- 단계별 병렬 3, 단계 간 동시 실행 0
- 최대 총 호출 수: 승인 시 대상 수와 단계별 상한을 명시
- 자동 재시도 0, 결과 미확인 자동 재호출 금지
- 이번 스모크: Luna 3회 구조 실패 기록 보존 후 수정 계약으로 Sol/medium 3회. 두 실제 계약 해시를 보존하며 최신 계약의 Luna 추가 호출은 하지 않음
- 운영 점수 활성화, 운영 데이터 수정, 웹/데스크톱 배포는 별도 승인

RC_READY_FOR_FULL_ROLLOUT=true
approved_for_full_rollout=false
requires_separate_user_approval=true
