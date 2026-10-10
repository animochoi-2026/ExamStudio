# 동결 준비 최소 설치 — 2026-10-10

기준 후보: `0e272251fc30b9e7da95645e4717560795d6c51c`.
분리 브랜치: `codex/r2-freeze-preparation`. 원래 준비/기본 작업 트리는 수정하지 않는다.

## 적용 범위
- `supabase/migrations/20261010132634_r2_freeze_preparation_only.sql`만 설치한다.
- private settings(provider=Supabase 고정, frozen=false), 원래 함수 정의 백업, 대상 테이블 목록, 관리/차단 함수.
- 기존 파일 읽기·쓰기 및 삭제 권한 함수 2개의 정확한 원래 술어를 private으로 보존하고 비동결 조건만 추가한다. 기존 owner/ACL은 유지한다.
- public 자료 테이블 24개에 statement 쓰기 차단 trigger. 회원·초대·감사 테이블 제외는 기존 후보와 같다.
- 기존 이전 CLI가 호출하는 `bank_storage_status()`는 기존 service_role만 조회 가능. 일반 로그인 사용자/anon에는 새 권한이 없다.
- 관리는 비공개 `bank_storage_private.set_frozen(boolean)`을 DB 소유자가 실행하는 방식. 운영 설치 과정에서 호출하지 않는다.
- provider 제약은 Supabase만 허용하며 전환 API가 없다.
- 서버 기능은 PostgreSQL RPC로 충분하다. Edge, 웹, Electron, R2 Secrets, 파일 참조, 운영 파일은 변경하지 않는다.
- SQL에는 현재 운영 함수 hash 및 대상 테이블 목록 사전조건, 2초 lock timeout/30초 statement timeout이 있다. drift/lock 오류면 전체 rollback 후 중지한다.

## 백업과 복구
- 커밋 제외 로컬 백업: `tests/artifacts/r2-freeze/production-before.json`.
- 현재 운영 bank 테이블 29개 및 storage.objects 구조·열·제약·색인·trigger·RLS·ACL, 변경 대상 함수 2개 정의/owner/ACL, Storage 정책/버킷 공개 설정, default ACL, 준비 스키마/상태 함수 부재를 캡처했다.
- 파일/행 데이터는 변경하지 않으므로 과거 데이터 snapshot으로 덮어쓰는 복구는 하지 않는다.
- `freeze-preparation-rollback.sql`은 Supabase·비동결 상태에서 설치한 함수 정의가 달라지지 않았는지 확인하고 정확한 원래 함수 정의를 복원하며 추가 trigger/준비 객체만 제거한다.
- 복구 SQL 실제 실행은 네트워크 없는 로컬 PostgreSQL에서 확인했다. frozen 상태에서는 복구를 거부한다.
- 기존 `schema-proposal.sql`과 `schema-rollback.sql`은 R2 전환 초안이다. 이번 설치 뒤 그대로 실행할 수 없으며, 다음 전환 단계에서 현재 최소 설치를 출발점으로 별도 차분·검증해야 한다.

## 기존 증거 인수
- 원본 인증, 목록/메타데이터 preflight, 로컬 실제 Edge/Auth/RLS/R2 통합 11개, 회귀 52개, 웹/Edge 빌드, Electron 패키징은 `current-validation.json`과 후보 commit 기록에서 인수하며 반복하지 않았다.
- 운영 bank-verify 소스는 후보의 ignored artifacts에 보존. `deployed-source-comparison.json`의 비교 대상은 base `ee53fb2`이다. 의존 9개는 byte 일치, entrypoint 정규화 JS 일치.
- 운영과 R2 후보는 완전히 같은 코드가 아니다. 후보는 bank-verify의 파일 읽기를 fileStore/readObject로 대체한다. 이번에는 이 R2 변경을 배포하지 않아 운영 v5를 보존한다.
- 운영용 키 `examstudio-r2-runtime-20261010`은 준비 키와 별도로 DPAPI 저장 및 인공 파일 검증 완료 기록이 있다. 표시 만료 2027-04-10, 정확한 시간대 미확인. 운영 Secrets 미등록. 기존 1주 준비 키를 상시 운영용으로 사용하지 않는다. 비밀값을 읽거나 출력하지 않았다.

## 새 검증
- 네트워크 없는 일회용 로컬 PostgreSQL에서 최소 SQL 13개 항목 통과: 기본 상태, 기존 ACL/술어 동일성, 일반 사용자·서버 역할의 상태변경 거부, 읽기 보존, 24개 대상 쓰기 차단, 해제, 정확한 복구, 진행 중 트랜잭션과 동결 변경의 대기/timeout.
- 이는 새 SQL만의 시험이며 helper 의존은 인공 fixture이다. 실제 Auth/Edge/R2 전체 검증을 새로 수행한 것으로 표시하지 않는다.
- 운영 HTTP: 홈페이지/app/config 200, 공개 Auth settings 200 및 Google 활성, authorize 302 → accounts.google.com, callback은 지정 Supabase 프로젝트.
- 운영 웹 config에는 R2 설정이 없고 CSP connect-src는 self/Supabase이다. R2 후보 호스팅 통합은 미완료다.
- CUA browser kernel은 Windows platform directory 오류(HRESULT 0x80070003)로 시작하지 못했다. 사용자 PC 브라우저를 실제 조작하거나 로그인하지 않았다.
- Google 로그인 완료/돌아오기/목록/미리보기 전체 GUI와 Electron GUI 업로드·복원·출제는 미완료다. 정상 브라우저/네이티브 제어와 사용자 공식 로그인 인계가 필요하다. 비밀번호나 인증코드를 요구하지 않는다.
- 기존 운영 자료 생성/교체/삭제 시험은 하지 않는다. 운영 읽기 HTTP와 SQL 설치 검증만 수행한다.

## 다음 단계 조건
실제 동결·복사·전체 내용 검증은 별도 승인 대상이다. 해당 단계 전에 관리/백그라운드 작업 중단, 진행 중 전송 종료 및 120초 이상 drain/목록 안정성 확인, 현재 인증 유효성, 최종 frozen inventory를 확인해야 한다. service_role의 직접 Storage 작업은 RLS를 우회하므로 관리/배경 작업 중단을 SQL 설치만으로 대체할 수 없다.
R2 후보 호스팅/Google/웹/Electron 미검증 범위와 전환용 추가 SQL·코드·설정은 전환 전에 해소하거나 명시적으로 검토해야 한다. R2 운영 전환, 원본 삭제, push/merge, 유료 환경 생성은 이번 작업과 다음 동결·복사 승인에 자동 포함되지 않는다.
