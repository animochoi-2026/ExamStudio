# 난이도 v1.2 구현 준비

이 점수는 실제 학생 집단의 정답률이 아니다. 정규 교과를 숙달했지만 새로운 발상 생성에 취약한 기준 학생에 대한 construct-based predicted difficulty다. 개념 수, 풀이 길이, 계산 길이를 발상 난이도로 대신하지 않는다. 실제 응시 데이터가 확보되면 empirical difficulty를 별도 저장하고 관계를 보정한다.

## 상태와 실행 경계

- 기준 소스: 72b49cd, 격리 작업 브랜치 codex/registration-ui-20261017.
- v1.2 스코어러, 업로드 연결, 서버 큐, 웹 준비·검토·승인 UI를 구현했다.
- 설치 앱의 기능 플래그는 아직 켜지지 않았다. 운영 DB/웹/설치 앱은 변경하지 않았다.
- 파일럿 원문 3개와 실제 프롬프트·모델·비용 승인 후 파일럿만 실행한다.
- 전체 실행과 운영 점수 교체는 각각 후속 승인이 필요하다. 수동 점수도 최종 승인 교체 대상이며 그 전까지 유지한다.
- 새 SQL은 준비만 했다. 전체 db push, migration repair를 사용하지 않는다.

## 구성

- app/difficulty-v12/scorer.cjs: §15의 결정론적 계산. C/R/B/H/E, 의존 그래프, 독립 가지 max / 대체 경로 min, 조립 +1·문해력 +2·실행 +1.
- schema.cjs / prompt.json / input.cjs: 원시 JSON, 실제 프롬프트, 문항·이미지·교과 범위·풀이 제한·모델 설정 해시. 목표 점수와 기존 풀이/교사 점수는 입력하지 않는다.
- bundle-input.cjs: 현재 revision의 native 문항과 접근 가능한 원본 crop을 읽고 파일 크기/SHA256 검증.
- upload.cjs / bank-analysis.cjs / exam-queue-main.cjs: 플래그 활성화 후 기존 난이도 요청 대신 v1.2 평가. 과거 기준 점수는 새 평가로 재사용하지 않는다. 같은 입력 single-flight와 저장 결과 재사용, 기존 수동 값·교정 이력 유지. 저장본 전용 복구에서는 API 호출 금지.
- queue.cjs / responses.cjs / server.cjs: 호출 전 durable intent, Responses background 응답 ID 저장, GET 재개, 제한 재시도, 공통 오류 일시정지. 불명확한 POST는 자동 재호출하지 않고 해당 문항 실패로 보존한다.
- bank_v12.jobs/items: 입력과 기존 점수 백업, 승인, 호출 수, 원시 결과, 계산 결과 분리 저장. 진행 중 lease 만료 후 재개하며 완료 문항은 건너뛴다.
- bank_v12.upload_policy: 합격 파일럿 후 명시적 총 호출 예산·만료일로 신규 업로드 평가를 별도 허용한다. 여러 업로드 작업은 DB 잠금 아래 총 예산을 예약한다.
- 활성화: 같은 문항/검수 버전·메타데이터인지 재확인 후 성공 결과만 단일 트랜잭션으로 전환. 실패율 5% 초과/미완료/미승인은 차단. 이전 수동 값은 보존하며 롤백은 활성 표시만 해제한다. 업로드 payload로 임의 활성 표시를 만들어 교사 점수를 우회할 수 없게 DB trigger가 서버 기록과 대조한다.
- display.cjs / difficulty-assessment.cjs / presentation.js / bank-ui.js: 공통 계산 결과와 기본 티어·승급 표시. 신규 업로드에서는 교사 값 우선, 명시적 전체 전환 후에는 승인된 활성 결과 우선. 이후 수동 변경은 다시 우선한다.
- pilot.cjs: 외부 목표는 사후 비교 전용. 8개 티어/게이트/풀이 제한과 은행 22개의 실제 근거 검토 없이는 합격 불가.
- report.cjs: 전후 분포, 이동, 실패, 티어·게이트별 최대 20개 원문 검토 대상. 이전 점수는 비교를 위해 v1.2 구간에 매핑한 분포이며 과거 모델이 T0–T5를 평가했다는 뜻은 아니다.

## 준비·실행 방법

