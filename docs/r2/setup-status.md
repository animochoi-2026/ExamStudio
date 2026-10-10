> 최신 후속 검증/후보/장애물: [readiness-20261010.md](readiness-20261010.md). 아래 기록은 이전 실행 결과를 포함합니다.

# R2 사전 준비 실제 실행 기록 — 2026-10-10

**R2 실제 설정과 인공 파일 연결 시험을 완료했다. 운영 전환 준비 전체가 완료된 것은 아니다.** 비공개 Standard/APAC `examstudio-files-prep`, CORS, Windows DPAPI 키 저장, GitHub 이전 Environment 키 등록을 완료했다. 실제 R2 업로드·읽기·SHA-256·Content-Type·익명 거부·60초 URL 만료/재발급과 정확한 테스트 파일 정리를 통과했다. 실제 Chrome PDF/SVG 표시 및 PDF 다운로드 해시, 패키징된 Electron 저장소 reader의 R2 읽기도 확인했다. 이 클라이언트 시험의 주소 발급은 인공 파일 전용 로컬 서비스이므로 운영 Auth/파일별 권한 통합 시험과 구분한다. 현재 추가 R2 키 입력은 필요 없다. 밤 자동 실행·예약·운영 변경 없음.

## 실제 확인한 대상과 상태

| 대상 | 실제 결과 |
| --- | --- |
| 실행 환경 | 사용자 PC의 Windows 로컬 Codex. PowerShell/Node/npm, 외부 HTTPS, Chrome 제어 가능 |
| 저장소 | `animochoi-2026/ExamStudio`, 공개 GitHub 저장소, Git Credential Manager와 GitHub 연결 모두 관리자 권한 확인 |
| 준비 폴더 | `C:\Users\reals\.codex\worktrees\r2-storage-preparation\문제생성기` |
| 준비 브랜치/HEAD | `codex/r2-storage-preparation`, `4e21bbe1229b47f7396909998f6164c1cb290d76` |
| 작성 상태 | R2 변경은 로컬 미커밋. 원격 준비 브랜치 없음. 기존 사용자 변경 사본 보존. 이번에 commit/push/merge하지 않음 |
| 원격 main | 작업 중 `1e41c03`에서 `3e9e389d0ebe4557d04288805b95a2dfd34a4f3e`로 갱신됨. fetch 후 변경 파일을 격리된 후보에 통합. Git branch merge/commit/push 없음 |
| Cloudflare 계정 | `Realspy1234@gmail.com's Account`, ID `7b3f670b94ea81a6649c3529b108ee8b` |
| Pages | `examstudio-shared-bank`, production branch `main`, source=null(Direct Upload), domain `examstudio-shared-bank.pages.dev` |
| 자동 배포 | Pages Git 연결 없음. preview/production 환경변수 이름 목록 모두 비어 있음. 기존 Actions 배포는 workflow_dispatch. 관련 설정 변경 없음 |
| Cloudflare 인증 | Wrangler 4.149.0 기존 OAuth는 account/user read 및 Pages write. R2 목록 API는 인증 오류 10000. Chrome 로그인은 기존 대상 계정으로 확인됨 |
| R2 활성화/버킷 | 사용자 활성화 후 구독 활성 및 기존 버킷 없음 확인. `examstudio-files-prep` 생성, Standard/APAC/공개 액세스 사용 안 함/0 B 확인. 기존 CLI 인증 범위가 제한되어 Dashboard로 처리 |
| Supabase | `bjxxqdbftefughjkcrqj`, DB/Auth/Storage 유지. MCP 읽기 조회 정상. CLI 2.120.0에는 로그인 토큰 없음 |

현재 운영 웹·학교 등록 화면은 준비 체크아웃 생성 이후 main에 변경됐다. 최신 `school-sources.js`는 `bank_school_sources` RPC로 메타데이터를 조회하고 `last_registered_at`으로 최근 등록순을 표시한다. PDF/이미지/문제 본문은 학교 목록에서 요청하지 않는다. 최신 `question-renderer.js`에는 catalogSnapshot 처리도 추가됐다. 이후 최신 main 파일 변경을 후보에 통합했다. app.js import와 sourceCard 두 충돌은 R2 공통 reader, 기존 사용자 파일 수 표시, 새 등록일 표시를 함께 보존하여 해결했다. 통합 후 웹 빌드와 학교/모의고사/업로드 검사를 실행했다. 통합 목록은 [integrated-main-files.json](integrated-main-files.json)이며 기본 브랜치는 변경하지 않았다. 후보 전체의 배포 승인은 별도다.

