# R2 남은 장애물 해소 기록 — 2026-10-10

이 문서는 이전 setup-status/validation의 후속 기록이다. 운영은 Supabase 그대로다. 자동 실행·예약·push·배포·운영 DB/Secrets 변경은 하지 않았다.

## 검토 후보

- 새 로컬 후보: `C:\Users\reals\.codex\worktrees\r2-storage-candidate`, `codex/r2-storage-candidate`.
- 기준 main: `ee53fb267ad21f0279f6973ed71b69ea9c5d01ed`. 이전 통합 main 이후 변경은 `docs/MOCK-EXAM-IMPLEMENTATION.txt` 하나였다.
- 원래 `codex/r2-storage-preparation` 폴더와 사용자 변경은 보존했다. `shared-bank-auth.cjs`의 사용자 세션 잠금/갱신 변경은 후보에서 제외하고 R2 설정 플래그만 적용했다.
- R2 파일 목록은 `modified-files.json`. 정확한 커밋과 검사 대상 해시는 로컬 `tests/artifacts/r2/candidate-commit.json`에 기록한다. 테스트 산출물·다운로드한 함수 소스·개인 설정·암호화 키 보관함은 커밋하지 않는다.

## 실제 해소한 항목

1. **원본 메타데이터 읽기 인증**: 기존 Supabase 대시보드 로그인에서 프로젝트 하나의 Database Read + Edge Functions Read, 7일 scoped PAT를 사용자가 발급했다. Windows DPAPI 보관함의 `SUPABASE_ACCESS_TOKEN`에 저장했다. CLI 로그인이나 MCP 인증을 추출하지 않았다.
2. 공식 Management API에서 `read_only:true` SQL을 실제 실행했다. 2026-10-10 21:17:56 KST 기준 논리 파일 행 2,418개, 저장 객체/조각 2,463개, 830,696,517 bytes. 경로별 DB 참조와 크기 대조: 누락 0, 미참조 0, 크기 불일치 0. 파일 내용 다운로드 없이 DB 전체 객체 집합을 조인했으므로 페이지/하위 경로 누락이 없다. 시험지 수를 뜻하지 않으며, 쓰기가 계속되는 시점의 관측값이다.
3. **운영 검증 함수 소스**: 대시보드 Code와 ZIP은 bundle retrieval 오류. 공식 CLI 2.120.0의 기본 다운로드 + 로컬 Podman 압축 해제로 소스 확보에 성공했다. `--use-api` 반복이나 재배포는 하지 않았다. 의존 9개는 기준 main과 바이트 일치. entrypoint는 배포 과정에서 타입 제거/재서식됐지만 두 소스를 동일 esbuild 설정으로 정규화하면 JavaScript가 정확히 일치한다. [비교 결과](deployed-source-comparison.json), 재현 `node tools/storage-migration/compare-source.cjs`.
4. **무료 격리 환경**: 기존 WSL Podman에서 `examstudio-r2-isolated` 프로젝트를 새로 구동했다. PostgreSQL 17, GoTrue, PostgREST, Storage, Kong, Edge runtime 컨테이너이며 운영 프로젝트 링크가 없다. Podman 자동 health check 미실행 때문에 시작이 지연됐으며 실제 health check를 직접 실행해 healthy를 확인했다. 상태 점검 무시 옵션은 사용하지 않았다.
5. **실제 Auth/RLS 통합 시험**: 로컬 GoTrue에서 인공 계정 로그인, 실제 PostgreSQL에 이력 SQL/준비 SQL을 적용하고 실제 PostgREST/RLS와 R2에 연결했다. 서버의 gateway/verify 모듈은 로컬 Node HTTP 호스트에서 실행했다. JWT나 권한 응답을 모의로 대체하지 않았다. 11개 항목 통과: 업로드, `bank-verify`/`bank_finish` 등록, 다운로드 SHA-256, 다른 로그인 회원 접근 거부, 60초 URL, 만료 403, 권한 재검사·재발급, 회원 권한 회수 후 재발급 거부, SQL 전역 쓰기 동결, 웹 모듈 읽기, 새 Electron 패키지 읽기. 이번 실행의 정확한 R2 객체만 삭제하고 HEAD 404 확인했다.
6. 첫 통합 시험의 권한 회수 단계는 '마지막 관리자는 비활성화 금지'라는 기존 보호장치 때문에 실패했다. 인공 보조 관리자 계정을 추가한 뒤 동일 보호장치를 유지하고 재실행해 통과했다. 기존 업로드→복원 테스트의 과거 원인 재분석이나 운영 보호장치 완화는 없었다.
7. 분리 후보의 회귀 검사 49/49, R2 설정 없는 웹 빌드, Edge 4개 번들, 새 Electron 패키징 성공. 패키지 `builds/2026-10-10T12-28-17-910Z-d9b098e6/ExamStudio-win32-x64`의 storage 모듈이 후보 소스와 같음을 확인하고 실제 Auth/RLS 읽기를 실행했다.

## 남은 제한과 장애물

