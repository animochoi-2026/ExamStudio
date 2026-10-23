# 모던 미니멀 시험지 폼 구현·검증 기록

## 작업 기준과 적용 상태

- 기준: `db3c54433fda3af64c7088f7bef7b8fdb5e4db13`. 시작과 종료 점검에서 공통 기록의 공식 커밋과 일치하고 `includesCanonical: true`였다.
- 격리 작업 폴더: `C:/Users/reals/.codex/worktrees/43e5/문제생성기`, 브랜치 `codex/modern-minimal-20261023`.
- 코드와 로컬 검증을 완료했다. 공식 소스에 병합하거나 운영 웹·설치 앱에 적용하지 않았다. 릴리스, 운영 데이터·계정 설정 변경, 실제 AI 호출은 하지 않았다.
- 참고 자료: 사용자가 지정한 `Documents/munjegongbang-design/modern-minimal-20261022`의 PDF·PNG·원본 로고와 Python 치수 자료. 원본 로고는 격리 검증에서만 사용했고 전 사용자 기본 로고로 포함하지 않았다.

## 구현

- 기존 기본폼·실전모의고사폼 옆에 `modern-minimal`을 추가했다. 저장된 시험지의 선택을 강제로 바꾸지 않는다. 기존 계정별 폼 카탈로그와 로고 업로드·저장 경로를 재사용한다.
- 일반 시험지·원문 복원·실전모의고사는 공통 편집/출력 경로를 사용한다. 직전대비 프린트의 별도 렌더러에도 연결했다. Electron은 같은 폼 모듈을 번들로 사용한다.
- A4 세로, 좌우 42pt, 단 사이 38pt, 중립 회색 중앙선, 강조색 `#8C1D24`. 로고 18pt, 학원명 11pt, 제목 기본 26.5pt, 유형 기본 40pt. 제목은 페이지 중심을 유지하며 긴 제목은 겹치지 않게 축소한다. 긴 시험범위는 정보칸과 본문 시작 높이를 함께 늘린다.
- 학원·로고·학년·과목·시간·문항 수·시험범위는 현재 설정/시험 데이터를 사용한다. 모의고사 제목·회차와 유형 표시는 각각 독립된 메타데이터로 전달한다. 반명은 왼쪽, 이름은 오른쪽이다. 바닥글에 학원명·쪽 번호·학년/회차를 표시한다.
- 본문 기본 9.6pt, 줄간격 14.9pt, 문제 번호 16pt. 이미 저장된 글자 크기는 보존한다. 배점 토글은 실제 확인된 원배점/시험 배점만 사용한다. 배점이 없으면 만들지 않는다. 배점을 숨겨도 번호와 짧은 선을 유지하며 머리 높이가 바뀌지 않는다.
- 서술형 묶음 시작만 다음 단으로 이동한다. 원문에 기록된 단답형을 서술형으로 바꾸지 않는다. 유형이 알려지지 않은 원문을 임의 추정하지 않는다. 연결문항 내부에 서술형 전환이 있으면 연결 세트의 연속성을 우선한다.
- 새 폼에서만 실측 높이 기반 연속 배치를 사용한다. 기존 폼의 고정 슬롯 배치는 유지한다. 큰 문항은 기존 무손실 분할기를 재사용하고 배치 불가능한 내용은 오류로 알린다.
- 기존 브라우저 이미지 PDF 생성·캐시 호출 경로를 유지했다. 서버 native PDF 생성 경로를 추가하지 않았다. DOCX/HWPX는 기존 편집 가능한 본문·수식과 폼 배경 캡처를 사용한다.

## 변경 파일

| 영역 | 파일 |
| --- | --- |
| 폼 등록·공통 판단 | `app/paper-form-model.cjs`, **신규** `app/modern-minimal.cjs` |
| 웹 폼·계정 설정·스타일 | **신규** `web-bank/modern-minimal.js`, `web-bank/exam-form.js`, `web-bank/paper-form-settings.js`, `web-bank/style.css` |
| 편집·배치·모의고사·기출프린트 | `app/exam-layout.js`, `web-bank/exam-editor.js`, `web-bank/mock-exam-model.cjs`, `web-bank/mock-exams.js`, `web-bank/past-print-render.js`, `web-bank/question-fragments.js` |
| 이미지/편집문서 출력 | `web-bank/export-resources.js`, `web-bank/paper-form-export.js`, `web-bank/snapshot-question.js`, `web-bank/web-export.js`, `scripts/export_docx.py`, `scripts/paper_form.py` |
| Electron 연결·저장·빌드 | `app/main.cjs`, `app/store.cjs`, `app/document-style.cjs`, `app/pdf-export.cjs`, `app/pdf-pagination.cjs`, `web-bank/desktop-paper-form.js`, `scripts/build-paper-form-runtime.cjs`, `.gitignore` |
| 생성 번들 | `app/paper-form-runtime.js`, `app/paper-form.css`. 번들 빌드에서 로컬 Noto 글꼴을 `app/print-fonts`에 복사하며 생성 글꼴은 Git에서 제외한다. |
| 검증 | `tests/integrated-stability.test.cjs`, **신규** `tests/modern-minimal.test.cjs`, `tests/test_modern_minimal.py`, `tests/modern-minimal-browser.cjs`, `tests/modern-minimal-desktop.cjs`, `tests/fixtures/modern-minimal-browser.js` |