## 실제 적용한 설정

| 설정 | 적용 및 재조회 결과 |
| --- | --- |
| Windows 보관함 | `%LOCALAPPDATA%\ExamStudio\R2Preparation\secrets.clixml` 생성. CurrentUser DPAPI 암호화, 디렉터리 ACL을 현재 사용자로 제한 |
| 로컬 비밀값 | `MIGRATION_STATE_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` DPAPI 보관. 사용자 숨김 입력 후 실제 인증 성공. 원본 Supabase 전송 키는 아직 없음 |
| GitHub Environment | `storage-migration` 생성·재조회. main branch만 허용, 소유자 `animochoi-2026` 승인 필요 |
| GitHub Secret | `storage-migration` Environment에 `MIGRATION_STATE_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` 등록 및 이름 재조회. 기존 값 덮어쓰기 없음 |
| GitHub Variables | 해당 Environment의 `SOURCE_MODE=rest`, `SUPABASE_URL`, `R2_ENDPOINT`, `R2_BUCKET=examstudio-files-prep` 등록 및 재조회. 기존 MIGRATION_STATE_KEY 보존 |
| 기존 Secrets | 저장소의 `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` 이름만 확인. 값 조회·변경하지 않음 |
| R2 CORS | `cors.json`을 Dashboard에 실제 적용. 저장 성공 및 production/localhost/127.0.0.1 세 출처, GET/HEAD, Range 재조회. 실제 localhost Origin 응답과 Chrome cross-origin 읽기까지 통과 |
| 운영 Secrets | Supabase Edge 및 Pages 운영 설정 **변경 없음** |

보관함은 이 Windows 사용자/PC에 묶인다. 다른 PC 복구에 필요할 때는 사용자가 별도 보안 보관 수단에 암호화키를 백업해야 한다. GitHub Secret의 원문은 다시 읽을 수 없다. 새 PC에서 같은 이름의 다른 키를 생성해 기존 값을 덮어쓰면 안 된다. `vault.ps1`/`github-prepare.mjs`는 기존 이름을 자동 교체하지 않는다.

R2 계정·버킷을 확정했다. 기존 Account/User R2 토큰 모두 없음 확인. 발급 양식에는 `examstudio-r2-preparation-20261010`, **Object Read & Write**, `examstudio-files-prep` 단일 버킷과 유효 기간 1주를 선택했다. 준비·이전 전용이며 운영 상시 키로 사용하지 않는다. 최종 생성은 사용자가 완료했다고 보고했다. 기존 CLI OAuth에는 키 생성 권한이 없고 브라우저의 보안 민감 접근 생성은 실행 시점 확인이 필요하여 사용자 직접 클릭으로 진행했다. 두 키는 DPAPI 보관함에 저장됐으며 실제 S3 인증을 통과했다. 이 1주 키는 준비·이전 전용으로 운영 상시 키에 사용하지 않는다. r2.dev 및 사용자 지정 공개 도메인은 활성화하지 않았다. Cloudflare가 기본 생성한 `Default Multipart Abort Rule`(7일 뒤 미완료 multipart 중단)만 관측했으며 추가 수명주기/객체 만료 규칙은 만들지 않았다.

## 실제 검사

