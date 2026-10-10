# 조건부 전환 승인 후 격리 호스팅 시험 기록

운영 동결·복사·전환은 아직 시작하지 않았다. 마지막 운영 상태 조회는 `provider=supabase, frozen=false`였다. 아래 기록은 staging 준비와 실제 수행한 확인만 의미한다.

## 코드와 배포 대상

- 기준 후보: `fee9a6e` (`codex/r2-freeze-preparation`, 로컬 커밋). origin/main은 읽기 전용 fetch 결과 `ee53fb267ad21f0279f6973ed71b69ea9c5d01ed`였다. push/merge 없음.
- 무료 격리 Supabase: `examstudio-r2-staging`, `vljeuedwutkihqqtyrpb`, 기존 문제공방 FREE 조직. 사용자 직접 생성. 운영 자료를 복사하지 않았다.
- staging에만 빈 스키마 baseline, 기존 함수의 정확한 정의, freeze preparation, 새 `cutover-delta.sql`을 적용했다. 인공 시험 공간만 만들었다. staging 상태는 R2/비동결이다.
- staging 서버: bank-storage, bank-verify, bank-delete-question, bank-image-transition v1 ACTIVE. 준비 키를 staging Secrets에 등록하고 해시로 재조회했다. 운영용 키와 운영 Secrets는 변경하지 않았다.
- Cloudflare Pages preview: `https://r2-staging.examstudio-shared-bank.pages.dev`, deployment `5e8b292b`. 운영 배포 아님. 공개 asset 90개가 로컬 산출물과 바이트 일치. `_headers`는 Pages 설정이므로 공개 asset 비교에서 제외했다.
- R2 CORS에 위 preview origin만 추가하고 저장된 GET/HEAD/Range 규칙을 재조회했다. 직접 PUT 허용, 공개 접근, 수명주기 변경 없음.

## 실제 검사

- 기존 freeze 설치와 호환되는 차분/복구 SQL의 격리 PostgreSQL 검사 10개 통과. 기존 전체 proposal은 운영에 재적용하지 않았다.
- 운영 bank-delete-question 소스는 공식 CLI로 보관했고 기준 main과 canonical JavaScript가 일치했다.
- 운영 bank-image-transition 소스와 의존성 5개를 보관했다. 후보에서 R2 import/store 초기화/read 어댑터만 역변환한 뒤 canonical JavaScript가 모두 일치했다. 이 함수는 main에 없으므로 main과 같다고 주장하지 않는다.
- bank-verify 실제 배포 소스 비교 결과는 기존 `deployed-source-comparison.json`을 재사용한다.
- Electron 시험 패키지의 후보 코드 149개를 비교했다. 148개는 줄바꿈 정규화 후 같고, shared-contracts.json은 패키징 시 생성되는 파일이다. 그 manifest의 19개 해시도 실제 패키지 파일과 일치했다.
- 테스트 웹 build 성공. 초기 기본 Python에는 docx가 없어 실패했으나 번들 Python의 EXAM_EXPORT_PYTHON 지정 후 성공했다.
- 비밀값 검사: fee9a6e 고정 전 805개 파일, 보관함 값 8개 대조, 노출 0. 이후 변경은 추가 검사 후 별도 커밋으로 고정할 것.

## Google 로그인 후속 확인 (2026-10-11 00:00 KST 전후)

- 사용자 재입력·저장 후 공개 Auth settings에서 Google=true 확인.
- preview의 Google 로그인 → 기존 승인 계정 선택 → staging callback → 인증된 홈 및 인공 시험 공간 0문항 집계를 실제 브라우저로 확인했다. 운영 로그인 결과를 대신 사용한 것이 아니다.
- 자동 권한 시험은 아직 통과하지 않았다. 이전 도구 의존성 누락을 npm ci로 해결한 뒤 실행했으나 보관된 staging 키가 Secret API key 형식이 아니어서 인공 사용자 생성 전 HTTP 401로 중단됐다. 실제 R2 시험 객체 생성은 0개다.
- 기존 잘못된 보관값은 덮어쓰지 않고, 형식 검사 후 별도 `SUPABASE_STAGING_SECRET_KEY`에 입력하도록 변경했다. 원문 출력 없음. 브라우저 Client IDs 오자동완성 조회에서 토큰 형식 문자열이 도구 결과에 포함된 별도 실수가 있었으며 사용자에게 알렸다. 기존 키 폐기·교체는 하지 않았다.
- 새 키 입력 실패 원인은 사용자에게 받은 오류로 확인했다: 별도 Windows PowerShell 창의 Microsoft.PowerShell.Security 모듈 자동 로드 실패. 이미 SecureString인 입력을 다시 ConvertTo-SecureString 하던 불필요한 단계를 제거하고 PowerShell 7로 입력 창을 열었다. 인공 입력의 저장 검사는 운영 보관함과 분리된 디렉터리에서 수행했다.

