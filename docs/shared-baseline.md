# 세션 공통 운영 기준

2026-10-13: 웹 `4e0f524`와 데스크톱 `45e4f46`의 승인된 수정 이력을 merge했다. 통합 소스의 시작점은 `03e3cc3`이며 원래 브랜치와 미완료 작업은 보존한다. 현재 공식 checkout과 커밋은 **Git 공통 디렉터리의 `examstudio-current.json`** 에 기록한다. 이 파일은 이 저장소에 연결된 모든 worktree에서 공통으로 읽는다.

## 시작/재개

1. `git status --short`로 기존 작업을 확인하고 보존한다.
2. `node scripts/canonical-release.cjs status`를 실행한다. 오래된 worktree에 스크립트가 없으면 공통 디렉터리의 JSON에서 checkout을 찾아 그 스크립트를 현재 디렉터리에서 실행한다.
3. `includesCanonical: false`이면 공식 커밋을 기존 브랜치에 merge하거나 공식 기준에서 새 worktree를 만든다. 다른 세션의 작업 폴더를 강제로 reset하지 않는다.
4. `AGENTS.md`, `release/canonical.json`, `docs/hwpx-compatibility.md`를 읽는다. 이미 진행 중인 대화가 자동으로 이 파일을 읽었다고 가정하지 않는다. 다음 작업 전에 다시 읽는다.

`C:/Users/reals/.codex/AGENTS.md`에도 이 저장소의 공통 기준 안내를 둔다. 다른 프로젝트에는 적용하지 않는다. 다른 PC로 옮기는 경우 tracked `AGENTS.md`와 `release/canonical.json`을 사용하고 공식 커밋을 전달해야 한다. 로컬 Git 공통 설정은 자동으로 다른 PC에 복제되지 않는다.

## 단일 배포 경로

```powershell
$env:EXAM_EXPORT_PYTHON='C:/Users/reals/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
node scripts/canonical-release.cjs verify
node scripts/canonical-release.cjs deploy <공개설정.json> <존재하지않는출력폴더>
```

배포기는 공통 잠금을 잡고 최신 기준 포함 여부, 회귀 검사의 원본 보존, 기능/출력 검사, 배포 전 운영 자산 해시를 확인한다. 깨끗한 소스에서 새 폴더에 빌드하고 배포 후 모든 자산을 대조한다. 배포 중 결과를 확인하지 못하면 잠금을 남긴다. 잠금을 지워 자동 재시도하지 말고 실제 운영 상태부터 확인한다.

정상 배포 결과는 공통 디렉터리 `examstudio-production.json`에 저장한다. 이어서 `release/canonical.json`에 검증된 플랫폼 상태를 갱신하고, 새 기준 커밋으로 `examstudio-current.json`을 원자적으로 갱신한다. 변경 전 값은 이력으로 보존한다. 이전 배포 이후의 개선을 빠뜨리지 않도록 기준 갱신을 생략하지 않는다.

`release/contracts.json`은 보존할 테스트와 HWPX 핵심 XML 소스를 고정한다. 정당한 계약 변경은 사용자의 요청과 검증 근거가 있을 때만 별도 검토한다. 테스트 기대값을 느슨하게 바꿔 빌드를 통과시키지 않는다. 운영 배포 승인은 기능 구현 승인과 구별한다.

## 실제 적용 범위

- 0.4.35 웹 운영본: `b03a491a`, 빌드 소스 `d3749d3`, 공개 자산 92개 해시 일치.
- 설치 앱: `runtime/current`의 0.4.35. 새 ZIP의 프로그램 파일 3,923개가 설치 결과와 일치하며 교체 전 파일은 별도 백업에 보존했다.
- 실제 데이터: `data/r2-current`. 대기열·설정·인증을 포함한 주요 상태 파일 8개의 해시가 설치 전후 동일하다. 사용자 프로필로 앱을 재시작하거나 AI 작업을 재개하지 않았다.
- 과거 설치 앱과의 5개 소스 차이는 해소했다. `shared-contracts.json`과 `export-engine.json`은 같은 소스에서 생성하는 검증용 명세다. 새 설치의 공개 연결 설정에도 운영 저장소 옵션을 포함한다.
- `release/stable.json`과 0.4.21 자료는 역사적 복구 기준이다. 현재 상태를 가리키지 않는다. 기존 검사의 비교 자료로 보존한다.
- Git 공통 pre-push 훅은 오래된 커밋의 main/공식 브랜치 push를 거부한다. 다른 기능 브랜치 push는 막지 않는다.
- GitHub main에도 공통 기준과 workflow를 반영한다. 이력 검사는 전체 fetch를 사용한다. 로컬 배포 잠금은 다른 PC의 배포까지 잠그지 않는다.
- 직접 Wrangler 호출이나 설치 파일 수동 복사를 운영체제 권한으로 봉쇄하는 보안 장치는 아니다. 모든 세션은 공통 지침에 따라 단일 배포기를 사용해야 한다. 강제력이 더 필요하면 추후 배포 자격증명을 CI 전용으로 옮겨야 한다.

0.4.35 릴리스는 웹 배포와 설치 앱 갱신을 포함한다. AI 호출, DB 변경, 운영 프로필 앱 재시작, 문항 재업로드는 하지 않았다. Hancom 2020 실기 출력 검증은 XML 검사와 별개로 남는다. Codex 클라우드 작업 갱신은 `docs/codex-cloud-sync.md`를 따르고 작업별 결과를 확인한다.