- **원본 파일 전송 인증 미확보**: 새 PAT는 DB 메타데이터/함수 소스 조회용이다. Supabase Storage 객체 GET용 키가 아니다. 현재 복사 프로그램의 `SUPABASE_READ_KEY`는 전체 DB 참조 및 Storage 목록·읽기가 가능한 서버 키를 요구한다. 기존 안전한 서버 키를 사용할 별도 허가·보안 입력 또는 더 좁은 원본 읽기 방식을 마련하기 전에는 전체 CLI preflight/copy를 실행하지 않는다. 서버 키는 읽기 외 권한도 가지므로 '읽기 전용 키'라고 부르지 않는다. 프로그램은 원본 DELETE를 구현하지 않는다.
- **운영 동결 기능 부재**: 실제 운영 조회에서 `bank_storage_status()` 없음, `bank_storage_private` 없음. 기존 `bank_object_allowed` 및 개별 작업 freeze는 존재하지만 이전용 전역 동결이 아니다. 준비 SQL 적용과 서버 경로 준비는 **복사 전에 별도 승인**이 필요하다. 지금 적용하지 않았다.
- **호스팅 Edge 통합/GUI 미완료**: 실제 Auth/DB/R2 통합은 성공했지만 함수 실행 호스트는 Node다. Supabase Edge 런타임에서의 함수 실행, Google OAuth UI, Chrome 로그인→미리보기 전체 흐름, Electron GUI 업로드/복원/문제 출제 전체 흐름은 완료로 판정하지 않는다. 이전 Chrome PDF/SVG 표시 시험은 인공 주소 발급 서비스였으며 이번 실제 Auth 시험과 구분한다.
- 원본 Storage 전체 목록 전송 API·R2 전체 목록을 함께 묶는 CLI preflight, 운영 자료 본문 체크섬, 실제 자료 복사 및 전체 검증은 미실행이다.
- `BANK_STORAGE_PROVIDER`가 기본 Supabase인 것과 R2 연결 성공은 운영 전환 허가가 아니다. 위 미완료 통합 범위를 해소하거나 사용자가 명시적으로 잔여 위험을 검토하기 전 전환 가능으로 판정하지 않는다.

## CORS와 키

브라우저 파일 쓰기는 `bank-storage`에 인증된 POST → 서버가 R2 PUT이다. 브라우저 R2 직접 PUT이 아니므로 기존 R2 CORS GET/HEAD를 유지했다. Electron은 Node fetch 경로여서 웹 Origin을 임의로 추가하지 않았다. 파일 권한은 Auth + caller JWT RPC로 검사한다.

준비 키 `examstudio-r2-preparation-20261010`은 대시보드에서 **2026-10-17까지 활성** 확인. 정확한 시각/시간대는 UI가 제공하지 않아 미확인이다. 이를 상시 운영 키로 사용하지 않는다.

별도 운영 키는 `examstudio-r2-runtime-20261010`, `examstudio-files-prep` 하나에 Object Read & Write, TTL 6개월로 별도 발급했고 DPAPI 저장 및 인공 38바이트 파일 읽기·쓰기·내용 검증을 완료했다. 이번 생성 객체만 삭제하고 HEAD 404를 확인했다. 대시보드에서 2027-04-10까지 활성임을 확인했으며 정확한 만료 시각은 UI에 표시되지 않았다. `current-validation.json`에 기록했다. 로컬 이름은 `R2_RUNTIME_ACCESS_KEY_ID`, `R2_RUNTIME_SECRET_ACCESS_KEY`; 준비 키를 덮어쓰지 않는다. 운영 적용 승인 후 Supabase Edge Secrets의 `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`에만 대응시킨다. Pages/정적 웹/Electron에는 넣지 않는다. 만료 30일 전에 새 최소권한 키 준비→인공 파일 검증→별도 운영 Secret 변경 승인→관측 후 기존 운영 키 폐기 승인 순서로 갱신한다. 자동 갱신·폐기·예약은 설정하지 않았다.

## 현재 안전하게 재실행 가능한 조회

Windows PowerShell, 후보 폴더에서:

```powershell
Set-Location 'C:\Users\reals\.codex\worktrees\r2-storage-candidate'
powershell -NoProfile -File tools/storage-migration/vault.ps1 -Action SourceInspect
```

종료 코드 0, 참조 불일치 0을 확인한다. SQL 메타데이터 관측이며 원본 파일 읽기 인증 검증이나 동결 목록 확정은 아니다. 키 값 출력은 없다.

## 밤의 별도 승인과 실행 순서