- R2 모의 검사 **44/44 통과**. 목록 모든 페이지, 원본 불변, 내용 SHA-256, 메타데이터 충돌, 재개, lock, AES-GCM, 역복사, DB 참조 대조, 실제 동결 확인 실패 차단, 권한 거부, URL 만료/재발급, 인공 PDF·이미지 정리 포함.
- 기존 인증·삭제·조회·SQL·업로드→복원 검사 **13/13 통과**. 최신 main 통합 후 학교/모의고사 21개와 업로드→복원 재검사 1개(중복 포함 22개)도 통과. 실제 로컬 PostgreSQL 엔진(PGlite)에서 SQL/RLS와 후보 검증 함수 실행, HTTP는 모의 처리.
- 업로드→복원 기존 실패 원인: 테스트 fixture의 `classification.types=[]`가 현재 `beforeUpload → requireDetailed` 계약을 충족하지 못함. 저장소 전송 전에 실패했음. 정상 catalog 세부 유형을 넣는 **테스트 데이터만 수정** 후 업로드, B 복원·파생본, 접근 거부, 조각 손상 검출, 백업·복원 단계까지 통과. 운영 분류 검증을 완화하지 않음.
- R2 설정 없이 웹 전체 빌드 통과. Edge 함수 4개(bank-storage, bank-verify, bank-delete-question, bank-image-transition) esbuild 컴파일 통과. Deno 지원 `node:*`/HTTPS import는 external 처리. **호스팅 배포·Deno 실환경 검증과는 다름**.
- 웹 빌드 및 Electron 소스 157개에서 서버 R2 키 변수명 없음 확인.
- Electron 44.3.0 Windows 실제 로컬 패키징 완료. 기존 원본의 `vendor/codex-runtime`을 읽어 후보 패키지에 포함했으며 원본은 수정하지 않음. 패키지 내부 465개 텍스트 파일 검사에서 서버 R2 키 변수명 없음. tools/docs/.env/.github 제외 및 패키지 storage adapter와 후보 원본 일치 확인.
- 패키징된 Electron 실행파일을 `ELECTRON_RUN_AS_NODE=1`로 실행하여 **모의** URL 만료→권한 재검사→재발급 통과. 사용자 GUI·운영 프로필은 실행하지 않음. 이후 아래 별도 실제 R2 reader 시험도 수행했다. GUI 전체 흐름은 여전히 미검증이다.
- 이전 dependency audit 취약점 0건. 확인 문구 없는 copy는 `COPY_CONFIRMATION_REQUIRED`, 동결 확인 없는 verify는 `WRITE_FREEZE_REQUIRED`로 네트워크 작업 전에 거부됨.
- 운영 `bank-verify` 소스 조회를 재시도했으나 Supabase가 `Failed to retrieve function bundle`을 반환. CLI에도 인증이 없어 대체 다운로드를 완료하지 못함. 운영 소스와 후보 기준 소스의 일치를 확인했다고 보고하지 않음.

로컬 패키지 위치:
`builds/2026-10-10T10-40-17-724Z-66a6bd43/ExamStudio-win32-x64`

19:24:20 KST 읽기 전용 새 집계:

| 구분 | 관측값 |
| --- | ---: |
| 저장 객체(물리 조각) | 2,463 |
| 저장 bytes | 830,696,517 |
| DB 논리 파일 | 2,418 |
| 그중 source 역할 파일 | 20 |
| 예상 경로와 실제 객체 대조: 누락/미참조/크기 불일치 | 각각 0 |

이 값은 시험지 개수가 아니다. 실제 이전 대상은 밤에 모든 쓰기를 멈춘 뒤 재확정한다. 이번 조회는 SQL 목록·메타데이터 집계이며 원본 파일 본문 GET을 하지 않았다. R2 대상 연결은 이후 확인했지만 원본 CLI 인증이 없어 양쪽 연결 preflight 완료를 뜻하지 않는다.

## 이번 실제 R2 시험 상세

- CLI 인공 PDF 623 bytes, SVG 184 bytes: 업로드/GET/SHA-256/Content-Type 통과. 인증 없는 요청 거부, localhost CORS, 62초 뒤 60초 URL 403, 새 URL 재발급 및 내용 일치 통과. 두 파일과 자신이 만든 lock만 정리.
- 첫 시도는 익명 응답을 401/403으로 한정해 실패했다. 실제 R2 응답은 400 + InvalidArgument + Authorization이었다. 이 정확한 오류만 거부 성공으로 인정하고, 다른 400/404/500 및 200은 실패하게 수정했다. 회귀 검사 포함 44개 통과 후 실제 재시험 성공.
- 별도 Chrome 시험: 실제 web-bank/file-storage.js를 사용해 R2에서 두 파일을 받아 SHA·크기·유형 확인. PDF/SVG 실제 표시 확인. Download tiny.pdf 클릭 후 도구 이벤트는 시간 초과했으나 Downloads/tiny.pdf 623 bytes를 직접 읽어 기대 SHA-256 일치 확인.
- 패키징된 문제공방.exe를 ELECTRON_RUN_AS_NODE=1로 실행, 패키지의 SharedBankStorage reader로 실제 R2 두 파일 GET 및 해시 확인. R2 비밀키는 이 자식 프로세스 환경에서 제외. 전체 GUI·운영 Auth 시험 아님.
- 클라이언트 시험용 두 파일도 삭제 후 404 확인, 로컬 서버 종료. 운영 파일 사용 0개. 실제 Supabase 로그인/권한 검사는 모의 결과와 구분한다.
- 생성 웹과 패키징 Electron의 텍스트 파일 482개를 실제 발급 키 값과 메모리에서 대조하여 일치 0개 확인. 키 값·발견 내용은 출력하지 않았다.
- 운영 bank-verify 소스 조회를 다시 실행했지만 동일한 bundle retrieval 오류. 원격 소스 일치 미확인.