## 아직 완료가 아닌 것

추가 실제 결과:

- `SUPABASE_STAGING_SECRET_KEY`의 DPAPI 저장 확인 후 hosted 시험을 실행했다. 최초 권한 회수 단계는 마지막 관리자 보호(PT409)로 실패했다. 인공 예비 관리자만 추가한 시험으로 다시 실행해 9개 항목이 모두 통과했다: 실제 hosted Auth, Edge 업로드/검증/등록, desktop/web 모듈 다운로드 내용 비교, 다른 사용자/익명 접근 거부, 실제 R2 CORS, 60초 만료/재발급, 멤버십 회수 후 재발급 거부. 각 실행이 만든 R2 객체 1개만 삭제하고 HEAD 404 확인. GUI 시험과는 구분한다.
- Electron 사용량 조회가 기존 Supabase 용량만 표시하는 누락을 발견해 gateway의 R2 실측 객체/바이트를 사용하도록 연결했다. Supabase 원본 용량은 별도 필드로 보존한다. client 회귀 10개 통과.
- 새 Electron 패키지 `builds/2026-10-10T15-11-21-216Z-7209fdc9/ExamStudio-win32-x64` 생성 성공. Python 3.12와 문서 출력 의존성 포함. 최초 패키징은 vendor runtime 누락으로 실패했고, 기존 공식 vendor 경로를 명시한 재빌드로 해결했다. 새 패키지 GUI 시험은 아직 안 했다.
- 자동완성 사고의 원문 없는 SHA-256 대조로 노출된 값이 `SUPABASE_DEPLOY_TOKEN`임을 확인했다. 사용자에게 알리고 해당 7일짜리 두 프로젝트 Edge/Secrets 배포 토큰만 폐기·동일 권한 재발급할 예외 승인을 요청했다. 승인이 있기 전에는 기존 토큰을 임의 폐기하거나 운영 전환하지 않는다.

- staging 웹 로그인 반환은 실제 성공했고 Electron 반환은 다음 시험 대상이다.
- 위 hosted 자동 시험은 성공했다. 실제 웹/Electron의 전체 업로드·복원·출제 GUI 시험은 아직 미완료다.
- Electron 창은 별도 EXAM_DATA_DIR와 인공 문제 1개로 열었다. 실제 Google 로그인·등록·복원·출제 GUI 성공을 아직 확인하지 않았다.
- 운영 백업 최신화, 서버 동결, drain/목록 안정성, 최종 preflight, copy, 전체 verify, 운영 차분 SQL/Secrets/웹/Edge/Electron 배포, provider 전환은 미실시다.

## 현장 산출물 위치 (ignored)

`tests/artifacts/r2-freeze/`의 staging-deployment.json, staging-assets-check.json, cutover-delta-test-result.json, remaining-edge-source-comparison.json, image-transition-source-comparison.json, electron-candidate-file-check.json, electron-staging-session.json.

공식 CLI로 받은 기존 함수 소스는 `tests/artifacts/r2/deployed-bank-*/supabase/functions`에 보존한다. 기존 함수 재배포가 필요한 복구에서 이 소스를 사용하며 오래된 고정 ZIP은 사용하지 않는다.

## 다음 조건

호스팅 Auth·웹·Electron의 필수 시험과 복구 준비가 성공하기 전에는 운영을 동결하지 않는다. 조건부 일괄 승인은 존재하지만 검사 실패를 무시할 권한은 아니다. 원본 삭제·키 폐기·유료 추가는 승인 범위 밖이다.

## 후속 확인 (2026-10-11 00:20 KST 전후)

