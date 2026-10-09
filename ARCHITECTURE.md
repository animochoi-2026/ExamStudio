# 문제생성기 구현 구조

Windows Electron 44, plain HTML/CSS/ES modules renderer, CommonJS main. contextIsolation=true, nodeIntegration=false. 파일·AI·문서 작업은 main/preload IPC로 제한한다. 사용자 데이터는 실행 파일 옆 data/projects/<id>, 개발 실행은 루트 data/projects/<id>에 있다.

## 프롬프트와 실제 요청

renderer.js + workflow-ui.js → preload의 chat → main.cjs → Workflow.run() → prepare() → rules.compose() → 기존 Codex/Antigravity bridge.

- rules.cjs: 기본 모듈 {id,version,content,tasks}, 사용자 덮어쓰기와 기존 설정 원문 보관, 범위 구조와 조합. core, 작업 지시, 관련 모듈, 출력 계약을 안정적인 순서로 한 번씩 배치한다.
- task-schemas.cjs: recognition, generation, revision, correction, validation JSON 스키마. 두 bridge에 실제 스키마를 전달하고 응답 저장 전 로컬에서도 검사한다.
- workflow.cjs: 작업 선택, 자료 최소화, 확정 원문 재사용, 버전/승인/검사 상태, 변경 영향, 중복 요청/오래된 응답 차단, 실행 기록.
- workflow-ui.js: 세 설정 분류, 개별 모듈 편집/복원, 구조화 시험 범위, 작업/대상 선택, 동일 조합기의 미리보기와 실행 기록.

인식은 core + task.recognition + recognition.common + 관련 domains.*.recognition만 사용한다. 불명확한 영역은 네 인식 영역을 보수적으로 포함한다. 범위로 원문의 실제 영역을 추정하지 않는다. 영역 분류는 인식 응답에서 함께 받으며 별도 AI 호출이 없다.

생성은 production.common + 관련 math + 선택 variant + validation.common + 현재 범위를 사용한다. 내용 수정은 여기에 revision을 사용하며 variant는 명시적으로 요청한 경우만 포함한다. 인식 교정은 인식 규칙과 별도 교정 스키마를 사용한다. 재검수는 validation.common + 관련 math + 범위만 사용하며 대상 내용을 덮어쓰지 않는다.

규칙 모듈마다 AI 요청을 만들지 않는다. Codex는 새 작업 thread에 조합된 developer instructions/출력 스키마/선택 자료만 전달한다. Antigravity는 공식 CLI의 plan mode와 JSON 스키마를 유지하고 선택 자료만 전용 요청 폴더에 준비한다. 이전 대화는 로컬 보존하지만 새 작업에 전체 이력을 자동 첨부하지 않는다. 자동 API 키 전환이나 구독 변경은 없다.

## 저장과 상태

기존 Project/Problem/Question 기본 필드는 유지하고 다음을 추가한다.

- Project: scope, scopePresetId. scope는 현재 실행 범위의 유일한 원본이다. 별도 템플릿은 선택 시 현재 프로젝트에 복사한다.
- Problem: recognition, recognitionHistory, runs. 기존 source/crops/regions/messages/original/variants는 유지한다.
- Recognition: 본문, 보기, 조건/표식/출처, 인쇄 답/해설, 위치, 영역, 불확실성, 버전, 규칙/모델/스키마와 재사용 키, 확인 상태. observedDiagram은 근사적인 원문 배치다.
- Question: version, revisionOf, changes, provenance, checks, reviews, reviewBaseline, approval. 생성용 diagram과 관찰용 observedDiagram을 구분한다.
- Rules: data/prompt-modules.json의 overrides, legacy, presets. 기본 내용은 코드에 있으며 사용자 수정값과 구분한다. 이전 prompt-settings/profiles 파일은 유지하고 기존 호환 모듈은 새 실행에서 사용하지 않는다.

