# Codex 클라우드에서 같은 기준 사용하기

공식 원격 저장소는 `https://github.com/animochoi-2026/ExamStudio`다. 로컬 운영 기준을 검증한 뒤 `main`과 릴리스 태그에 함께 공개한다. Cloudflare 웹 배포와 Codex 클라우드 작업의 파일 갱신은 서로 다른 작업이다.

## 새 작업

이 저장소의 최신 `main`에서 시작하고 `AGENTS.md`, `release/canonical.json`, `docs/shared-baseline.md`, `docs/hwpx-compatibility.md`를 먼저 읽는다. Git 이력이 얕아 필수 조상을 확인할 수 없으면 이력을 가져온 뒤 `node scripts/canonical-release.cjs check --clean`으로 검사한다. Windows PC의 절대 경로를 클라우드에 새로 만들지 않는다.

## 이미 열린 작업

GitHub의 main 갱신이 기존 작업의 파일을 자동으로 바꾸지는 않는다. 각 작업에서 원격 주소, 현재 HEAD, `git status --short`, 미완료 변경과 로컬 전용 산출물을 먼저 확인한다. 최신 공식 릴리스 태그를 fetch하고 현재 작업의 변경을 보존한 상태에서 통합한다. 변경사항이 있거나 충돌 가능성이 있으면 기존 폴더를 유지하고 최신 기준의 별도 worktree에서 이어간다. `reset --hard`, `clean`, 강제 push로 기존 작업을 지우지 않는다.

갱신 후 실제 checkout, HEAD, 공식 릴리스 포함 여부와 공통 검사를 보고한다. 완료 메시지를 받았다는 사실만으로 동기화가 확인된 것은 아니다. 연결 도구나 작업 환경에 접근할 수 없으면 해당 작업은 미갱신으로 기록한다.

동기화 작업에서 웹 재배포, DB 마이그레이션, 운영 앱 설치, AI 인식/풀이 호출, 대기열 재개를 자동 실행하지 않는다. 문항·검수·프로필 등 사용자 데이터와 자격증명은 GitHub에 포함하지 않는다.