## 아직 실행하지 않은 항목과 전환 장애물

R2 키·직접 연결·Chrome 미리보기/다운로드·Electron reader·URL 만료 시험은 완료했다. 웹·Electron의 로그인과 파일별 접근 권한까지 포함한 실제 통합 시험에는 운영과 분리된 테스트 Supabase 환경이 필요하다. 연결 도구의 프로젝트 목록에는 운영 프로젝트 하나만 확인됐다. 운영에 가짜 사용자/시험지를 만들지 않는다.

원본 전체 전송용 기존 인증은 로컬에서 확인되지 않았다. 현재 Supabase MCP는 안전한 읽기 조회에 사용했고 그 인증을 추출하지 않았다. 이전 프로그램의 DB 참조 대조는 complete server read credential을 요구한다. 기존 안전한 키를 재사용할 수 없다면 서비스 권한이 큰 새 키를 임의로 요구·발급하지 않고 최소 권한 수단을 별도로 검토해야 한다.

운영 검증 함수 소스 일치 미확인이 전환 장애물이다. 최신 main(3e9e389) 파일 통합 및 관련 회귀 검사는 완료했으나 로컬 미커밋 상태이므로 밤에 검토 대상 커밋을 확정해야 한다. 구버전 Electron은 직접 Supabase를 사용하므로 새 gateway 지원 버전과 공개 config의 `storageGateway=true` 업데이트가 필요하다. SQL 초안의 provider/freeze 정책으로 구버전의 잘못된 저장소 쓰기를 차단하고 사용자가 업데이트하도록 해야 한다. 구버전의 실패를 성공처럼 취급하지 않는다.

실제 자료 복사·전체 내용 검증·역복사, 운영 DB/Secrets 변경, 기본 브랜치 병합·push·배포·전환, 원본 삭제는 모두 **미실행**이다.

## 정확한 실행 방법 — 선행 조건 충족 및 별도 승인 이후만

작업 폴더:

```powershell
Set-Location 'C:\Users\reals\.codex\worktrees\r2-storage-preparation\문제생성기'
```

비밀값은 발급 권한과 범위를 확인한 후 필요한 이름만 안전한 PowerShell 창에서 입력한다. R2 두 값은 이미 저장했으므로 아래 Set 명령을 다시 실행하지 않는다. 이미 있는 이름은 덮어쓰지 않고 실패한다. 현재 사용자에게 이 목록을 한꺼번에 요청한 것은 아니다.

```powershell
powershell -NoProfile -File tools/storage-migration/vault.ps1 -Action Set -Name R2_ACCESS_KEY_ID
powershell -NoProfile -File tools/storage-migration/vault.ps1 -Action Set -Name R2_SECRET_ACCESS_KEY
# 기존 안전한 원본 인증 재사용이 확인된 때만
powershell -NoProfile -File tools/storage-migration/vault.ps1 -Action Set -Name SUPABASE_READ_KEY
```

비밀값이 아닌 필수 실행 설정. 버킷 및 endpoint는 실제 Dashboard에서 확인했다.

```powershell
$env:R2_ENDPOINT='https://7b3f670b94ea81a6649c3529b108ee8b.r2.cloudflarestorage.com'
$env:R2_BUCKET='examstudio-files-prep'
$env:SUPABASE_URL='https://bjxxqdbftefughjkcrqj.supabase.co'
$env:SOURCE_MODE='rest'
$env:SOURCE_BUCKET='question-bank'
$env:MIGRATION_JOB='prep-20261010'
$env:MIGRATION_WRITES_FROZEN='false'
powershell -NoProfile -File tools/storage-migration/vault.ps1 -Action Publish
powershell -NoProfile -File tools/storage-migration/vault.ps1 -Action Run -Operation test
powershell -NoProfile -File tools/storage-migration/vault.ps1 -Action Run -Operation preflight
```