1. `node scripts/build-difficulty-v12.cjs`로 공통 모듈을 Edge engine.mjs에 번들한다.
2. 승인 후 필요한 신규 SQL `20261018014656_difficulty_v12_staging.sql`과 `bank-difficulty-v12`만 적용한다. 아직 적용하지 않았다.
3. Supabase Edge Functions Secrets에 `OPENAI_API_KEY`를 등록한다. 키는 브라우저/로그/저장소에 전달하지 않는다. 현재 서버 비밀정보 이름 목록에는 이 키가 없다.
4. pilot-client.cjs.preparePilot에 은행 22개 입력 목록과 실제 외부 이미지 3개의 바이트·해시 및 오너 세션 transport를 전달한다. 함수는 준비만 하며 모델을 호출하지 않는다.
5. 준비 상태의 manifestHash와 현재 promptHash를 확인하고 executeApproved에 명시적 승인 객체를 전달한다. 기본 30회, 기술 재시도는 항목당 최대 3회, 총 상한은 승인 값이다. strict_calibration=false.
6. 결과를 사람이 확인한 뒤 pilot-review로 항목별 근거와 제한 준수 여부를 제출한다. 자동 계산과 사람의 원문 검토가 모두 맞아야 passed=true.
7. 합격 후 웹 오너 패널에서 전체 스냅샷 준비 → 같은 파일럿 연결 → 실측 비용 승인 → 실행. 성공한 은행 22개는 입력/문항 버전이 일치하면 재사용한다.
8. 전후 분포·표본 검토와 includeManual 최종 승인 후 activate. 실패는 null로 보존하고 이전 점수를 유지한다. 되돌리기는 rollback.
9. 앱 활성화는 합격 파일럿과 신규 업로드 비용 정책 승인 후 다음 정식 앱 버전에서 enabled=true로 패키징한다. 설치 앱 파일을 임의로 복사하지 않는다.

실제 HTTP 자격 증명·서버 배포·파일럿 모델 판정은 아직 검증하지 않았다. 배포할 때는 프로젝트 canonical-release 절차와 필요한 서버 구성요소만 사용한다.

## 검증

- 신규 스코어러/큐/업로드/권한/격리 SQL 테스트 및 기존 빌드 계약 테스트.
- Python 참조와 C/R/B/H/E 3,125개 조합 비교: 0 불일치. 실제 AI의 축 판정 검증과 구분한다.
- 정규화·스코프 변경·원문 해시, 응답 유실/재시도/재개, 수동 값·displayCorrection 보존, 허위 활성 표시 차단을 모의/격리 검증했다.
- 공식 웹 빌드: EXAM_EXPORT_PYTHON에 설치된 Python 런타임을 지정해 출력 계약 검사와 번들 성공. CU 0회, PDF 생성/운영 대기열 실행 0회.
- 과거 integrated-stability의 고정 release/stable.json 난이도 파일 해시는 이번 의도적인 난이도 계약 변경과 충돌했다. 기대 해시를 새 값으로 맞추지 않고, 실제 현재 모듈의 Node/브라우저 계산 일치와 교사 값 보존 검사로 교체했다. 운영 자산 해시는 canonical 배포 검사에서 별도 확인한다.
- 별도 과거 회귀 두 파일은 공식 기준 72b49cd와 수정 소스에서 동일하게 22 실패·1 취소였다. 주원인은 로컬 서버 fixture의 bank_source_upload_claim RPC 누락과 폐기된 +2 보정 기대값이다. 이번 범위에서 해당 과거 fixture나 업로드 동작을 수정하지 않았다.

## 입력·검토 자료

운영 원문/교사 값 백업과 이미지 바이트는 Git에 넣지 않는 `artifacts/difficulty-v12/`에 보관한다.
- `input-manifest.json`, `pilot-inputs.md`: 은행 22개 문항 ID/revision/review_version/입력 해시.
- `bank-input-backup.json`: 원래 운영 메타데이터·수동 값·원문 버전.
- `external-mapping.json`: 외부 8개 대상 번호와 제한. `expected-external.json`은 사후 검토 전용.
- `approval-request.md`: 실제 프롬프트 전문·schema·설정·추정 비용.
- `baseline-regression.txt`: 기준 소스의 기존 실패 기록.
