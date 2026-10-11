# 실사용 기준 보존 — 2026-10-11

R2 이전/전환 완료 상태를 유지한다. 이번에는 재이전·전체 검증·동결·배포를 하지 않았다.

모든 상대 경로의 기준은 `C:\Users\reals\Desktop\문제생성기\tmp\r2-freeze-preparation`이다. **이 폴더는 현재 앱과 자료가 있는 운영 보존 경로다. tmp라는 이름을 이유로 정리하거나 이동하지 않는다.**

## 실행 및 자료

- 바탕화면: `C:\Users\reals\Desktop\문제공방 R2.lnk`.
- 바로가기 대상: `tests/artifacts/r2-freeze/문제공방-R2-실행.cmd`. 작업 디렉터리도 위 기준 경로로 고정하고 바로가기를 재조회했다.
- 실행 파일: `builds/2026-10-10T15-11-21-216Z-7209fdc9/ExamStudio-win32-x64/문제공방.exe`.
- 로그인/사용자 자료: `tests/artifacts/r2-freeze/production-acceptance-3a176cad-2513-47fc-bcba-9e72498592ab` (`EXAM_DATA_DIR`). 현재 검증된 경로 그대로다. 기존 앱·기존 자료 폴더는 그대로 보존했다.
- 다른 PC에 전달 가능한 기존 패키지 폴더는 위 `ExamStudio-win32-x64` 전체 폴더다. exe 하나만 복사하지 않는다. R2 전용 완성 ZIP/설치파일은 이 준비 작업의 builds에 없다. 재패키징/다른 PC 시험은 하지 않았다. `결과물`에 이번 PDF가 저장돼 있으므로 배포 대상 코드와 구분한다. 현재 로그인 자료 폴더/DPAPI 보관함은 다른 PC에 배포하지 않는다.

## 다음 업데이트 기준 대응표

| 대상 | 검토 기준 / 보존 위치 |
|---|---|
| 운영 적용 소스 | `59763ba8ba0ae3cff8a3ed1c7c59bca3f4e4d5c7`, 로컬 `codex/r2-freeze-preparation` |
| Electron 앱 코드 기준 | `e322bfce150fbcd204914eb322918afe99e4f498` 계열; 앞선 실제 패키지 148개 런타임 파일 일치 기록은 `hosted-staging-20261010.md`에 보관. 이번에는 전체 재검사하지 않음 |
| Electron 패키지 | 위 builds 폴더. exe SHA-256 `15e000fb29f05335e9585d6da6962e0cba385968866c13dddddc9ed41be5db74`는 실행 파일 식별용이며 패키지 전체 해시를 뜻하지 않음 |
| 웹 운영 배포 | Cloudflare Pages `cc1a2c29`, `https://cc1a2c29.examstudio-shared-bank.pages.dev`, 프로젝트 `examstudio-shared-bank` |
| 실제 웹 산출물 | `tests/artifacts/r2-freeze/production-web-r2`; 기존 운영 파일 90개 일치 증거 `production-public-deploy-check-b.json` 재사용 |
| 공개 연결 설정 | `tests/artifacts/r2-freeze/production-public-config-r2.json`; SHA-256 `0629fe5206bf5d1bd9d48adad7a56405cf773444ad8a09c55017f93aa1058475`; production project `bjxxqdbftefughjkcrqj`, `storageGateway=true` |
| Edge / SQL | bank-verify v7, bank-delete-question v4, bank-image-transition v4, bank-storage v1; `production-edge-cutover-b.json`, `docs/r2/cutover-delta.sql` 및 이전 실제 함수 소스 보존 |
| 전환 결과 기록 | `cc6740bf6175ea1e27b7dd32241f392fbb85ca9e`, `cutover-result-20261011.md`. scope 보완은 준비 자료 도구 수정이며 운영 재배포 아님 |