`test`는 원본 인증 없이 대상 키만으로도 실행 가능하다. UUID 테스트 경로에 직접 생성한 PDF/SVG만 쓰고 실제 SHA-256, 비공개 익명 거부, localhost CORS 응답, 60초 URL의 62초 후 거부 및 재발급을 확인한다. 마지막에는 이번 실행의 정확한 객체만 삭제하고 404를 확인한다. 성공 JSON에 `verified:true`, `signedExpiryProbe:true`가 있어야 한다. 이 HTTP 검사는 별도 브라우저/로그인 파일 권한 통합 시험을 대신하지 않는다.

`preflight` 성공은 `referenceCheckPassed:true`, `targetReachable:true` 및 새 목록 해시로 판단한다. 내용 GET은 하지 않는다. 상세 실패 목록은 공개 로그 대신 암호화 manifest에만 남는다.

실제 Chrome/Electron 전송 검사 재현(위 R2 환경변수와 준비 작업 폴더 기준):

```powershell
$env:R2_PROBE_ELECTRON=(Resolve-Path 'builds/2026-10-10T10-40-17-724Z-66a6bd43/ExamStudio-win32-x64/문제공방.exe').Path
powershell -NoProfile -File tools/storage-migration/vault.ps1 -Action ClientProbe
```

콘솔의 `packagedElectronRead:passed`와 `ready:true` 후 Chrome에서 `http://localhost:4173`을 열어 Run browser read test를 누른다. 두 파일의 verified=true, PDF/SVG 표시, Download tiny.pdf의 저장 파일 해시를 확인한다. Finish 버튼으로 이 실행 객체만 정리하고 콘솔의 `cleanup:verified absent`를 확인한다. 10분 안전 종료도 같은 정확한 정리를 수행하며 강제 프로세스 종료는 피한다. 주소 발급은 인공 파일 전용 로컬 서비스라 실제 Supabase Auth/파일 권한 통합 시험을 대신하지 않는다. 이 프로그램에는 운영 파일·DB·원본 저장소를 읽는 경로가 없다.

밤에 승인·백업·서버 동결·모든 전송/백그라운드 중지·최종 목록 확정 후:

```powershell
$env:MIGRATION_JOB='night-20261010'
$env:MIGRATION_WRITES_FROZEN='true'
powershell -NoProfile -File tools/storage-migration/vault.ps1 -Action Run -Operation preflight
powershell -NoProfile -File tools/storage-migration/vault.ps1 -Action Run -Operation copy -Confirmation COPY_FILES_NO_DELETE
powershell -NoProfile -File tools/storage-migration/vault.ps1 -Action Run -Operation verify
```

확인 문구와 실제 서버 `bank_storage_status` 동결 확인이 모두 필요하다. copy의 `verified:false`는 정상적인 복사 완료 표기이고 **전환 승인이 아니다**. 별도 verify의 `verified:true`, 실패 0, 목록 해시 일치, DB 참조 일치 및 기능 시험·사용자의 별도 전환 승인까지 충족해야 한다. 밤이 되어도 자동 실행하지 않는다.

## Actions·배포·복구

현재 GitHub에는 이전 워크플로 파일이 없어서 **Run workflow 버튼도 없다**. 준비 브랜치 전체를 병합하지 않는다. 승인 후 main에 필요한 최소 세트는 `.github/workflows/storage-migration.yml`, `tools/storage-migration` 코드/lockfile, workflow가 실행하는 `tests/r2`와 그 의존 소스(서버 adapter, 클라이언트, SQL 초안)이다. workflow가 전체 R2 테스트를 실행하므로 YAML만 넣으면 실행 준비가 되지 않는다. 앱 배포와 분리하려면 먼저 독립 이전 도구 검사만 실행하도록 검토·분리한 최소 변경안을 승인받는다. 기본 브랜치 반영 전에는 위 로컬 명령을 사용한다.

