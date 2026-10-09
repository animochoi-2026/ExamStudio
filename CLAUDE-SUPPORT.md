# Claude 연결

오른쪽 AI 설정에서 **Claude**를 선택합니다. **Claude 로그인·계정 → 로그인**을 누르면 공식 Claude Code 연결 파일을 준비하고 로그인 콘솔을 엽니다. 콘솔과 브라우저에서 로그인을 마친 뒤 **연결 확인**을 누릅니다. 같은 컴퓨터의 Claude Code 로그인을 공유하므로 로그아웃·계정 전환은 그 로그인에도 적용됩니다.

Sonnet / Opus, 추론 수준 낮음 / 보통 / 높음을 선택할 수 있습니다. 기본값은 Sonnet / 보통입니다. 모델 이름은 Claude의 공식 별칭이며 실제 모델과 이용 가능 여부는 Claude 서비스와 계정에 따라 결정됩니다. 사용량 비율은 추정하지 않습니다. 모델 설정은 `data/claude-settings.json`에 저장합니다.

개별 및 일괄 인식·풀이·유사문제 생성, 수정·재검수, 다시 그리기 모델 선택에 적용됩니다. 기존 Workflow가 구성하는 공통 검수 규칙·시험 범위·추가 요청·출력 스키마를 전달합니다. 실패한 요청을 GPT/Gemini로 자동 재실행하지 않습니다.

처음 연결할 때 공식 Windows x64 바이너리를 `runtime/claude`에 다운로드하고 고정된 버전의 크기와 SHA-256을 검증합니다. Node.js나 Claude 앱을 별도로 설치하지 않아도 됩니다. 프로그램 배포에는 계정 정보나 이 컴퓨터의 Claude 설정을 넣지 않습니다.

질문과 선택 이미지는 CLI의 표준입력으로 직접 전달합니다. 도구·MCP·사용자 정의 기능을 끄고 `--no-session-persistence`로 CLI 대화 기록을 남기지 않습니다. 문제공방 자체의 작업·대화 저장은 유지합니다. 환경변수의 API 키는 사용하지 않으며 Claude 구독 로그인만 연결합니다.

## 검증

- `node --test tests/claude.test.cjs`: 다운로드 검증, 입력 이미지·스키마 전달, 작업 취소, 응답 오류 처리.
- `node tests/desktop-claude.cjs`: 격리된 데이터와 모의 AI로 실제 Electron의 계정 버튼·모델 저장·인식·풀이·생성·일괄 Word 출력 경로 확인.
- `node tests/claude-live.cjs`: 현재 로그인된 Claude 계정으로 공개 가능한 덧셈 이미지 한 개를 보내는 실제 연결 테스트. 서비스 사용량이 발생합니다. 유효한 로그인이 필요합니다.

공식 문서: https://code.claude.com/docs/en/cli-reference
설치 원본: https://claude.ai/install.ps1
