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

## 아직 완료가 아닌 것

- Google OAuth staging 공급자 설정 및 실제 로그인. 사용자 첫 완료 응답 후 공개 Auth settings 조회에서는 Google=false였다. 잘못된 자동완성은 비밀값을 기록하지 않고 교정하고, 사용자에게 올바른 Google Client Secret 입력·저장을 다시 인계했다.
- staging URL Configuration 저장은 사용자 완료 응답을 받았으며 서버 동작 검증은 다음 단계다.
- hosted-integration.mjs는 hard-coded staging에서 실제 Auth/Edge/R2 인공 시험을 수행할 코드이며 아직 실행 전이다. SUPABASE_STAGING_KEY는 사용자 직접 입력 대기다.
- Electron 창은 별도 EXAM_DATA_DIR와 인공 문제 1개로 열었다. 실제 Google 로그인·등록·복원·출제 GUI 성공을 아직 확인하지 않았다.
- 운영 백업 최신화, 서버 동결, drain/목록 안정성, 최종 preflight, copy, 전체 verify, 운영 차분 SQL/Secrets/웹/Edge/Electron 배포, provider 전환은 미실시다.

## 현장 산출물 위치 (ignored)

`tests/artifacts/r2-freeze/`의 staging-deployment.json, staging-assets-check.json, cutover-delta-test-result.json, remaining-edge-source-comparison.json, image-transition-source-comparison.json, electron-candidate-file-check.json, electron-staging-session.json.

공식 CLI로 받은 기존 함수 소스는 `tests/artifacts/r2/deployed-bank-*/supabase/functions`에 보존한다. 기존 함수 재배포가 필요한 복구에서 이 소스를 사용하며 오래된 고정 ZIP은 사용하지 않는다.

## 다음 조건

호스팅 Auth·웹·Electron의 필수 시험과 복구 준비가 성공하기 전에는 운영을 동결하지 않는다. 조건부 일괄 승인은 존재하지만 검사 실패를 무시할 권한은 아니다. 원본 삭제·키 폐기·유료 추가는 승인 범위 밖이다.