1. 원본 전송 인증과 미완료 통합 시험을 해소하고 대상 계정·프로젝트·버킷·커밋·비용을 확인한다. 기본 브랜치 병합/Actions 버튼 생성은 선행 조건이 아니다.
2. **운영 DB 준비 SQL, 새 웹/Edge/Electron 배포 경로 준비에 대한 별도 승인**을 받는다. 먼저 DB 파일 참조·등록일·학교 연결·이력·정책/함수 정의와 운영 설정을 안전하게 백업한다. `schema-proposal.sql`과 복구안을 검토하고 승인된 변경만 적용한다. provider는 아직 Supabase다. 고정 ZIP 버튼을 쓰지 않는다.
3. **실제 쓰기 중지 승인** 후 웹·구형 Electron·백그라운드 작업을 멈추고 서버 전역 동결을 적용한다. RPC/Storage 정책의 실제 거부를 확인한다. 진행 중 전송도 종료하고 최소 120초 이상 drain, 재조회로 변경 없음 확인. 환경변수만 true로 만드는 것은 동결이 아니다.
4. 변경이 멈춘 상태에서 최종 원본 목록을 확정하고 아래 preflight를 실행한다. count/bytes만이 아니라 경로별 크기·DB 참조를 확인한다.
5. **실제 복사 승인** 후 copy 확인 문구를 입력한다. 원본은 보존한다. 이어 verify에서 모든 파일 내용 SHA-256, 목록 불변, 누락/충돌/실패 0, `verified:true`를 확인한다.
6. **검증 성공 후 별도 전환 승인**을 받아 DB/Edge provider를 일치시켜 R2로 전환한다. 내장 URL 예외 변경이 필요하면 현재 참조 백업과 별도 변경 승인부터 받는다. 등록일/업로드일을 복사 시각으로 갱신하지 않는다.
7. 읽기 시험(원본시험지/학교/미리보기/다운로드/문제 출제), 권한 거부, 통제된 실제 신규 쓰기 시험을 거쳐서만 일반 쓰기를 재개한다. 구형 Electron의 Supabase 직접 쓰기는 서버 정책에서 거부되어야 한다.

다음 명령은 위 선행 조건과 별도 승인 이후에만 실행한다. `SUPABASE_READ_KEY`는 사전 승인 후 DPAPI 보관함에 숨김 입력되어 있어야 한다. 같은 작업을 재개할 때 job을 유지한다.

```powershell
Set-Location 'C:\Users\reals\.codex\worktrees\r2-storage-candidate'
$env:SOURCE_MODE='rest'
$env:SOURCE_BUCKET='question-bank'
$env:SUPABASE_URL='https://bjxxqdbftefughjkcrqj.supabase.co'
$env:R2_ENDPOINT='https://7b3f670b94ea81a6649c3529b108ee8b.r2.cloudflarestorage.com'
$env:R2_BUCKET='examstudio-files-prep'
$env:MIGRATION_JOB='night-20261010'
$env:MIGRATION_WRITES_FROZEN='true'
powershell -NoProfile -File tools/storage-migration/vault.ps1 -Action Run -Operation preflight
powershell -NoProfile -File tools/storage-migration/vault.ps1 -Action Run -Operation copy -Confirmation COPY_FILES_NO_DELETE
powershell -NoProfile -File tools/storage-migration/vault.ps1 -Action Run -Operation verify
```

각 명령 종료 코드 0 확인 후 다음 단계로 간다. 프로그램 자체도 실제 `bank_storage_status`를 검사한다. copy의 `verified:false`는 검증 완료가 아니다. verify 성공 이후에도 자동 전환하지 않는다. 오늘 밤 날짜/시간으로 자동 실행하거나 예약한 작업은 없다.

## 전환 후 복구

쓰기 재동결→현재 DB/설정/R2 백업→전환 이후 신규·교체·삭제 및 현재 참조 대조→역복사 계획→별도 역복사 승인→전체 역검증→provider 복귀 승인→읽기/통제된 쓰기 시험→재개 순서다. R2 읽기는 역복사가 끝날 때까지 유지한다. 과거 DB를 통째 덮어쓰거나 R2 신규 파일을 누락한 채 provider만 되돌리지 않는다. Supabase의 과거 추가 객체는 삭제하지 않으며, 현재 DB에서 삭제된 참조도 부활시키지 않는다.

위와 같은 폴더/endpoint 설정을 유지하고, 안전한 `SUPABASE_RESTORE_KEY` 입력 및 서버 provider=r2/frozen=true 확인 후 별도 승인된 복구만 실행한다:

```powershell
$env:MIGRATION_JOB='rollback-20261010'
$env:MIGRATION_WRITES_FROZEN='true'
powershell -NoProfile -File tools/storage-migration/vault.ps1 -Action Run -Operation restore-plan
powershell -NoProfile -File tools/storage-migration/vault.ps1 -Action Run -Operation restore-copy -Confirmation RESTORE_FILES_NO_DELETE
powershell -NoProfile -File tools/storage-migration/vault.ps1 -Action Run -Operation restore-verify
```

역검증 실패 시 설정 복귀 금지. SQL 보호장치 제거는 마지막의 별도 승인 단계다. 원본 삭제, storage 메타데이터 SQL 삭제는 이 절차에 없다. 상세 배포 명령은 [README.md](README.md)의 검토 커밋 빌드/배포 절을 따른다.

후속 비밀값 검사: 커밋 대상/추적 소스 및 웹·Electron 산출물 2,271개 파일, 실제 보관 인증 값 6개 대조, 일치 0. 운영용 키를 Actions나 운영 Secrets에 등록하지 않았다.
