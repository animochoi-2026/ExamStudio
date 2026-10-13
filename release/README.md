# 문제공방 현재 공식 기준

현재 소스 및 플랫폼별 운영 상태는 [canonical.json](canonical.json)을 사용합니다. 모든 세션의 작업 절차는 [공통 기준 안내](../docs/shared-baseline.md)와 루트 [AGENTS.md](../AGENTS.md)를 따릅니다.

`node scripts/canonical-release.cjs status`로 이 저장소의 모든 worktree가 공유하는 최신 기준을 확인하고, `npm run baseline:verify`로 배포 전 계약을 검사합니다.

0.4.21 당시 자료는 [과거 안내](history/README-v0.4.21.md)와 `stable.json`에 보존했습니다. 현재 운영 상태가 아닙니다. 플랫폼별 적용 내역과 통합 소스는 구별합니다.