- 사용자가 Electron에서 Google 반환 후 `현재 계정: realspy1234@gmail.com · 초대 확인됨`, `공동 저장소: R2 격리 시험 · https://vljeuedwutkihqqtyrpb.supabase.co` 표시를 직접 확인했다. Electron 로그인/초대 확인은 완료, 업로드·복원 전체 GUI 시험은 미완료다.
- 용량 조회 수정에 대한 실제 hosted 회귀를 추가 실행했다. Auth/권한/업로드/다운로드/만료/재발급에 R2 객체 수·바이트 조회를 포함한 10항목 모두 통과했다. 이번 UUID 경로의 인공 R2 객체 1개만 삭제하고 HEAD 404 확인했다. productionChanged=false.
- client 회귀 10개 통과. 보관된 비밀값 10개를 코드/웹/Electron 3,767개 파일과 대조해 일치 노출 0개, staged 금지 산출물 0개였다.
- 사용자가 노출된 `r2-reviewed-deployment-20261010` 토큰 한 개만 폐기·동일 권한 재발급하도록 명시적으로 승인했다. 해당 토큰은 공식 화면에서 삭제됐으며 다른 토큰/키는 보존했다. 교체 토큰 `r2-reviewed-deployment-replacement-20261011`은 두 프로젝트 Edge Functions/Secrets RW, 7일로 최종 검토 화면까지 준비했고 아직 생성/보관하지 않았다. 후속 배포 프로그램은 `SUPABASE_DEPLOY_TOKEN_REPLACEMENT`만 사용하도록 변경해 폐기된 값으로 재시도하지 않는다.
- 운영 동결·자료 복사·전체 검증·R2 전환은 여전히 미실시다. 새 시험 패키지로 같은 격리 프로필을 이어서 열기 위해 사용자에게 기존 시험 앱 종료를 요청했다.

## Electron GUI 업로드 사전 검증 오류 보완

- 최신 패키지의 런타임 app 파일 148개가 현재 후보와 줄바꿈 정규화 후 일치했다. 생성 manifest와 패키징 규칙상 제외되는 운영자용 revision-payload-prune.cjs는 별도 취급했다.
- 사용자가 실제 GUI 업로드를 눌렀으나 `세부 유형이 필요합니다`로 등록 전에 차단됐다. 생성한 단순 방정식 fixture에 필수 분류가 없었고 해당 격리 공간의 로컬 jobs는 0개였다. R2 연결 실패로 판정하지 않는다.
- 사용자 앱 종료 확인 후 `repair-electron-staging-fixture.cjs`로 정확한 시험 프로젝트/문항만 수정했다. state 원본을 같은 격리 폴더의 `.before-detailed-type-fixture`에 보관하고, 실제 교육과정 m1-4.3과 x+1=3 풀이에 맞는 상세 유형을 추가했다. 기존 `requireDetailed` 검사 통과, 업로드 검증 규칙/공용 유형 목록 변경 없음, 운영 변경/AI 호출 0.
- 동일 격리 프로필과 최신 패키지를 재실행했다. GUI 업로드 재시험 결과는 아직 대기 중이다.

### GUI 재시험 실제 결과

- 사용자가 최신 Electron에서 업로드 완료를 확인했다. 로컬 state의 해당 인공 작업은 `status=complete`, `committed=true`, `previewStatus=complete`, error 없음이다. 버전 `36124a52-0ed6-4bc9-ae0f-694068504397`, 문항 `65861a52-ac53-4f58-bf3f-ab48ed1033bd`.
- 사용자가 저장 문항 목록에서 미리보기 후 같은 시험지 불러오기를 실행해 문제 x+1=3, 정답 2, 풀이 복원이 모두 정상임을 확인했다. 네이티브 GUI 결과는 사용자 직접 확인 근거다.
- 실제 staging 웹의 동일 Google 계정에서 1문항 검색, 수학식 렌더링, 상세 세부유형 표시, 미리보기, 시험지에 담기, 1문항 시험지 배치 및 빠른 정답 2 표시를 확인했다. 사용량 페이지는 해당 공간 R2 6개/147.5 KiB, staging Supabase Storage 0개/0 bytes였다.
- 웹 인공 시험지 서버 저장의 JavaScript 확인창에서 브라우저 도구가 시간 초과돼 사용자에게 확인 클릭을 요청했다. 저장 완료/PDF 다운로드는 아직 확인 전이다. 운영 데이터/설정 변경은 없다.
