# 구독 계정 평가 경로 (2026-10-18)

사용자가 API 대신 현재 ChatGPT 구독 사용을 지시했다. API 키 등록·API 비용 제안은 이번 로컬 파일럿에 적용하지 않는다. `codex login status`에서 `Logged in using ChatGPT`를 확인했다. 구독 등급 이름·20배 한도 자체는 확인하지 않았다.

- 공식 Codex CLI의 저장된 ChatGPT 로그인만 사용한다. 로그인 파일을 읽거나 서버로 복사하지 않는다.
- `forced_login_method="chatgpt"`, OpenAI provider, `--ignore-user-config`, API 키 환경변수 제거. 로그인 확인 실패 시 중단하며 API로 fallback하지 않는다.
- `gpt-6.1-sol`, high, 기존 원시 판정 프롬프트와 JSON Schema를 유지한다. 구독 한도 소진 시 중단한다. 자동 재시도는 0회이며 불명확한 결과를 재호출하지 않는다.
- API Responses의 background/12000-token cap과 CLI 동작은 동일하지 않다. 별도의 evaluationVersion을 사용하여 API 결과와 혼용하지 않는다. API 달러 비용을 구독 사용량으로 표시하지 않는다.
- 외부 목표 점수/교사 점수/과거 평가/프로젝트 이력 없이 평가 원문만 전달한다. 임시 작업 폴더, shell 비활성, web 비활성, 프로젝트 지시문 로드 차단, 개인 설정 미로드를 사용한다.
- 결과·원시 판정·입력 버전·thread ID·usage를 비공개 로컬 산출물로 저장한다. 문항별 실행 의도를 먼저 배타적으로 기록해 동시 중복과 중단 후 자동 재호출을 막는다.
- 스코어러는 기존 모듈을 사용한다. 서버 배포·운영 활성화 없이 실행 가능하다. 서버 자동 평가나 데스크톱 상시 평가가 구독 방식으로 배포됐다는 뜻은 아니다.

## 파일 대응

- `2-1000038773.jpg`: V1 20번, V2 21번, V3 서답형1, V4 서답형2.
- `3-1000038779.jpg`: V5 서술형3.
- `1-1000038768.jpg`: 주사위1501번. 기존 V1–V8에 없는 별도 참고 문항으로 보존하며 임의 교체하지 않는다.
- V6–V8 서술형4·5·6이 있는 `1000038784` 원본은 아직 없다.

입력 준비는 27/30이며 전체 파일럿이 준비되지 않은 상태에서는 실행을 차단한다. 새 입력 세트와 기존 승인 범위를 유지한다. 전체 문제은행 평가와 운영 교체 승인은 별도다.

## 실행

`node scripts/run-difficulty-v12-subscription.cjs <30-item-manifest.json> <private-output-directory>`는 입력·로그인만 확인한다. 같은 명령에 `--run-approved`를 추가하면 구독 평가를 순차 실행한다. 실패 시 중단하며 운영 DB를 쓰지 않는다. 이전 실행의 intent만 남은 경우 자동 재시작하지 않는다.

검증: 모의 프로세스 테스트와 입력 해시/대상 수 검사. 실제 CLI 모델 호출은 누락 원본 확보 전 미실행이다.

공식 근거:
- https://learn.chatgpt.com/docs/auth
- https://learn.chatgpt.com/docs/non-interactive-mode
- https://learn.chatgpt.com/docs/config-file/config-reference
