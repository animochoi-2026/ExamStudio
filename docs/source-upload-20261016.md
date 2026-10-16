# 동일 원본 업로드 공유 (2026-10-16)

기준 49ed9a7, 데스크톱 0.4.48 → 0.4.49. PDF 출력·웹 학교 목록은 변경하지 않는다.

- `app/source-upload.cjs`: 서버/저장공간/사용자/sourceKey/SHA256 기준 single-flight. 같은 원본의 대기 문항은 추가 전송 없이 결과를 공유한다. 문항 처리 상한 설정은 유지하며 전체 스케줄러를 변경하지 않는다. 대기 문항은 기존 문항 슬롯을 유지하되 원본 네트워크 요청은 중복 실행하지 않는다.
- `bank_source_upload_claim`: 기존 예약된 source entry 행을 잠가 원자적으로 claim. 비공개 RLS 테이블, auth.uid/멤버십/읽기 권한/소유자/SHA 검사, 5분 lease. 조각 전송/검증 전 갱신, 실패 시 release, 종료/응답 유실 시 만료 후 인계. 다른 claim은 대기하며 45초 대기 후 기존 제한 재시도로 넘긴다. 이전 앱의 미협조 업로드까지 권한을 완화하지 않으며 기존 verified 덮어쓰기 금지를 유지한다.
- `shared-bank-storage.cjs`: 검증 완료 여부/해시 확인 후 재사용. 미검증 파일의 기존 조각도 조회/해시 대조하여 재전송하지 않는다. 원본 403은 동일 entry/sourceKey/space/SHA/크기, 현재 사용자 소유·멤버십·인증된 읽기·verified가 모두 확인될 때만 재사용한다. 다른 403/파일 충돌은 차단한다.
- sourceUpload는 원본 진행만 보존하며 문항 commit 여부를 변경하지 않는다. 공용 원본 성공 후 각 문항 등록을 계속한다. 기존 통신 재시도/공유 인증/교정 이력 로직은 유지했다.

## 최소 검증

`tests/source-upload.test.cjs` 3개 통과: 두 문항 전송1/검증1/각 문항 후속 처리; 검증 완료 전송0/검증0; 재전송 경합403 재사용 및 다른 소유자/ID/권한 없음 차단. 첫 검사 안에서 실제 신규 SQL을 격리 PostgreSQL에서 실행하여 claim 독점·만료 인계·이전 token 차단을 확인했다.

운영 신규 SQL `20261016034437_source_upload_claim` 적용. 인증 역할의 역삼 원본 claim 응답 verified를 rollback 트랜잭션에서 확인. 같은 SHA의 원본 예약 행은 1개, verified, 487301바이트. 원본/중복 자산 삭제 없음. 보안 advisor의 private RLS-no-policy와 authenticated SECURITY DEFINER 표시는 의도된 RPC 경계이며 공개 EXECUTE는 차단하고 회원/소유자 검사를 구현했다. [Supabase 함수 보안](https://supabase.com/docs/guides/database/functions), [advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

실제 운영 업로드·AI는 실행하지 않는다. 설치와 정지 상태 복구는 후속 기록으로 구분한다.