## 검증 결과

- 공식 `canonical-release.cjs verify`: Node 회귀 검사 **84/84 통과**, 격리 출력 엔진 계약 검사 통과. 엔진 ID `c63161232857f6b591c4eb100ec3bb386cfb4fea1b646655288361e704ede822`.
- 새 폼 및 저장 회귀: `node --test tests/modern-minimal.test.cjs tests/store.test.cjs` **16/16 통과**. Python 네이티브 머리/다중 행 배치 검사 **2/2 통과**.
- 로컬 Edge: 합성 18문항, 문제지 4쪽. 배점 있음/없음에서 번호·본문·그림 위치 차이 0.02pt 미만, 배점 7점 등 개별 값·미확인 배점·단답형 보존, 서술형 새 단, 쪽 번호, 긴 제목·로고 없음, 75줄 긴 문항 분할, 직전대비 프린트와 기존 두 폼을 검사했다. 외부 요청은 차단했다.
- 계정별 폼 저장/재열기, 배점 표시 설정 보존, 로고 업로드, 유형 `B2`, 다른 계정으로 설정이 섞이지 않는 것을 확인했다. 실제 서비스 로그인·서버 저장은 수행하지 않았다.
- Electron: 별도 `userData`를 사용한 숨김 출력 창에서 실제 이미지 PDF 생성과 편집문서용 측정을 수행했다. 42pt 여백·38pt 단 간격, 9.6pt 본문, 서술형 시작과 여러 쪽을 검사했다. 설치된 사용자 앱은 교체하지 않았다.
- PDF 두 상태를 실제 이미지 PDF 경로로 생성하고 4쪽씩 렌더링하여 육안 점검했다. DOCX 두 상태를 LibreOffice로 각각 5쪽(문제 4쪽 + 빠른 정답 1쪽) 렌더링하여 점검했다. 문항·도형·풀이선의 잘림/겹침을 발견하지 못했다.
- 두 상태 각각 DOCX와 HWPX에 **편집 가능한 수식 44개**가 존재한다. HWPX 내부 header 1.4, version 5.1.0.1 / `hwpx-2018-profile-1`, 실제 참조 문단의 직접 margin/lineSpacing, equation 크기·baseline 0을 검사했다.
- 생성 번들을 제외한 소스 `git diff --check` 통과(CRLF 허용). 번들은 의존 라이브러리 문자열의 줄 끝 공백을 포함하므로 이를 임의 삭제하지 않았다.

검증 산출물은 `artifacts/modern-minimal-20261023/`에 있다: `score-on/off.pdf`, `.docx`, `.hwpx`, `browser-checks.json`, `native-checks.json`, `desktop/checks.json`, DOCX/PDF 페이지 렌더링과 `hwpx-render/render.json`. 모두 로컬 검증 자료이며 출시 파일이 아니다.

## 남은 확인·한계

- **한글 실제 출력 미확인**: 독립 Hancom COM 렌더러가 45초 후 시간 초과했다. 워커만 종료했고 기존 사용자 프로세스를 종료하지 않았다. COM 서버 정리 여부도 확인되지 않았다. 한글 2020·모바일·실제 인쇄 성공을 주장하지 않는다.
- Word 실앱은 검증하지 않았다. DOCX/HWPX의 편집 가능한 본문은 글꼴·수식 엔진에 따라 줄바꿈이 달라질 수 있다. 네이티브 문항 머리의 장식선은 텍스트 선으로 재현하며 배경/본문 결합은 픽셀 단위로 PDF와 동일하다고 보장하지 않는다. 글꼴 반포인트 단위 지원에 따른 9.6pt 재현 차이도 있다.
- 추가 `tests/export-question-contract.test.cjs`에 기존 실패 1건이 있다. `showOriginalPoints` 미지정 시 테스트는 7점을 기대하지만, 공식 기준의 `documentQuestion`과 이번 코드의 기존 폼 경로 모두 `null`을 반환한다. 공식 기준 소스를 직접 실행해 동일함을 확인했다. 이번 작업에서 기존 규칙이나 기대값을 변경하지 않았다.
- 실제 운영 계정의 로고/학원 설정, 서버 저장·다운로드 캐시 재사용, 설치된 앱의 전체 사용자 조작과 실데이터 출제는 검증하지 않았다. 기존 연결은 유지했으며 이후 운영 적용과 실제 계정 확인은 별도 범위다.
