# 홈 기능·학교 목록·킬러 필터 변경

수정 기준: 운영 모의고사 웹 소스가 있는 `codex/mock-exam`, 변경 전 HEAD `799b22c`.
데스크톱 작업 폴더의 오래된 웹 소스로 운영 기능을 덮어쓰지 않았다.

## 구현

- `web-bank/home-view.js`: 기존 모의고사 버튼을 주요 기능 영역의 기출 복원 바로 다음으로 이동. 연결은 `mock-exams` 유지. 원본 시험지 개수는 `schools-name`, 등록 학교는 `schools`로 구분. 킬러 집계를 기존 난이도 목록 진입과 같은 버튼으로 연결.
- `web-bank/app.js`: 두 학교 경로를 공통 목록에 연결. 킬러 필터 선택·해제·다른 난이도로 전환 시 첫 페이지부터 조회. 검색과 다른 필터 조합은 기존 검색 폼을 사용.
- `web-bank/school-sources.js`: 접근 가능한 전체 시험지 요약 정보를 학교로 묶고 정렬한 후 학교 10개씩 표시. 매 페이지 기본 펼침. 가나다순에서는 기존 학교 내부 시험지 순서를 보존하고, 최근순에서는 시험지도 최근 등록순. PDF·이미지 다운로드 없음.
- `app/bank-search-filters.cjs`: 기존 `D.effective()` 최종 점수와 `difficulty-policy.boundaries.killerMin`(9)으로 킬러 판정. 교사 점수 우선, 상에 포함되는 기존 규칙 유지.
- `supabase/migrations/20261010063412_school_source_registration.sql`: 읽기 전용 `bank_school_sources` RPC. 기존 회원 검사·공통/개인별 가시성 규칙을 사용하고 파일이나 문항 원문을 반환하지 않음.

## 등록 날짜 근거

기존 업로드의 `bank_begin_revision`은 새 문항의 `bank_questions`를 최초 등록할 때 생성하고, 기존 문항 재업로드에서는 ID 충돌 시 다시 만들지 않는다. 기존 `bank_summary.fact`는 그 `bank_questions.created_at`을 `registered_at`으로 보존한다. 새 조회는 접근 가능한 원본 문항들의 `registered_at` 최댓값을 시험지의 `last_registered_at`으로 반환한다. 학교 순서는 소속 시험지의 해당 값 최댓값으로 결정한다. 시험 시행 연도, 학교 최초 생성일, 최신 개정·검수 수정일은 정렬에 쓰지 않는다. 누락 시각은 null을 유지하여 뒤에 표시한다.

## 검증

- `node --test tests/school-sources.test.cjs`: 4개 통과. 전체 가나다순/최근순, 11개 학교 10+1, 동일 학교 보존, 새 기출 추가, 같은 날짜 보조 정렬, 누락 날짜, 기존 난이도 필터, 실제 PGlite SQL/회원 권한, 서버 집계와 킬러 필터 일치.
- `tests/home-upload-progress.test.cjs`: 기존 검사 3개 통과.
- `tests/composition-boundary.test.cjs`: 기존 검사 3개 통과.
- `node tests/web-navigation-browser.cjs`: 실제 번들을 로컬 Edge에서 실행. 390/1280px 버튼 순서와 기존 모의고사 연결, 두 목록 교차 진입, 학교 10+1·페이지별 기본 펼침, 원본 문항 화면 연결, 킬러 60개 집계/결과 60개, 2페이지에서 난이도 변경 시 초기화, 검색·학교 조합, 빈 결과·해제 확인. API와 계정은 격리 모의 자료. 브라우저 오류 0.
- 정식 `scripts/build-bank-web.cjs` 빌드 통과. 처음에는 기본 Python의 python-docx 의존성이 없었으나 기존 Codex Python 런타임을 지정하여 통과했다. 최종 콜백 변경 후 같은 옵션·구성 버전으로 app 번들도 다시 컴파일했다.
- 구문 검사, `git diff --check` 통과. 별도 lint/typecheck 명령은 프로젝트에 정의되어 있지 않음.
- `difficulty-threshold-unified.test.cjs`는 3개 실패. 변경 전 HEAD의 소스로 격리 실행해 같은 3개 실패를 확인했다. 과거 AI 응답 형식과 증명 +2 기대값을 포함하며 이번 작업에서 평가 기준이나 테스트 기대값을 바꾸지 않았다.

## 반영 상태와 확인 경로

운영 반영 완료(2026-10-10). 읽기 전용 RPC 마이그레이션을 적용하고 실제 조회 18개 시험지·12개 학교·등록일 누락 0개 및 회원 권한을 확인했다. 운영 시험용 데이터 쓰기 0회. 웹 배포 ID는 `e788dbd7`, 배포 소스는 `9f3b609a275ea2de780de97546806c28cc1d4529`이다. GitHub Actions [38032248760](https://github.com/animochoi-2026/ExamStudio/actions/runs/38032248760)이 성공했고 운영 URL의 공개 파일 90개가 최종 번들의 SHA-256과 모두 일치했다. 배포 전 확인된 원본 번호순 표시·전체 원본 조회 수정도 운영 파일과 바이트 단위로 대조하여 보존했다. 새 브라우저 탭에서 운영 로그인 화면 정상 로드를 확인했다. 기존 탭은 시험지 작성 중이므로 건드리지 않았으며 새 탭의 로그인 후 실제 화면과 실제 휴대폰 확인은 미검증이다. 로그인 후 화면 동작은 위 격리 브라우저 검사 결과를 재사용한다. 데스크톱 앱은 변경하지 않았다.

배포 ZIP: `ExamStudio-web-navigation-20261010.zip`, SHA-256: `ac20a921fe1f40f5b914f12e57206acef8f6af331535398e739294d8c0c45000`. [Release](https://github.com/animochoi-2026/ExamStudio/releases/tag/web-navigation-20261010).

반영 후 홈 → 기출문제 복원하기 아래 실전모의고사 출제하기 / 원본 시험지 개수 → 가나다순 / 기출 등록 학교 → 최근 등록순 / 난이도 분포 킬러 → 해당 문항 목록 순서로 확인한다. 결과 파일은 `artifacts/web-navigation/browser-results.json`, 화면 증거는 `home-390.png`, `home-1280.png`에 있다.
