# 문제공방 공식 기준본 0.4.21

제품의 기준은 이 저장소 루트다. `phase2-desktop`은 더 이상 개발 소스가 아니다.
실행 중인 앱이나 사용자 프로필을 소스 동기화 대상으로 삼지 않는다.

## 확인된 운영 기준

- 웹: https://examstudio-shared-bank.pages.dev/
- Cloudflare production: `e1e5d963-c093-4dae-a2e3-1d917cb535fd`
- 배포 방식: 검증 ZIP을 Wrangler로 Pages main에 직접 배포. GitHub의 과거 ZIP보다 운영본이 최신이었다.
- Windows: 0.4.21, 기존 `문제공방.vbs`와 실행 경로 유지.
- 출력 엔진: `stable.json`의 `exportEngine`이 공통 Python/HWPX 소스와 패키지 해시를 기록한다.
- HWPX: 직접 저장. 한글 자동 실행이나 HWP 변환을 요구하지 않는다.

`stable.json`에는 운영 웹 91개 파일, 앱 167개 파일, 공통 출력 엔진 및 소스 해시가 있다.
commit SHA는 자신의 파일에 넣을 수 없으므로 `v0.4.21^{commit}`으로 확정한다.
Release의 `checkpoint.json`에는 확정 SHA, 자산 해시, 데이터 경로와 복구 방법을 기록한다.
추가 날짜별 백업 ZIP을 만들지 않는다.

## 빌드와 배포

Node 의존성은 `npm ci`로 설치한다. 소스에서 웹을 재현하는 명령:

```powershell
node scripts/build-bank-web.cjs config/public-bank.json web-bank/dist --stable
```

이 명령은 전체 기능 검사를 반복하지 않고 기준 소스와 최종 91개 자산의 바이트 일치를 검사한다.
공개 연결 설정에는 publishable key만 있다. 사용자 토큰이나 서비스 역할 키를 넣지 않는다.
데스크톱과 웹에서 이미 승인된 도형 표현 차이는 `web-bank/rendering` 두 파일과
`scripts/web-platform.cjs`로 명시한다. 나머지 공통 계약은 루트 `app`을 사용한다.

Windows 복구는 Release의 `ExamStudio-0.4.21-win32-x64.zip`을 새 폴더에 푸는 것으로 가능하다.
고정 Electron/Python/Codex 런타임을 포함하므로 별도 한글 설치가 필요하지 않다.
공식 ZIP을 바탕으로 현재 태그의 소스를 다시 패키징하려면:

```powershell
node scripts/package-stable.cjs <공식ZIP을푼폴더> <새빌드폴더>
python scripts/github-release.py <새빌드폴더> <새ZIP출력폴더>
```

런타임 원본은 공식 Release에서 복구한다. 과거 로컬 빌드가 필요하지 않다.
일반 개발 빌드는 `npm run package`를 사용하며 기존 릴리스 검사를 유지한다.
승인된 생성 자산 `app/paper-form-runtime.js`, `app/paper-form.css`, `app/paper-form-editor.html`은
실행에 필요한 소스 자산으로 보존한다. 자동 재생성으로 현재 디자인을 바꾸지 않는다.

웹 배포는 GitHub의 **Deploy ExamStudio web manually** workflow로 수행한다.
기본은 검증만 하며, 명시적으로 deploy를 선택해야 배포한다.
공식 Release ZIP을 내려받아 ZIP/자산 해시와 운영본 변경 여부를 확인한 뒤 배포한다.
이번 기준본 확정 작업에서는 운영 웹을 다시 배포하지 않았다.

## 데이터와 복구

현재 머신의 workspace 상대 경로:

- 실행 build: `phase2-desktop/builds/hwpx2018-20261010/ExamStudio-win32-x64`
- 실제 data/profile/queue/settings: `phase2-desktop/builds/2026-10-04T18-24-24-702Z-ce2b8464/ExamStudio-win32-x64/data`
- 이전 실제 사용자 작업: `dist/ExamStudio-win32-x64/data` (프로그램 파일과 구분하여 보존)
- 결과물: `결과물`; 원본 및 첨부: `소스`, `attachments`, `.codex-remote-attachments`
- 로컬 인증/설정: `data/shared-bank-auth`, `data/shared-banks`, `app/shared-bank-config.json`, `web-bank/config.json`

데이터는 GitHub에 올라가지 않으며 Release에도 없다. 프로그램 복구 시 기존 VBS의
`EXAM_DATA_DIR`/`EXAM_OUTPUT_DIR` 연결을 유지한다. 빈 프로필로 대체하거나 데이터 초기화를 하지 않는다.
Git history/tag/Release는 **프로그램** 복구 수단이다. 운영 DB와 사용자 원본 데이터의 백업을 대신하지 않는다.

## DB 이력과 테스트

`supabase/migrations`의 SQL과 `tests/fixtures/deployed-db-history`의 실제 배포 이력을 보존한다.
후자는 읽기 전용으로 수집한 함수/마이그레이션 정의이며 운영 행 데이터가 아니다.
`migration-manifest.json`은 두 위치의 SHA-256과 격리 재현 순서를 기록한다.
과거 SQL 파일 전체를 운영 DB에 무조건 재적용하지 않는다. 적용 이력과 대조한 후 필요한 변경만 배포한다.
이번 작업은 DB에 SQL을 적용하지 않았다.

자동 테스트 코드는 유지한다. 운영 문항에서 캡처한 소수의 비공개 회귀 입력 JSON과 실제 파일 구조 검사에 쓰는 HWP 한 건은
`tests/fixtures`에 그대로 두되 공개 Git/Release에서 제외한다. `private-fixtures.json`에 경로와 해시를 기록했다.
해당 테스트를 다른 머신에서 실행할 때에는 사용자가 보유한 입력을 별도로 전달해야 한다.
이 제약을 테스트 skip이나 기대값 변경으로 숨기지 않는다. 생성 PDF/HWPX/PNG와 검사 로그는 삭제한다.

## 업데이트 원칙

항상 이 루트 소스에서 개발하고 변경 범위에 해당하는 검사를 수행한다.
공식 버전/태그와 자산 해시를 갱신하고 Release 복구 가능성을 확인한다.
운영 변경을 추적하지 않는 소스 복사본이나 날짜별 로컬 복구 ZIP을 쌓지 않는다.
GitHub Release 자동 삭제는 비활성화하고, 보존 정리는 수동 실행만 가능하게 한다.