인식 완료, 범위 판정, AI 검산, 프로그램 계산 검사, 재검수, 사용자 승인 상태는 별개다. 형식 검증 성공은 수학 검증 성공이 아니다. 프로그램은 좌표 조건/수치형 선택지/금지 용어만 실제 검사하며 일반 수학 증명을 완료했다고 표시하지 않는다.

인식 재사용 키는 이미지 내용과 위치, 전처리, 인식 지시, 관련 모듈 버전, 실제 스키마, 출력 규격, 제공 업체/모델/추론 설정을 포함한다. 생성 개수/변형/범위 변경은 재인식 이유가 아니다. 확인·교정된 원문은 명시적 새 버전 인식 없이는 자동 덮어쓰지 않는다. 새 생성은 UUID가 다른 새 요청이며 동일 UUID의 재전송만 중복 처리한다.

규칙/범위/원문 변경은 관련 문항에 재검토 표시와 승인 해제를 적용한다. 요청 도중 변경되면 응답의 guard를 비교해 최신 결과 덮어쓰기를 차단한다. 기본값 복원은 한 항목만 바꾸고 원문·생성 결과를 삭제하거나 AI를 자동 실행하지 않는다. 이전 문항에 분리된 승인 기록이 없다면 legacyInclude로 종전 포함 상태를 보존하고 사용자 재확인을 요구한다.

## IPC와 보안

기존 importSource/openProject/addRegion/removeRegion/취소/계정·모델/출력 IPC를 유지한다. 새 API는 getRulesSettings/saveRule/saveScope/scopePreset/previewTask/confirmSource/approveQuestion/editQuestion이다. 일반 saveProject는 작업 엔진의 승인·버전·검사 데이터를 덮어쓰거나 본문을 우회 변경할 수 없다.

소스 경로와 이미지 읽기는 프로젝트 소유 자료에 한정하며 임의 파일·셸 권한을 renderer에 노출하지 않는다. 계정 인증 정보는 기존 공식 클라이언트가 관리한다. 실행 기록에는 적용 모듈·범위·자료 식별 정보·시간·제공된 사용량·실패 사유를 저장하고 전체 원문을 중복 기록하지 않는다. 선택 자료가 포함되는 Gemini 요청 폴더는 로컬 프로젝트 자료처럼 관리한다.

## 도형과 문서

기존 geometry.cjs + 공용 SVG 배치기를 재사용한다. exact constraints: perpendicular, parallel, equalLength, midpoint, collinear, distance, angle. 제작 좌표 검사는 수학적 해의 유일성을 증명하지 않는다. 관찰 좌표를 측정해서 인쇄 조건에 추가하지 않는다. 치수·빗금 구조화 보존과 모든 표식의 완전한 네이티브 렌더링은 구별한다.

buildDocument()는 사용자 승인/재검토 상태를 검사한다. 학생용은 정답·풀이·검수 필드를 제거하며 export_docx.py에서도 답/풀이/미주 생성을 제외한다. 교사용은 저장된 답·상세 풀이만 미주로 배치한다. 출력은 AI를 호출하지 않는다.

A4 세로 2단, 좌단→우단 순서, 보통 4문항/긴 문항 2개, 풀이 여백, 맑은 고딕 본문 12pt/미주 9pt, 중앙선, 편집 가능한 OMML을 유지한다. HWP는 안내 팝업 후 기존 한컴 자동화/호환 DOCX 경로를 유지한다. HWPX 최종 출력은 없다.

## 검증·배포

npm test, Python tests/test_export_docx.py, node tests/desktop-workflow.cjs를 사용한다. Electron 테스트는 실제 화면/IPC + 모의 AI다. tests/prompt-footprint.cjs는 문자열 수만 측정한다. 자세한 근거·실행하지 않은 검사는 [구현 보고서](PROMPT-WORKFLOW-REPORT.md)를 참조한다.

기존 배포를 갱신할 때 npm run package로 배포 폴더를 교체하지 않는다. 변경 코드만 백업 후 복사하고 사용자 data/결과물을 그대로 보존한다.
