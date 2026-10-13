# 그룹 운영과 시험지 보관

2026-10-14 사용자 통합 요청에 따른 변경. HWPX 엔진, 원본 문제, 대기열, 설치 앱은 변경하지 않는다.

## 운영 규칙

- 이름(60자)·학원명(120자)은 신규 가입 완료에 필수이며 서버에서도 검증한다. 기존 회원은 빈 프로필로 계속 로그인하고 내 계정에서 보완할 수 있다. 학원명으로 그룹을 추측하거나 자동 생성하지 않는다.
- 오너가 그룹을 만들고 회원을 명시적으로 배정한다. 관리자는 소속 그룹의 초대·승인·강퇴만 가능하다. 미배정 가입 신청은 오너가 승인한다. 보안 로그와 설정은 계속 오너 전용이다.
- 신규 모의고사만 생성 당시 그룹으로 공유한다. 기존 모의고사의 group_id는 NULL로 유지해 개인 자료로 보존한다. 회원 이동은 기존 시험지를 이동시키지 않는다. 일반 시험지는 계속 개인 자료다.
- 목록은 현재 선택 학년을 표시하지만 중복 방지는 학년·연도·학기 구분 없이 같은 그룹의 모든 보관 중인 모의고사를 검사한다. 미배정 회원은 본인의 보관 중인 개인 모의고사를 검사한다. 같은 모의고사 내 공통문항 재사용은 허용한다.
- 후보 조회·교체·복원 검사와 최종 저장에서 자동 검사한다. 최종 저장은 그룹 단위 트랜잭션 잠금 후 원본 식별자까지 검사한다. 사용자가 수동으로 제외 시험지를 선택하지 않는다.
- 일반 회원은 자신의 모의고사만 삭제한다. 관리자는 같은 그룹의 다른 회원 모의고사도 삭제하고, 오너는 전체를 삭제할 수 있다. 삭제 시 제목·생성자·생성일·재출제 가능 안내를 확인한다. 삭제 감사 기록은 오너만 조회한다.
- 일반 시험지와 모의고사는 생성 시각에서 한국 시간 기준 6개월 후 만료한다. 제목 변경·열람은 만료를 연장하지 않는다. 만료 자료는 즉시 조회/중복 대상에서 제외하고 매분 최대 각 200개를 실제 정리한다.

## 저장소와 마이그레이션

시험지는 bank_exam_drafts/document와 bank_exam_history 또는 bank_mock_exams/document와 bank_mock_items에 저장된다. PDF/DOCX/HWPX는 브라우저에서 만들어 다운로드하며 서버 시험지 전용 파일 객체가 없다. 로고·배치 데이터는 문서 JSON에 포함되고 목록 미리보기는 원본 문제은행 파일을 참조한다. 따라서 시험지 삭제/만료는 DB 문서·이력·연결을 트랜잭션으로 정리하며 참조한 원본 Storage 객체를 삭제하지 않는다. 이미 PC에 다운로드한 파일은 서버에서 삭제할 수 없다.

20261013162156_group_operations.sql은 기존 회원 profile_required=false, 기존 모의고사 group_id=NULL, 생성일 기준 expires_at을 채운다. 기존 문서 본문과 인증 정보는 유지한다. 20261013164112_paper_retention_schedule.sql은 pg_cron 매분 작업을 등록한다. 적용 전 운영 함수·정책·시험지 문서 해시·만료 건수와 원본 객체 수를 별도 백업한다.

DB와 웹은 함께 적용한다. 롤백 시 예전 웹을 바로 재배포하지 않는다. 새 그룹 공유/중복/보관 권한을 유지한 호환 수정으로 복구하고, 실제 삭제된 만료 자료는 백업 없이는 되살릴 수 없다.

## 구현과 검증

| 영역 | 주요 코드 | 검증 |
|---|---|---|
| 하단 가림 | bottom-clearance.js, style.css, exam-workflow.css | PC click/mobile tap으로 마지막 버튼, 단계 이동, 관리 도구 접근 |
| 트리·단계 | scope-tree.js, exam-workflow.js | 양쪽 범위 트리 초기 미선택/펼침, 선택 유지, 실제 구성 후 3단계 |
| 홈·학교 | home-view.js, display-help.js, school-sources.js | 난이도별 결과·빈 결과, 동일 마스킹, 실제 건수 |
| 프로필·그룹·초대 | member-profile.js, membership-ui.js, invitations.js | 실제 SQL와 브라우저 연계: 그룹 생성/배정/초대/필수 프로필/가입 |
| 모의고사 공유·중복 | mock-exams.js, question-replacement.js, DB bank_ops | 교차 그룹 RLS/API 거부, NULL 그룹 거부, 원본 ID 중복, 동시 저장 충돌 |
| 삭제·보관 | paper-library-policy.js, exam-library.js, expire_papers | 관리자 삭제/문항 재추천, 6개월 만료·불변·멱등성, 원본 보존 |

실행 명령:

```
node --test tests/group-operations.test.cjs
node tests/group-operations-browser.cjs
node tests/group-members-browser.cjs
```

동시 저장/실제 스케줄러 검사는 별도 폐기 가능한 PostgreSQL 17.11 인스턴스(127.0.0.1:55439)에서 실행한다. 운영 DB에 연결하지 않는다. 테스트 전용 pg 의존성은 `npm install --prefix artifacts/group-operations-runtime --no-audit --no-fund pg@8.23.1`로 준비한다. `node tests/group-operations-concurrency.cjs`는 임시 DB와 예약 작업을 만들고 끝나면 제거한다.

브라우저 테스트는 실제 앱 컴포넌트와 SQL을 사용하지만 계정은 합성 데이터다. Google OAuth 신규 계정 생성과 실제 초대 이메일 발송, 물리적 휴대전화/Safari 검증은 포함하지 않는다. 운영 적용 후 기존 계정의 PC·모바일 크기 화면을 별도로 실제 포인터로 검증한다. 유료 AI 호출은 사용하지 않는다.