승인 후 버튼: GitHub → Actions → **Storage preparation and migration (manual only)** → Run workflow → main → operation 선택. 기본 preflight, copy만 `COPY_FILES_NO_DELETE`, night job 및 writes_frozen=true. 생성한 `storage-migration` Environment 승인 후 실행된다. 원본 삭제/운영 전환/배포는 포함하지 않는다.

현재 원격 배포 버튼도 특정 ZIP(`web-mock-recovery-20261010`)을 고정 사용하므로 R2 변경 배포에 사용하지 않는다. 검토한 정확한 커밋에서 웹/Edge/Electron을 각각 새로 빌드·검증한 뒤 배포를 별도 승인받아야 한다. 실제 명령과 단계는 [README.md](README.md)의 로컬 실행·Actions·배포·복구 절에 있다. 이 후보의 로컬 패키지는 아직 배포 후보 승인본이 아니다.

전환은 백업 → 모든 경로 쓰기 동결 → 최종 목록 → preflight → copy → verify → 별도 전환 승인 → DB/Edge provider 일치 → 기능 확인 → 쓰기 재개의 순서다. 읽기 시험을 마친 뒤 통제된 새 쓰기 시험과 실제 재개를 구분한다. SQL/운영 Secret 적용은 별도 승인 단계다.

R2에만 새 파일이 생긴 뒤 복구할 때는 R2 읽기를 유지한 채 다시 동결하고 **현재 DB와 R2를 백업**한다. 신규 파일·교체·삭제 이력과 현재 참조를 유지하면서 별도 승인된 restore-plan → restore-copy `RESTORE_FILES_NO_DELETE` → restore-verify를 수행한다. Supabase에 보관된 과거 추가 객체는 삭제하지 않는다. 삭제된 자료의 DB 참조를 과거 백업으로 부활시키지 않는다. 역검증과 신규 파일 참조 확인 후만 provider를 Supabase로 변경한다. 단순 설정 복귀 또는 과거 DB 통째 덮어쓰기는 금지한다. `schema-rollback.sql`은 마지막 보호장치 제거 단계이므로 모든 쓰기가 외부에서도 중지된 상태에서 별도로 승인받는다.

원본 삭제는 어떤 단계에도 없다. 원본 정리는 별도 백업·검증·승인 작업이며 storage 메타데이터 SQL 삭제로 용량을 줄이지 않는다. 무료 제공량과 실제 계정 청구/Actions 사용량 확인 항목은 [README.md](README.md)의 비용 절에 있다. R2 활성화 동의는 사용자가 직접 했으며 에이전트가 다른 유료 상품을 추가하거나 결제를 확정하지 않았다.

전체 R2 소유 변경 목록: [modified-files.json](modified-files.json). 기계 판독 검사 결과: [validation.json](validation.json).


## 이번에 검증한 빌드 명령

아래는 위 준비 작업 폴더에서 실행한 로컬 빌드다. 운영 배포 명령이 아니며 새 main 통합 후에도 재실행했다. fixture config에는 가짜 프로젝트와 공개 테스트 키만 있다.

```powershell
$env:EXAM_EXPORT_PYTHON='C:/Users/reals/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
node scripts/build-bank-web.cjs tests/artifacts/r2/config.json tests/artifacts/r2/web
node -e "require('./scripts/package.cjs').main({codexSource:'C:/Users/reals/Desktop/문제생성기/vendor/codex-runtime'}).catch(()=>{process.exitCode=1})"
```

검토 커밋에서 Edge 소스를 컴파일하는 명령(호스팅 배포 아님):

```powershell
node -e "const e=require('esbuild');(async()=>{for(const n of ['bank-storage','bank-verify','bank-delete-question','bank-image-transition'])await e.build({entryPoints:['supabase/functions/'+n+'/index.ts'],bundle:true,platform:'neutral',format:'esm',external:['https://*','npm:*','node:*'],outfile:'tests/artifacts/r2/edge/'+n+'.mjs'})})().catch(()=>{process.exitCode=1})"
```

브라우저의 만료 URL 응답은 CORS 헤더가 없어서 HTTP 403 대신 TypeError로 보일 수 있다. 그 경우도 한 번만 파일 권한을 재검사하여 재발급하도록 보완했다. 근거: [Cloudflare CORS 문서](https://developers.cloudflare.com/r2/buckets/cors/). 재발급 권한이 거부되면 추가 파일 요청을 하지 않는다.