**기존 `.github/workflows/deploy-pages.yml`의 `web-mock-recovery-20261010` / `ExamStudio-web-mock-recovery-20261010.zip`은 이전 고정 배포물이다. R2 운영 배포본으로 사용하지 않는다.** 다음 업데이트는 이 표의 기준에 필요한 변경만 반영해 새 산출물을 만든다. 이번에는 push/merge/운영 재배포 없음.

## 한 번의 실제 PDF 저장

- 현재 복원된 경원중 원문 4번을 앱의 `PDF 저장` 버튼으로 실제 저장했다. 원문 번호는 4번이며 한 문항 시험지의 출력 번호는 1번이다.
- 앱 원본 출력: `builds/2026-10-10T15-11-21-216Z-7209fdc9/ExamStudio-win32-x64/결과물/2025학년도 경원중 2학년 1학기 수학 중간고사_2026-10-11.pdf`.
- 찾기 쉬운 동일 파일 사본: `output/pdf/경원중_2025_1학기_중간_4번_R2_저장확인.pdf`.
- 62,172 bytes, 2쪽. 저장 PDF를 다시 열어 렌더링한 두 페이지에서 문제/보기/선택지와 정답 ⑤19/상세 풀이가 보임을 확인했다. 이 한 흐름으로 시험 종료.
- 새 문항 등록/수정 이력/AI 호출/로그인·업로드·복원 재시험 없음. `failed_optional` 목록 썸네일은 별도 미해결 수정 건으로 유지한다.

## 원본 정리 전 확인만 수행

- 기존 `cutover-20261011-b`의 전체 내용 검증 성공 기록을 현재 키로 열어 재사용했다. 원본 파일 내용을 다시 내려받거나 해시 검사하지 않았다.
- 최신 원본 목록의 이름·크기를 기존 manifest와 대조: 후보 2,463 저장 객체, 830,696,517 bytes (=830.7 MB, 약792.2 MiB). 후보 밖 원본/누락 모두 0. 예상 확보량은 **Storage 객체 용량**이며 DB 용량 감소를 의미하지 않는다. 이번 목록 대조는 새 내용 검증이 아니다.
- 백업 `backup-20261011-0d020163-87d5-4cb5-ac81-8b91a419e706`: 로컬 암호화 82부분을 현재 `MIGRATION_STATE_KEY`로 복호화·무결성 확인. 비공개 R2의 암호화 manifest도 읽어 로컬과 일치 확인. 원본 파일 내용 백업을 새로 만든 것은 아니다.
- 키는 `%LOCALAPPDATA%\ExamStudio\R2Preparation\secrets.clixml`의 Windows 사용자 DPAPI 보호 보관함에서 사용할 수 있다. 현재 PC/계정에서만 복구 가능함을 확인했다. 다른 PC에서도 복구 가능한 독립 키 보관은 확인되지 않았다. 값은 출력/문서/커밋에 기록하지 않았다.
- 백업 시각 `2026-10-11T00:44:59.813Z` 이후 새 파일 참조 **9개 / 444,937 bytes**가 있다. 경원중 신규 등록·수정 이력 등이므로 문항 9개라는 뜻이 아니다. 현재 서비스/R2에는 있지만 기존 전환 전 백업에는 포함되지 않는다. 독립적인 최신 파일·DB/참조 백업 확보는 확인되지 않았다.
- **삭제 준비 미완료**: 전환 후 신규·수정·삭제 기록을 포함한 최신 복구 가능한 DB/참조 및 파일 별도 백업, 현재 PC 상실에도 사용 가능한 안전한 키 보관, 그 백업 복구 확인과 별도 삭제 승인이 필요하다. 기존 Supabase 원본을 지우면 원본 파일의 별도 사본 하나가 사라지므로 R2만 남은 상태를 충분한 독립 백업으로 취급하지 않는다.
- 읽기 전용 결과: `tests/artifacts/r2-freeze/cleanup-readiness-20261011.json`. 원본/DB 삭제·키 폐기·쓰기 동결·설정 변경 없음.
