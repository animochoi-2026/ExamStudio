# 문제공방 난이도 평가 v1.2.1 통합 적용 요청서 (Codex 세션용)

> **이 문서 하나를 Codex 세션에 넣으면 구현·전체 재평가·데스크톱 적용에 필요한 지시와 스펙을 모두 확인할 수 있어야 한다.**
> 원본 `난이도-평가-v1.2-적용-요청서 (4).md`의 예시·앵커·공식·운영 규칙을 전부 보존하고,
> 후속 확정 요구와 정합성 수정사항을 통합한 단일 문서다.
>
> 단, V1–V8의 외부 이미지 판정은 해당 이미지 3개가 현재 Codex 세션에 실제로 첨부된 경우에만 실행한다.
> 이미지가 없더라도 구현·코드 테스트·전체 재평가는 중단하지 않는다.
>
> **✅ 최종 통합 확정 (2026-10-19)**
> - G_literacy +1 유지
> - G_literacy (d) 증명 형식 접근 부담 유지
> - M2/M3 보조선 경계 예시 유지
> - 난이도 전용 3단계 모델 정책: Luna/medium → Sol/medium → Sol/high
> - 문제풀이·해설 생성 모델과 난이도 평가 모델 완전 분리
> - 기존 자동 점수·과거 교사 수동 점수·과거 override는 신규 결과에 승계하지 않음
> - 기존 점수는 복구 전용 스냅샷만 남기고 AI 입력·보정·실패 fallback에 사용하지 않음
> - 전체 재평가는 이번 한 번만 수행하고 이후에는 실질적으로 변경된 문항만 재평가
> - 검증은 코드 수준으로 최소화하며 Computer Use는 필수적일 때도 사용자 사전 승인을 받은 뒤 최소 횟수만 사용

---
# Part 1. 작업 지시

## 1. 목적

새 난이도 평가 기준 v1.2.1을 구현하고 아래 두 곳에 동일하게 적용한다.

1. **데스크톱 앱**: 신규 문제 업로드 또는 실질적 문항 변경 시 v1.2.1로 난이도를 자동 평가한다.
2. **웹 문제은행**: 기존 문제 전체 약 1,300문제의 기존 자동 점수·과거 강사 수동 점수·override를 신규 결과로 교체하기 위해 전부 재평가한다.

이번 평가의 목적은 기존 점수에 맞추거나 분포를 보정하는 것이 아니다.
기존 평가를 AI 입력에 제공하지 않고 새 기준으로 가감 없이 1차 분류한 뒤, 사용자가 이후 이상한 문항만 직접 검수·조정할 수 있게 하는 것이다.

## 2. 모델 정책 분리

### 2.1 문제풀이·정답·해설 작성

- 데스크톱 앱에서 사용자가 선택한 기존 모델을 그대로 사용한다.
- 현재 설정인 GPT-6.1 Sol / high를 이번 난이도 평가 작업 때문에 변경하지 않는다.
- 기존 문제풀이·정답·해설 생성 흐름과 모델 선택 UI를 유지한다.

### 2.2 난이도 평가

난이도 평가는 데스크톱의 일반 모델 설정과 완전히 분리된 전용 정책을 사용한다.

- 1단계: Luna / medium
- 2단계: Sol / medium
- 3단계: Sol / high

문제풀이 모델을 바꿔도 난이도 정책이 바뀌면 안 되고, 난이도 정책을 바꿔도 문제풀이 모델이 바뀌면 안 된다.
개념적으로 다음 정책을 분리해 관리한다.

- `solution_generation_policy`
- `difficulty_evaluation_policy`

## 3. 난이도 평가 3단계 라우팅

문항 수 24개를 코드 고정값으로 사용하지 않는다.
시험지에 20문항이면 20문항, 25문항이면 25문항을 평가한다.
한 API 호출로 여러 문항을 묶지 않고 문항별 독립 호출을 사용한다.

### 3.1 1단계 — Luna / medium

대상:

- 모든 신규 문항
- 실질적으로 내용·이미지가 변경된 기존 문항
- 기존 문제은행 약 1,300문제 전체 재평가

아래를 모두 만족하는 **유효한 T0·T1·T2** 결과만 1단계에서 최종 확정한다.

- API 요청 성공
- Responses API 구조화 출력 JSON Schema 검증 통과
- `reference_student_match=true`
- `curriculum_scope` 판정 성공
- 독립 풀이와 `derived_answer` 생성 성공
- 저장 정답과의 검증 성공
- 교육과정 내 eligible viable route가 1개 이상 존재
- 모든 경로가 강력한 우회 도구 경로인 상태가 아님
- 결정론적 스코어러 계산 성공
- `score`와 `tier`가 null이 아님
- 필수 근거 필드 누락 없음
- discovery 그래프 검증 통과
- confidence 최소 기준 통과
- 이미지·도형 판독에 필요한 근거 확보

다음 중 하나라도 해당하면 Luna 결과가 T2 이하라도 확정하지 않고 2단계로 보낸다.

- API·네트워크 오류
- JSON 파싱·Schema 오류
- 저장 정답과 `derived_answer` 불일치
- viable route 없음
- 모든 경로가 `uses_powerful_tool=true`라 제외됨
- `reference_student_match=false`
- curriculum scope 판정 실패
- 필수 근거 누락
- confidence 미달
- 잘못된 discovery ID·depends_on 그래프
- 스코어러 예외
- 이미지·도형 판독 불명확

정상적으로 T3·T4·T5가 나온 문항도 2단계로 보낸다.

### 3.2 2단계 — Sol / medium

대상:

- 1단계 T3·T4·T5
- 1단계 실패
- 1단계 유효성 검사 실패

Luna의 최종 티어나 점수를 정답처럼 알려주지 않고 문제를 처음부터 독립적으로 재평가한다.
2단계가 정상 완료되면 Sol / medium 결과를 최종값으로 사용한다.

- Sol에서 T2 이하가 나와도 Sol 결과를 최종 확정
- Luna와 평균 금지
- Luna·Sol 투표 금지
- Luna가 높았다는 이유로 Sol 점수 상향 금지

2단계가 실패한 문항만 3단계로 보낸다.

### 3.3 3단계 — Sol / high

대상:

- 2단계 API 실패
- 2단계 JSON·Schema 실패
- 풀이·정답 검증 실패
- viable route 없음
- 모든 경로가 우회 경로로 제외됨
- 필수 근거 누락
- 스코어러 실패
- 정상 확정 불가

문제를 처음부터 독립적으로 평가한다.
3단계까지 실패하면 다음과 같이 저장한다.

- `score=null`
- `tier=null`
- `status="failed"`
- 기존 점수 fallback 금지
- 0점·T0·하 난이도 대체 금지

### 3.4 호출 횟수 의미

- 정상 T0·T1·T2: Luna 1회
- Luna T3 이상 또는 실패: Sol / medium까지 총 2회
- Sol / medium 실패: Sol / high까지 최대 3회

같은 단계의 동일 요청을 이유 없이 반복하지 않는다.
일시적 API 오류 재시도는 단계 호출과 구분해 기록한다.
`strict_calibration`은 전체 재평가에서 비활성화한다.

### 3.5 단계별 원시 결과와 최종 결과 저장

호출하지 않은 단계는 null로 유지한다.

- `stage1_model`
- `stage1_reasoning_effort`
- `stage1_raw_json`
- `stage1_calculated_tier`
- `stage1_calculated_score`
- `stage1_validation_result`
- `stage1_failure_reason`
- `stage2_model`
- `stage2_reasoning_effort`
- `stage2_raw_json`
- `stage2_calculated_tier`
- `stage2_calculated_score`
- `stage2_validation_result`
- `stage2_failure_reason`
- `stage3_model`
- `stage3_reasoning_effort`
- `stage3_raw_json`
- `stage3_calculated_tier`
- `stage3_calculated_score`
- `stage3_validation_result`
- `stage3_failure_reason`
- `final_stage`
- `final_model`
- `final_reasoning_effort`
- `final_score`
- `final_tier`
- `final_status`

Luna에서 T2 이하로 확정된 결과도 원시 결과를 보존해, 이후 이상 문항만 Sol로 선택 재평가할 수 있게 한다.

## 4. AI와 결정론적 스코어러의 역할

AI는 다음 원시 판정만 수행한다.

- 기준 학생·교육과정 범위
- 정규교과 내 viable routes
- `critical_discoveries`
- C·R·B·H
- `execution_load`
- `literacy_high`
- `execution_extreme`
- 독립 풀이와 `derived_answer`
- 짧은 판정 근거

AI는 최종 `tier`와 1.0~10.0 `score`를 결정하지 않는다.
최종 점수는 Part 2의 결정론적 스코어러가 계산해 덮어쓴다.

## 5. 데스크톱 앱 적용

- 신규 업로드 문항에 같은 v1.2.1 정책 적용
- 실제 내용 또는 이미지가 바뀐 문항만 재평가
- 동일 내용·동일 평가 입력 버전이면 저장 결과 재사용
- 문제풀이·해설 모델과 난이도 평가 모델 분리
- 기존 난이도 표시 UI 유지
- 향후 교사 조정 기능 유지
- 자동 평가이므로 업로드마다 별도 사용자 확인 게이트를 추가하지 않음
- 웹과 데스크톱이 동일 JSON Schema와 동일 스코어러 공통 모듈 사용

## 6. 기존 문제 전체 재평가와 점수 전환

### 6.1 복구 전용 스냅샷

전환 전에 1회 스냅샷을 만든다.

- 기존 자동 점수
- 기존 티어
- 기존 교사 수동 점수
- 기존 override
- 기존 점수 출처
- 문항 revision

스냅샷은 사고 복구 전용이다.
다음 용도로 사용하지 않는다.

- AI 입력
- 신규 점수 보정
- 실패 문항 fallback
- 운영 화면 점수
- 분포 맞춤

### 6.2 staging 평가

약 1,300문제의 신규 결과는 기존 활성 점수와 분리해 저장한다.
전체 작업 중 구 점수와 신 점수를 화면에서 혼합하지 않는다.

### 6.3 원자적 전환

다음 조건을 모두 통과하면 이 요청 자체를 최종 교체 승인으로 간주하고 신규 결과로 원자적 전환한다.

- 공통 시스템 오류 없음
- 결정론적 스코어러·acceptance test 통과
- 문항별 평가 작업 완료
- 실패율 5% 이하
- 신규 데이터 구조 검증 통과

전환 시:

- 기존 활성 자동 점수 제거
- 기존 활성 교사 수동 점수 제거
- 기존 활성 override 제거
- 신규 v1.2.1 성공 결과 활성화
- 실패 문항은 null·failed 유지
- 실패 문항의 과거 점수 복원 금지

조건을 통과하지 못하면 기존 점수를 먼저 삭제하지 않고 전환을 중단한다.

### 6.4 향후 교사 조정

과거 수동 조정 데이터는 신규 결과에 승계하지 않는다.
다만 사용자가 신규 결과를 본 뒤 직접 수정할 수 있는 교사 조정 기능은 유지한다.

권장 구조:

- `auto_score`
- `auto_tier`
- `auto_evaluation_id`
- `teacher_override_score`
- `teacher_override_reason`
- `teacher_override_by`
- `teacher_override_at`
- `teacher_override_active`
- `effective_score`
- `effective_score_source`

## 7. 전체 재평가 실행 순서

1. 2학기 기말고사 전체
2. 2학기 중간고사 전체
3. 1학기 기말고사 전체
4. 1학기 중간고사 전체

시험지 단위로 진행 상태를 기록한다.
중단 후 재개 시 완료 문항·완료 모델 단계를 재사용한다.
평가 중 문항 revision이 바뀌면 구 결과를 최신 문항에 적용하지 않는다.

문항별 오류는 failed로 기록하고 계속 진행한다.
다음 공통 장애만 전체 큐 일시정지 사유다.

- 인증 공통 실패
- 잘못된 모델 ID·설정
- JSON Schema의 반복적 공통 실패
- 스코어러 공통 버그
- 동일 시스템 오류 연속 발생
- 잘못된 프롬프트 배포

예상 소요 약 20.6시간은 기존 실측 기반 참고치이며 고정 약속이 아니다.

## 8. 결과 버전·재사용

다음을 저장한다.

- `spec_version`
- `spec_revision`
- `model_policy_version`
- `model`
- `reasoning_effort`
- `evaluation_stage`
- `attempt_number`
- `prompt_hash`
- `json_schema_hash`
- `scorer_code_hash`
- `normalizer_version`
- `question_revision_id`
- `question_content_hash`
- `image_asset_hash`
- `curriculum_scope`
- `anchor_set_version`
- `evaluation_run_id`
- `final_stage`
- `calibration_status`

다음이 모두 같을 때만 결과를 재사용한다.

- 문항 내용 해시
- 이미지 자산 해시
- prompt hash
- JSON Schema hash
- scorer code hash
- spec revision
- model policy version

축 원시 판정은 같고 스코어러 상수만 바뀐 경우 AI 재호출 없이 원시 JSON으로 재계산할 수 있게 한다.

### 8.1 중등·고등 calibration 상태

- 중등 문항은 현재 중등 앵커 세트를 사용한다.
- 고등 문항도 동일한 3단계 정책으로 새 점수를 생성한다.
- 중등 앵커를 고등 calibration 완료 근거로 사용하지 않는다.
- 고등 앵커가 아직 없으면 `calibration_status="provisional_no_high_school_anchor"`로 저장한다.
- 고등 결과는 중등과 분리해 보고한다.
- 추후 고등 앵커가 추가되면 고등 문항만 선택적으로 재평가할 수 있게 한다.
- 고등 문항도 기존 점수로 복귀하지 않는다.

## 9. 검증 최소화와 Computer Use 제한

검증 우선순위:

1. 정적 코드 확인
2. JSON Schema 검증
3. 스코어러 단위 테스트
4. 모델 라우팅 단위 테스트
5. 스냅샷·원자적 전환 테스트
6. acceptance test
7. 실제 전체 재평가

Computer Use와 브라우저 자동화는 원칙적으로 사용하지 않는다.
코드만으로 확인할 수 없는 필수 UI 동작이 있고 데이터 손상·배포 위험 때문에 꼭 필요하다고 판단해도, **먼저 사용자 승인을 받는다.**
승인받더라도 대표 화면 1곳·최소 횟수만 사용한다.

금지:

- 브라우저 E2E 전수 검사
- 모든 메뉴 직접 클릭
- PC·모바일·태블릿 전수 확인
- 스크린샷 대량 생성
- 기존 기능 전체 회귀 테스트
- 전체 1,300문제를 검증용으로 2회 이상 실행
- strict calibration 반복
- 앵커의 불필요한 반복 AI 호출

전체 재평가는 이번 한 번만 수행한다.
이후에는 실질적으로 내용·이미지가 변경된 문항만 재평가한다.

## 10. 실행 전 프롬프트 확인

실제 약 1,300문제 재평가를 시작하기 전에 다음 세 프롬프트를 사용자에게 한 번 보여준다.

- Luna / medium 1단계 프롬프트
- Sol / medium 2단계 프롬프트
- Sol / high 3단계 프롬프트

세 프롬프트는 같은 기준과 같은 JSON Schema를 사용한다.
단계별 차이는 모델과 reasoning effort뿐이다.

프롬프트 금지 정보:

- 기존 난이도 점수
- 기존 교사 수동 점수
- V1–V8 목표 점수
- 앵커 정답 점수 유도 문구
- 이전 단계의 티어를 정답처럼 알려주는 문구

승인된 프롬프트의 SHA-256을 `prompt_hash`로 고정한다.
사용자 승인 없이 프롬프트·스코어러 상수·라우팅 기준을 바꾸지 않는다.

## 11. 수동 평가 검증 세트 (참고용)

**검증 세트 구성** (파일럿 완료 후 참고용으로 유지):
- **외부 검증 8문항 (V1–V8)**: 아래 수동 목표와 비교. **판정 기준은 "티어 일치"로 단일화**
  (±1.0은 티어 일치와 거의 중복되므로 별도 기준으로 쓰지 않음).
  게이트 발동 여부와 풀이 제한 준수 여부도 확인.
- **나머지 22문항**: 별도 수동 목표 없음. 다음을 확인:
  - 입력 정규화 후 해시 동일성 (줄바꿈만 다른 동일 문제는 정규화하면 같은 해시 → 같은 입력으로 처리).
  - 승급 게이트 발동 목록과 한 줄 근거를 보고받아 선생님이 직접 확인
    (특히 G_literacy가 남발되지 않는지).
  - 독립 선지가 많은 문제 → assembly 미발동.
  - 의존 사슬이 긴 문제 → T5 판정 정확성.
- **버전 식별**: `spec_version="1.2"`는 표시용. 실제 결과 저장 시
  `spec_revision` (예: "1.2.5") 또는 평가 입력 해시를 함께 기록.
  서로 다른 기준으로 평가한 결과를 같은 버전으로 재사용하지 않는다.
  **프롬프트 본문의 해시도 평가 입력 버전에 포함** (§11 참조).

아래 8문제는 별도로 수동 평가된 검증 세트이다 (참고용).
GPT의 점수와 아래 수동 점수를 비교하고 차이를 리포트하라.
다음 중 하나라도 해당하면 원인을 분석하라:
- 점수 차이가 ±1.0 이상.
- 기대 티어와 실제 티어가 다름 (예: V1의 기대 T5가 T4로 나옴).
- 핵심 승급 게이트의 발동 여부가 다름.
- 허용 교육과정이나 풀이 경로 선택을 위반함 (예: V3에서 피타고라스 사용).

**주의**: 검증 문항의 목표 점수를 AI 입력에 넣지 않는다 (결과 유도 방지).
AI는 문제만 보고 독립적으로 판정해야 한다.

| # | 문제 | 수동 점수 | 티어 | 핵심 근거 |
|---|---|---|---|---|
| V1 | 20번 (이등변+외심·내심, 넓이조건) | 9.8 | T5 | 병목 M5 (공통 높이로 넓이→길이, C3R3B3H3 — 4/4 충족. 사용자 확인: 힌트 줘도 어려움) |
| V2 | 21번 (평행사변형+정사각형 2개) | 8.9 | T4 | 병목 M3 (△FAH≅△ABC) + G_assembly |
| V3 | 서답형1 (외심·내심, AC=20) | 9.5+ | T5 | 피타고라스 없이 평가. 쓰면 6.8. "9.5+"는 T5 등급을 의미 (정확히 9.5가 아니라 9.5 이상) |
| V4 | 서답형2 (정사각형, 합동) | 4.7 | T2 | 병목 M2 (넓이 상쇄) |
| V5 | 서술형3 (말판 게임, 36경우) | 4.6 | T2 | M0 + G_literacy(+1) + G_execution(+1) |
| V6 | 서술형4 (정오각형 주사위) | 8.6 | T4 | M3 (순환 패턴, 모듈러 없이) + G_literacy(+1) |
| V7 | 서술형5 (닮음, 넓이 30) | 4.7 | T2 | 병목 M2 (닮음비) |
| V8 | 서술형6 (유한소수, 110/230) | 4.7 | T2 | 병목 M2 (유한소수 판정) |

**목표값의 의미**: "수동 점수"는 해당 티어의 대표값이지 정확한 소수점 일치가 필수가 아님.
T5의 경우 9.5~10.0 범위 내면 통과. 단, 티어(T0~T5)는 반드시 일치해야 함.
V3의 "9.5+"는 "T5 (9.5 이상)"를 뜻함.

- 이미지 파일: `workspace/user/files/1000038773_9_9xf4.png` (V1–V4),
  `workspace/user/files/1000038779_10_78se.png` (V5),
  `workspace/user/files/1000038784_11_9rgl.png` (V6–V8).
- **문제은행 ID 없음 (사용자 확인 2026-10-17)**: 위 8문제는 문제은행에 등록되어 있지 않음.
  평가 시 사용자가 이미지 파일을 Codex 세션에 직접 업로드해야 한다.
  `이 절`의 "다중 문항 이미지 처리" 규칙(문항 번호 지정 개별 호출)을 따른다.
- V3(서답형1)는 피타고라스 정리를 사용하지 않는 풀이로 평가해야 9.5가 나온다
  (§2의 "강력한 도구에 대한 처리" 참조). GPT가 피타고라스를 써서 6점대로 나오면
  스코프/선호 규칙이 제대로 적용되지 않은 것이다.
- V6(서술형4)는 모듈러 연산을 사용하지 않는 풀이로 평가해야 8.6이 나온다.
  마찬가지로 스코프 준수 여부를 확인하라.
- **다중 문항 이미지 처리**: 1000038773_9_9xf4.png(V1–V4)와
  1000038784_11_9rgl.png(V6–V8)는 한 이미지 안에 여러 문제가 함께 들어 있다.
  문항별 독립 호출 원칙에 맞게, **프롬프트에 대상 문항 번호
  (예: "20번", "21번")를 명시해 개별 호출**한다.
  DB에 개별 문항 데이터가 이미 매핑되어 있다면 그것을 사용해도 된다.
  한 호출로 여러 문항을 묶어 평가하지 않는다.

## 12. 검증 세트 운용 보완

V1–V8 외 나머지 22문항에서는 다음을 확인한다.

- 줄바꿈만 다른 동일 문제는 입력 정규화 후 같은 해시로 처리
- 승급 게이트 목록과 한 줄 근거 기록
- G_literacy 남발 여부 확인 가능
- 독립 선지가 많은 문제에서 assembly 미발동
- 의존 사슬이 긴 문제에서 T5 판정 정확성

V1–V8 목표 점수는 AI 입력에 넣지 않는다.
이미지 3개가 현재 세션에 첨부된 경우에만 문항 번호를 지정해 개별 호출한다.
이미지가 없으면 해당 검증만 미실행으로 기록한다.

## 13. 완료 보고

간단히 다음을 보고한다.

- 전체 변경 파일 목록
- 문제풀이 모델과 난이도 모델 분리 방식
- 단계별 실제 호출 문항 수
- Luna T2 이하 확정 수
- Sol / medium 재평가 수
- Sol / high 재평가 수
- 최종 failed 수
- 복구 스냅샷과 기존 점수 처리 결과
- v1.2.1 활성 점수 전환 결과
- 스코어러·Schema 수정 파일
- acceptance test 통과·실패
- V1–V8을 실행한 경우 GPT 결과·수동 목표·티어 차이·±1.0 이상 차이 원인·게이트·scope 위반 분석
- 나머지 22문항 검증 기록
- 중등·고등 분리 분포
- T0~T5 분포
- assembly·literacy·execution 발동 수
- 기존 점수를 AI 입력에 사용하지 않았다는 확인
- 웹·데스크톱 공통 스코어러 확인
- 실제 AI 호출 총횟수
- Computer Use 사용 여부·사전 승인 여부·사용 횟수
- 기능을 막는 미구현 항목만 별도 표시

기존 분포에 맞춰 신규 점수를 사후 보정하지 않는다.

---

# Part 2. 구현 스펙 v1.2.1 (전문)

# 수학 문제 발상 난이도 평가기 — 구현 스펙 v1.2.1

> v1.2의 Insight Bottleneck Difficulty 구조를 유지하면서 모델 라우팅·정답 검증·스코어러 정합성·데이터 전환을 보완한 통합본이다.
>
> 유지 항목:
> - G_assembly +1
> - G_literacy +1
> - G_execution +1
> - OR 로직, 중첩 가능, T5 상한
> - C/R/B는 수학적 발견 난도, 서술 파싱은 G_literacy
> - M2/M3 보조선 경계 예시
> - V1–V8·H1~L2·K1~K6 예시와 앵커
>
> 정합성 수정:
> - 모든 powerful-tool 경로 제외 시 fallback 금지
> - 중간 M0·M1을 통한 assembly 연결 인정
> - 기본 T5에서도 base_tier·promotions 기록
> - 병렬 선지는 independent_branches max-pooling으로 통일
> - G_literacy (d)를 JSON Schema 설명에도 포함
> - derived_answer·solution validation 추가
> - 원시 AI JSON 불변 보존

## 0. 개요

- 목표: 해당 문항 과정의 수학 문제를 1.0~10.0점으로 평가한다.
- 기본 construct는 **발상 병목 난이도(Insight Bottleneck Difficulty)** 이며, 문해력 부하와 실행 부하를 독립 승급 게이트로 반영하는 복합 난이도다.
- T5에는 단일 발상벽, 강한 의존 사슬, 기본 T4+게이트, 기본 T3+복수 게이트가 포함될 수 있다.
- G_literacy 하나만으로 기본 T3가 T5가 되지 않는다.
- 최종 점수와 함께 `base_tier`, `promotions`, `promotion_tier_increase`, `promotion_capped`를 저장한다.
- 헌법 문장: **난이도는 정답 풀이를 읽었을 때 얼마나 복잡해 보이는지가 아니라, 정답 풀이를 모르는 상태에서 정답 경로로 들어가는 핵심 전환을 얼마나 발견하기 어려운가이다.**
- 짧은 풀이 ≠ 쉬운 문제 / 긴 풀이 ≠ 어려운 문제 / 발상 1개 ≠ 낮은 난이도 / 개념 5개 ≠ 발상 5개.

## 1. 기준 학생 (Reference Student) — 모든 평가에 고정

- 해당 문항이 속한 과정의 정규 교과과정을 다 배웠으나, **70% 정도 이해·기억**하는 상태.
  (중등 문항이면 중등 과정을, 고등 문항이면 고등 과정을 이수한 학생이 기준.
  문제은행에는 고등 과정 시험지도 올라오므로 중등으로만 한정하지 않는다.)
  **단, "대표 유형을 안다"는 정리·보조선의 사용법을 아는 것이지,
  이 문제에서 그것을 선택해야 한다고 스스로 떠올리는 것을 의미하지 않는다.**
  (Issue 6: 사용법을 아는 것과 선택을 떠올리는 것은 구분한다.
  유사 문제를 풀어봤을 것이라는 가정으로 발견 난이도를 낮추지 않는다.)
- 난이도가 오르면 계산 실수를 함. 단순 계산 실수도 난이도에 반영한다.
- 필수 조건이 3개 이상이면 앞에서부터 까먹거나 중간에 빼먹음.
- 그러나 문제에 직접 지시되지 않은 보조선·숨은 관계·새로운 표현·모델 전환·불변량을
  스스로 생성하는 능력은 상대적으로 약함.
- 경시대회 전용 테크닉은 모른다고 가정. 문제는 처음 보는 상태. 힌트 없음.
- **AI 자신의 풀이 능력을 기준으로 삼지 않는다.**
  GPT가 풀 수 있느냐가 아니라, 이 학생이 그 선택을 떠올릴 수 있느냐를 평가한다.

## 2. 교과과정 범위 고정 (Strict Curriculum Scope Lock)

- 평가 범위는 **문항이 속한 과정에 따라 결정**된다.
  중등 문항이면 중등 과정, 고등 문항이면 고등 과정이 기준이다.
  (문제은행에는 고등 과정 시험지도 올라오므로, 중등으로만 한정하지 않는다.)
- 금지: **해당 수준을 벗어난 상위 교육과정 도구**로 발상을 우회하는 풀이.
  - 예: 중등 도형 문항에서 좌표평면을 도입해 기하학적 통찰을 우회하는 풀이는 제외.
    (단, 좌표 자체가 문제의 주제이거나 우회가 아닌 경우는 허용.
    "좌표 사용"이라는 넓은 분류로 일괄 금지하지 않고, 실제 사용된 개념이
    허용 범위를 벗어나 핵심 발상을 우회하는지 개별 판단한다.)
  - 예: 고등 삼각함수(배각공식·사인법칙 등)를 중등 문항에 사용하는 것은 금지.
  - 예: 고등 문항에서는 그 수준을 벗어난 대학 과정 도구 사용 금지.
- 절차: 반드시 해당 수준의 도구만으로 된
  **학생 기준 정석 풀이(canonical student solution)** 를 먼저 구성한 뒤,
  그 풀이의 발상 난도를 평가한다.
- `curriculum_scope` 필드에 문항의 과정 수준을 기록한다 (예: `"중2"`, `"고1"`).

- **강력한 도구에 대한 처리 (금지가 아님 — 출제 의도 보존)**:
  피타고라스 정리·모듈러 연산 등 강력한 도구를 사용하지 않고도 풀 수 있다면,
  그 풀이를 기준으로 점수를 매긴다. 이는 해당 도구를 "금지"하는 것이 아니라,
  **문제가 의도한 핵심 발상을 평가하기 위해** 우회 경로를 제외하는 것이다.
  - 적용 범위: 해당 도구를 사용하면 문제의 핵심 통찰을 우회하게 되는 경우.
    (예: 서답형1은 피타고라스를 쓰면 내심·외심의 관계 파악이라는 핵심을 건너뛰게 됨.)
  - 적용하지 않는 경우: 도구 없이 푸는 것이 불가능하거나 비현실적인 경우,
    또는 도구를 써도 핵심 발상이 그대로 필요한 경우에는 도구 사용 풀이로 평가해도 된다.
  - 최종 점수의 의미: "출제 의도상 허용된 풀이 중 가장 쉬운 경로의 난이도".
    즉, 특정 발상을 평가하려는 문제에서는 그 발상을 우회하는 도구를 제외한 상태에서의 난이도다.
  - 좌표 사용 여부 같은 넓은 분류로 일괄 금지하지 않는다.
    실제 풀이에 사용된 개념이 허용 범위에 속하는지 개별 판단한다.
  (예: 서답형1은 피타고라스 없이도 풀 수는 있으나 매우 어려우므로 9.5로 평가한다.)
- **중요**: 강력한 도구 없이 풀 수 있는 문제는, 강력한 도구를 사용한 우회 경로를
  `viable_routes`에 포함하지 않는다.
  (min-over-paths가 저절로 쉬운 쪽을 선택해 버리는 것을 방지.
  예: 서답형1에서 피타고라스 사용 경로(6.8)를 제외하고 미사용 경로(9.5)만 평가.)
  부득이 포함해야 한다면 각 route에 `uses_powerful_tool: true` 플래그를 달고,
  §15 스코어러는 이 플래그가 있는 route를 min-over-paths 대상에서 제외한다.

## 3. 임계 발견 (critical_discovery)

- 정의: **현재까지 얻은 정보만으로 다음 행동이 거의 강제되지 않으며,
  여러 가능한 행동 중 특정 구조·관계·표현을 새로 선택해야만 풀이가 의미 있게 진전되는 전환.**
- 다음은 임계 발견으로 세지 않는다:
  - 정의의 직접 사용
  - 문제가 사실상 직접 호출하는 공식 대입
  - 앞 단계에서 자동으로 따라오는 계산
  - 같은 발상을 여러 선지에 반복 적용
  - 산술/대수 조작 낱개

- **발견 쪼개기 규칙** (§7b 조립 게이트 판정용):
  하나의 정리·사실로 한 번에 해결되는 단위를 하나의 발견으로 센다.
  같은 정리·사실의 단순 반복 적용은 하나로 합친다.
  계획을 세우는 것과 실행하는 것은 **새로운 비자동적 선택이 필요할 때만**
  별개의 발견으로 센다. 발견 이후 자동으로 이어지는 실행
  (예: 보조선을 떠올린 뒤 실제로 긋는 것, 닮음을 발견한 뒤 바로 닮음비를 계산하는 것)은
  같은 발견에 포함한다. 오직 새로운 판단·선택이 필요한 지점만 분리한다.

## 4. 평가 3축 + H (0~4점)

각 축은 아래 고정 메뉴에서 선택한다 (자유 서술 금지).

| 축 | 0점 | 1점 | 2점 | 3점 | 4점 |
|---|---|---|---|---|---|
| **C: 단서 희박성** | 사용할 방법이 사실상 직접 명시됨 | 전형적 키워드/배치가 즉시 촉발 | 간접적이지만 가까운 단서가 있음 | 단서가 약하거나 여러 조건에 흩어져 있음 | 직접 단서가 거의 없거나 표면이 다른 방향으로 유도 |
| **R: 표현 전환** | 직접 공식 대입/정의 사용 | 익숙한 두 사실의 표준 결합 | 명시되지 않은 관계를 찾아야 함 | 보조구조·재해석·숨은 도형 관계 도입 | 문제를 다른 모델·표현·불변량으로 재구성 |
| **B: 탐색 분기·막힘** | 다음 단계가 사실상 강제 | 1~2개의 매우 표준적인 후보 | 여러 정상 후보가 있으나 진행 신호 있음 | 여러 그럴듯한 접근이 있고 피드백이 약함 | 자연스러운 접근이 막히고 관점 전환/재출발 필요 |
| **H: 힌트 붕괴도** (게이트 전용) | 알려줘도 거의 안 쉬워짐 | 조금 쉬워짐 | 난점의 상당 부분 제거 | 주요 난점 대부분 제거 | 알려주면 이후가 거의 루틴 |

## 5. 루틴 게이트 (Routine Gate)

- `C ≤ 1 AND R ≤ 1 AND B ≤ 1` 이면 H가 아무리 높아도 **M0(루틴)** 으로 분류한다.
- "공식을 알려주면 문제가 끝난다"는 이유만으로 직접 공식 적용 문제를 고난도로 오판하는 것을 막는다.

## 6. Move 분류 (M0~M5)

루틴 게이트를 먼저 적용한다.

- **M0**: 루틴 게이트 통과.
- **M5 (단일 발상벽)**: `R≥3 AND C≥3 AND B≥2 AND H≥3` **네 조건 모두 충족**.
  (M5는 극히 예외적인 단일 통찰에만 부여. 3/4 완화 시 C3R3B3 수준도 M5가 되어
  M4가 사실상 소멸하므로, 4/4를 요구한다. V1(20번)은 C3R3B3H3으로 4/4 충족 → M5.)
- 그 외 `A = C + R + B` (H는 게이트 전용이므로 A에 포함하지 않음):
  - `A ≥ 8` → **M4**
    (조정 근거: 기존 `A≥9 AND H≥3`은 H를 M4 판정에 다시 끌어들여
    H의 역할(게이트 전용)과 충돌했음. A≥8로 단순화하여 H와 무관하게 M4를 판정한다.
    M5(4/4)와의 구분은 H≥3 여부로 명확히 갈린다.)
  - `A ≥ 6` → **M3**
  - `A ≥ 4` → **M2**
  - 그 외 → **M1**
- ⚠ 임계값(8/6/4)은 §16의 앵커 점수가 재현되도록 조정된 값이다.
  앵커 acceptance test를 통과하는 범위에서만 조정한다.
- **보조선 전형성 경계 예시** (M2/M3 판정 흔들림 방지, 2026-10-18 추가):
  - M2: 각의 이등분선에서 수선을 내려 합동 만들기 (신구중 4번 — DE 수선으로 △ABD≅△AED)
  - M3: 두 변을 연장해서 교점을 잡고 정삼각형 만들기 (신구중 16번 — BA·CD 연장해서 정삼각형 PAD)
  - 기준: 교과서 대표 유형으로 바로 연결되면 M2, 숨은 구조를 먼저 봐야 하면 M3.

## 7. 경로 등급 (Path Tier)

### 7a. 기본 tier 결정

한 풀이 경로에서:

1. M5가 하나라도 있으면 T5.
2. 서로 의존적인 M4가 2개 이상이면 T5.
3. 서로 의존적인 M3 이상 발견이 3개 이상이고 앞 발견이 다음 발견을 사실상 자동으로 알려주지 않으면 T5.
4. 그 외에는 가장 높은 Move class를 기본 tier로 사용한다.

- M4 → T4
- M3 → T3
- M2 → T2
- M1 → T1
- M0 → T0

의존의 의미는 앞 구조·결과를 발견하기 전에는 다음 발상의 필요성 자체를 정상적으로 인식하기 어려운 관계다.
아이디어를 단순히 많이 사용했다는 이유만으로 승급하지 않는다.

### 7b. 승급 게이트 (OR 로직)

기본 tier 결정 후 아래 게이트를 모두 독립적으로 확인한다.
각 게이트는 +1 tier이며 중첩 가능, T5 상한이다.
기본 T5라도 발동 사실을 `promotions`에 기록하되 실제 tier 상승량은 0일 수 있다.

#### G_assembly — 조립 부하 +1

가장 쉬운 viable 경로 안에 실제로 연결된 M2 이상 비자동적 발견이 3개 이상이면 발동한다.

- 전체 discovery 그래프를 만든 뒤 연결·전이적 도달 가능성을 계산한다.
- M2 이상 노드 사이에 M0·M1 단계가 끼어 있어도 실제 의존 경로가 이어지면 같은 조립 흐름이다.
- 독립 선지·독립 소문항의 발견을 합쳐 개수를 채우지 않는다.
- 소문항 간 실제 의존성이 있으면 `depends_on`으로 연결한다.

발동 검토 예시를 모두 유지한다.

- (2) `depends_on`으로 3개 이상이 사슬처럼 연결될 때. 중간에 쉬운 단계가 껴도 됨.
- (12) 중간 결과를 3개 이상 머릿속에 들고 있어야 다음 단계로 넘어갈 때.
- (13) “이걸 알려면 저걸 먼저 알아야 해”가 3단계 이상 깊이로 들어갈 때.
- (19) 풀이 중간에 관점을 바꿔야 하는 지점이 2번 이상 나올 때.
- (20) A→B→C→답 식으로 연쇄 추론이 3단계 이상일 때.
- (24) 서로 다른 단원의 개념을 3개 이상 가져와야 할 때.
- (30) 보조선을 그은 뒤 그 보조선에서 다시 새로운 관계를 찾아야 할 때.

적용 예: 1420, 1421, 1500.

#### G_literacy — 문해력 부하 +1

순수한 언어적·형식적·작업 기억 부담이 명백한 경우에만 발동한다.
수학적 관계·모델을 새로 발견해야 하는 어려움은 C/R/B에 넣고 중복 계산하지 않는다.

(a) 파싱

- 비표준적이거나 길고 복잡한 서술을 수학 구조로 옮기는 정리 자체가 버거운 경우
- 새로운 수학적 관계 발견이 필요하면 C/R/B
- 예: 1501의 비표준 주사위 게임 규칙

(b) 문자식 매칭

- 답을 문자식으로 정리해 선지와 매칭해야 함
- 자명하지 않은 변형이 필요함
- 단순 공식 대입 문자식은 제외
- 예: 1425의 EG+FH

(c) 작업 기억 과부하

- 독립 조건이 많고 상호 의존·비표준성이 커 실제 이해를 방해함
- 단순 4줄·조건 4개만으로 자동 발동 금지

(d) 증명 형식 접근 부담

- 증명 또는 증명 빈칸 형식 때문에 수학 내용과 별개로 기준 학생이 접근 자체를 어려워함
- 모든 증명 문제 자동 발동 금지
- 예: 신구중 5번

(a)(b)(c)(d) 중 하나라도 명백히 해당하면 발동하며 경계선에서는 false다.

사용자 선정 발동 검토 예시:

- (4) 푸는 데 꼭 필요한 조건이 3개 이상일 때.
- (5) 문제문이 4줄을 넘어 앞 내용을 다시 읽어야 할 때.
- (6) 답이 문자식이라 선지 매칭 과정에서 헤맬 때.
- (7) 일상 용어나 게임 규칙을 수학으로 번역하는 데 시간이 걸릴 때.
- (41) “단, ~는 제외한다” 같은 예외 조항이 2개 이상일 때.
- (45) 단위가 섞여 변환해야 할 때.
- (47) 문제 상황이 2개 이상의 시간대로 나뉠 때.

위 숫자는 자동 충분조건이 아니라 검토 신호다.
`literacy_evidence`에는 실제 문제문의 해당 부분을 짧게 인용하고 `literacy_evidence_type`에 a/b/c/d를 기록한다.
`literacy_high=true`인데 구체적 근거가 없으면 결과를 반려한다.

#### G_execution — 실행 부하 +1

경우 세기·계산이 매우 길고 실수 유발 가능성이 높아 꼼꼼한 실행 자체가 주요 난점인 EXTREME 경우만 발동한다.

사용자 선정 발동 검토 예시:

- (8) 경우의 수가 20개를 넘어 하나하나 세야 할 때.
- (9) 계산 과정이 5단계를 넘어 중간 실수 가능성이 높을 때.
- (15) 경우의 수를 표로 정리하지 않으면 헷갈릴 때.
- (23) 경우를 나열하다 빠뜨린 것이 있는지 처음부터 다시 세어야 할 때.
- (58) 정수 조건을 만족하는지 5개 이상 하나씩 대입해야 할 때.
- (59) 전개한 식을 다시 묶는 과정이 2번 이상 필요할 때.

예: 1500의 중복 숫자 처리.
`execution_extreme=true`인데 구체적인 `execution_evidence`가 없으면 결과를 반려한다.

C/R/B는 문제를 정확히 이해했다는 전제의 수학적 발견 난도만 평가한다.
G_literacy와 G_execution은 경계선에서 false를 유지한다.

## 8. 문제 등급 = min over viable paths

- 현실적으로 가능한 정규교과 풀이들 중 가장 쉬운 경로를 문제 난이도로 선택한다.
- 어려운 기발한 풀이가 있다는 이유로 쉬운 문제를 고난도로 만들지 않는다.
- 비현실적으로 긴 brute force, 교육과정 밖 고급 정리, 과도한 계산 우회법은 viable에서 제외한다.
- 1484 예시의 평행사변형 인식 루트와 각의 이등분선+닮음 루트가 모두 현실적이면 더 쉬운 쪽을 선택한다.
- `uses_powerful_tool=true` 경로는 min-over-paths 대상에서 제외한다.
- 모든 경로가 제외되면 점수를 만들지 않고 다음 모델 단계로 보낸다.

## 9. 병렬 분기 Max-Pooling

객관식 병렬 선지는 하나의 route 안에서 관리한다.

- 각 독립 선지를 `independent_branches`에 기록
- branch별 tier·score 계산
- 가장 어려운 branch를 max-pooling
- 여러 선지를 확인하는 전체 수고는 route의 `execution_load`에 반영
- 독립 branch들의 발견을 합쳐 G_assembly를 발동하지 않음
- 여러 대체 풀이 route 사이에는 기존대로 min-over-paths

AI가 가장 어려운 선지를 미리 하나만 골라 다른 정보를 버리게 하지 않고 코드가 결정론적으로 max-pooling한다.

## 10. 티어 구간

| 티어 | 점수 | 의미 |
|---|---|---|
| T0 | 1.0–2.0 | 정의·공식·대표 성질이 거의 직접 호출됨 |
| T1 | 2.1–3.8 | 몇 개의 뻔한 표준 방법 중 하나를 고르면 됨 |
| T2 | 3.9–5.8 | 알려진 사실을 한 번 비직접적으로 연결 (구조는 비교적 잘 보임) |
| T3 | 5.9–7.7 | 말하지 않은 관계나 보조구조를 스스로 발견해야 함 |
| T4 | 7.8–9.4 | 단서가 약하고 정상 탐색이 쉽게 진전되지 않으며 핵심 힌트가 난이도를 크게 붕괴시킴 |
| T5 | 9.5–10.0 | 표현을 근본적으로 바꾸는 단일 발상벽 또는 강한 발상들의 의존 사슬 |

- **절대로 단순 가중합 하나로 처음부터 1~10을 계산하지 않는다.
  먼저 tier를 결정하고, 그 다음 tier 내부 소수점을 결정한다.**

## 11. 소수점 계산 (⚠ calibration 상수)

- 임계 발견의 심각도: `S = (0.40·C + 0.35·R + 0.25·B) / 4` (H는 제외 — H는 게이트용)
- 실행량 `E` (0~4, 별도 평가. **티어를 올릴 수 없고 같은 티어 안에서만 반영**):
  - 0: 계산 거의 없음 / 1: 1~2회 단순 실행 / 2: 몇 단계 표준 계산 /
    3: 여러 계산 또는 여러 선지 확인 / 4: 긴 실행이지만 시험에서 현실적
- `T0`: `score = min(2.0, 1.0 + 0.6·S + 0.1·E)`
- `T1~T4`: tier 하한=L, 상한=U에 대해
  `score = L + (U−L) × (0.85·S + 0.15·(E/4))`, 해당 tier 범위로 clamp
- `T5 single-wall`: `score = 9.5 + 0.4·S`
- `T5 chain`: 사슬을 구성하는 주요 발견들의 S 평균을 사용,
  `score = 9.5 + 0.4·S_avg + 0.1`
- 승급 게이트(§7b)로 승급한 경우, 승급한 tier의 밴드에서
  병목 발견의 S로 소수점을 다시 계산한다.
  (승급한 티어의 하한 근처에 점수가 몰리지 않게 하기 위함.)
- 최종값은 10.0 이하로 clamp, 0.1 단위 반올림.
- ⚠ **가중치·계수·상수는 v0 추정치다. §17 acceptance test를 통과하는 범위에서만 조정한다.**

### calibration 상수 변경 제한

가중치·계수·임계값은 v0 추정치다.
고정 acceptance test를 통과하는 범위에서만 변경할 수 있다.
실제 분포를 보기 좋게 만들거나 기존 점수에 맞추기 위해 사후 조정하지 않는다.
사용자 승인 없이 상수를 변경해 전체 재평가를 재실행하지 않는다.


## 12. 판정 절차 (기본: 단일 호출)

모델에게 처음부터 "몇 점?"이라고 묻지 않는다. 아래 순서로 강제한다.

- **PASS A — 풀이 전 단서 판독** (점수 없음):
  문제에 직접 제시된 개념/정리, 기준 학생에게 즉시 떠오를 표준 접근,
  문제 표면이 특정 방법을 얼마나 암시하는지, 표준 접근이 막힐 지점,
  명시되지 않은 보조선/표현/모델이 필요할 가능성.
- **PASS B — 풀이 경로 탐색**: 문제를 정확히 풀고, 정규교과 내 현실적 경로 2~4개를 찾는다.
  장문의 chain-of-thought가 아니라 `route_summary` + `critical_discoveries` 목록만 반환.
  **단, §2의 강력한 도구 규칙에 따라 강력한 도구 없이 풀 수 있는 문제는
  강력한 도구를 사용한 우회 경로를 viable_routes에 포함하지 않는다.**
  (포함이 불가피하면 `uses_powerful_tool: true` 플래그를 단다.)
- **PASS C — 병목 판정**: A의 사전 단서와 B의 실제 발견을 비교해 C/R/B/H 부여 →
  §6~§8로 move/path/problem tier 판정.

- **기본 모드: 1회 API 호출**, 프롬프트 내 섹션 순서(A→B→C) 강제.
  (비용 기준: 문제당 기본 1회 호출을 원칙으로 한다.)
- `strict_calibration=true` 일 때만 패스별 분리 호출.
- 주의: PASS B를 본 뒤 PASS A의 단서를 소급해서 상향하지 않는다
  ("정답을 알고 나니 보이는 단서"는 단서가 아니다).

## 13. Fallback — 못 푸는 문제

다음이면 점수를 억지로 만들지 않는다.

- viable route 없음
- 모든 viable route가 powerful-tool 우회 경로라 제외됨
- 풀이·정답 검증 실패
- Schema·그래프 검증 실패

현재 단계 결과:

- `score=null`
- `tier=null`
- `confidence=0.0`
- 구체적인 `reason`
- 다음 모델 단계로 이동

Sol / high에서도 실패하면 최종 `status="failed"`다.
기존 점수·0점·T0·하 난이도로 대체하지 않는다.

## 14. 출력 JSON Schema

모델은 최종 점수·tier를 직접 작성하지 않는다.
Responses API의 구조화 출력 JSON Schema로 아래 원시 판정만 반환한다.
텍스트·이미지 입력을 모두 지원한다.
`temperature` 등 현재 모델에서 지원 여부가 확인되지 않은 옵션은 임의로 넣지 않는다.

```json
{
  "construct": "insight_bottleneck_difficulty",
  "spec_version": "1.2",
  "spec_revision": "1.2.1",
  "reference_student_match": true,
  "curriculum_scope": "중2",
  "derived_answer": "",
  "answer_type": "multiple_choice",
  "solution_validated": false,
  "answer_confidence": 0.0,
  "literacy_high": false,
  "literacy_evidence_type": "",
  "literacy_evidence": "",
  "pre_solution_cues": {
    "explicitly_cued_methods": [],
    "likely_initial_approaches": [],
    "likely_impasse": ""
  },
  "viable_routes": [
    {
      "route_id": "r1",
      "route_summary": "",
      "uses_powerful_tool": false,
      "execution_load": 0,
      "execution_extreme": false,
      "execution_evidence": "",
      "parallel_branch_count": 1,
      "independent_branches": [],
      "critical_discoveries": [
        {
          "id": "d1",
          "summary": "",
          "C": 0,
          "R": 0,
          "B": 0,
          "H": 0,
          "depends_on": [],
          "is_non_obvious": true,
          "clue_in_text": "",
          "must_construct": "",
          "hint_effect": ""
        }
      ]
    }
  ],
  "alternative_viable_routes_checked": 0,
  "key_hint": "",
  "estimated_post_hint_tier": "T0",
  "multiple_choice_execution_only": false,
  "confidence": 0.0,
  "short_reason": ""
}
```

### 필드 의미와 강제 규칙

- `derived_answer`: 모델이 저장 정답을 힌트로 받지 않고 독립적으로 구한 답.
- `answer_type`: `multiple_choice|numeric|expression|proof|descriptive|unknown`.
- `solution_validated`: 코드의 정답 검증 결과다. 모델이 true를 써도 코드가 다시 계산한다.
- `answer_confidence`: 풀이·답의 안정성.
- `confidence`: 평가 근거를 얼마나 안정적으로 확보했는지이며 학생 정답 확률이 아니다.
- `literacy_evidence_type`: a/b/c/d 중 하나. false이면 빈 문자열 가능.
- `literacy_high=true`: 문제문의 실제 해당 부분을 `literacy_evidence`에 짧게 인용해야 한다. 근거 없으면 반려.
- `execution_extreme=true`: 극단적인 실행량의 구체적 근거를 `execution_evidence`에 기록해야 한다. 근거 없으면 반려.
- `uses_powerful_tool`: 핵심 통찰을 우회하는 강력한 도구 경로 여부.
- `parallel_branch_count>1`: `independent_branches` max-pooling과 `multiple_choice_execution_only`를 확인하는 근거.
- `is_non_obvious=false`: T5 의존 사슬 길이에 포함하지 않는다.
- `id`: route 안에서 고유.
- `depends_on`: 실제 존재하는 앞 발견 ID만 허용.

AI가 작성하지 않거나 코드가 무시할 필드:

- `move_class`
- `base_tier`
- `path_tier`
- `problem_tier`
- `promotions`
- `promotion_tier_increase`
- `promotion_capped`
- `score`
- `selected_route_id`
- `single_insight_wall`

### 엄격 검증

- C/R/B/H: 0~4 정수
- execution_load: 0~4 정수
- 모든 boolean 필드는 실제 boolean
- route_id: 문항 안에서 고유
- discovery id: route 안에서 고유
- depends_on 대상 존재
- 자기 의존 금지
- 순환 의존 금지
- curriculum_scope 필수
- reference_student_match 필수
- uses_powerful_tool 필수
- is_non_obvious 필수

누락값을 임의 기본값으로 조용히 채우지 않는다.
유효하지 않은 결과는 현재 단계 실패로 처리한다.

## 15. 결정론적 스코어러 (Python 참고 구현)

Codex는 아래 의미를 리포지토리 언어·규약에 맞게 구현한다.
원시 AI 응답을 직접 변형하지 않고 계산용 깊은 복사본 또는 별도 결과 객체를 사용한다.

```python
from copy import deepcopy
from dataclasses import dataclass
from typing import Any

TIER_BANDS = {
    "T0": (1.0, 2.0),
    "T1": (2.1, 3.8),
    "T2": (3.9, 5.8),
    "T3": (5.9, 7.7),
    "T4": (7.8, 9.4),
    "T5": (9.5, 10.0),
}
MOVE_TO_TIER = {
    "M0": "T0", "M1": "T1", "M2": "T2",
    "M3": "T3", "M4": "T4", "M5": "T5",
}
TIER_ORDER = ["T0", "T1", "T2", "T3", "T4", "T5"]


def _require_int_0_4(value: Any, name: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 4:
        raise ValueError(f"{name}는 0~4 정수여야 함: {value!r}")
    return value


def _require_bool(value: Any, name: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"{name}는 boolean이어야 함: {value!r}")
    return value


def classify_move(c: int, r: int, b: int, h: int) -> str:
    c = _require_int_0_4(c, "C")
    r = _require_int_0_4(r, "R")
    b = _require_int_0_4(b, "B")
    h = _require_int_0_4(h, "H")
    if c <= 1 and r <= 1 and b <= 1:
        return "M0"
    if r >= 3 and c >= 3 and b >= 2 and h >= 3:
        return "M5"
    total = c + r + b
    if total >= 8:
        return "M4"
    if total >= 6:
        return "M3"
    if total >= 4:
        return "M2"
    return "M1"


def severity(discovery: dict[str, Any]) -> float:
    return (
        0.40 * _require_int_0_4(discovery["C"], "C")
        + 0.35 * _require_int_0_4(discovery["R"], "R")
        + 0.25 * _require_int_0_4(discovery["B"], "B")
    ) / 4.0


def validate_discovery_graph(discoveries: list[dict[str, Any]]) -> None:
    ids = [d.get("id") for d in discoveries]
    if any(not isinstance(did, str) or not did for did in ids):
        raise ValueError("모든 discovery에 비어 있지 않은 문자열 id가 필요함")
    if len(ids) != len(set(ids)):
        raise ValueError("중복 discovery id")
    id_set = set(ids)
    for d in discoveries:
        _require_int_0_4(d.get("C"), "C")
        _require_int_0_4(d.get("R"), "R")
        _require_int_0_4(d.get("B"), "B")
        _require_int_0_4(d.get("H"), "H")
        _require_bool(d.get("is_non_obvious"), "is_non_obvious")
        deps = d.get("depends_on")
        if not isinstance(deps, list) or any(not isinstance(x, str) for x in deps):
            raise ValueError("depends_on은 문자열 ID 목록이어야 함")
        if d["id"] in deps:
            raise ValueError("자기 자신 의존 금지")
        missing = set(deps) - id_set
        if missing:
            raise ValueError(f"존재하지 않는 depends_on: {sorted(missing)}")

    state: dict[str, int] = {did: 0 for did in ids}
    by_id = {d["id"]: d for d in discoveries}

    def visit(did: str) -> None:
        if state[did] == 1:
            raise ValueError("순환 의존 발견")
        if state[did] == 2:
            return
        state[did] = 1
        for dep in by_id[did]["depends_on"]:
            visit(dep)
        state[did] = 2

    for did in ids:
        visit(did)


def prepare_discoveries(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not raw:
        raw = [{
            "id": "synthetic_m0", "C": 0, "R": 0, "B": 0, "H": 0,
            "depends_on": [], "is_non_obvious": True,
        }]
    validate_discovery_graph(raw)
    prepared = deepcopy(raw)
    for d in prepared:
        d["move_class"] = classify_move(d["C"], d["R"], d["B"], d["H"])
    return prepared


def transitive_reachability(discoveries: list[dict[str, Any]]) -> dict[str, set[str]]:
    children = {d["id"]: set() for d in discoveries}
    for d in discoveries:
        for dep in d["depends_on"]:
            children[dep].add(d["id"])
    reachable = {did: set(children[did]) for did in children}
    changed = True
    while changed:
        changed = False
        for did in list(reachable):
            expanded = set(reachable[did])
            for nxt in list(reachable[did]):
                expanded |= reachable[nxt]
            if expanded != reachable[did]:
                reachable[did] = expanded
                changed = True
    return reachable


def max_target_chain(
    discoveries: list[dict[str, Any]],
    target_classes: set[str],
) -> tuple[int, set[str]]:
    by_id = {d["id"]: d for d in discoveries}
    reachable = transitive_reachability(discoveries)
    targets = [
        d["id"] for d in discoveries
        if d["move_class"] in target_classes and d["is_non_obvious"]
    ]
    memo: dict[str, tuple[int, set[str]]] = {}

    def longest_from(did: str, active: frozenset[str]) -> tuple[int, set[str]]:
        if did in active:
            raise ValueError("순환 의존")
        if did in memo:
            return memo[did]
        best = (1, {did})
        for nxt in targets:
            if nxt in reachable[did] and nxt not in active:
                length, members = longest_from(nxt, active | {did})
                candidate = (1 + length, {did} | members)
                if candidate[0] > best[0]:
                    best = candidate
        memo[did] = best
        return best

    answer = (0, set())
    for did in targets:
        candidate = longest_from(did, frozenset())
        if candidate[0] > answer[0]:
            answer = candidate
    return answer


def assembly_triggered(discoveries: list[dict[str, Any]]) -> bool:
    # 모든 발견을 이용해 연결 요소를 만든 뒤 각 요소의 M2+ 비자동 발견 수를 센다.
    undirected = {d["id"]: set() for d in discoveries}
    by_id = {d["id"]: d for d in discoveries}
    for d in discoveries:
        for dep in d["depends_on"]:
            undirected[d["id"]].add(dep)
            undirected[dep].add(d["id"])

    visited: set[str] = set()
    for start in undirected:
        if start in visited:
            continue
        stack = [start]
        component: set[str] = set()
        while stack:
            cur = stack.pop()
            if cur in visited:
                continue
            visited.add(cur)
            component.add(cur)
            stack.extend(undirected[cur] - visited)
        count = sum(
            1 for did in component
            if by_id[did]["move_class"] in {"M2", "M3", "M4", "M5"}
            and by_id[did]["is_non_obvious"]
        )
        if count >= 3:
            return True
    return False


def classify_path(
    raw_discoveries: list[dict[str, Any]],
    literacy_high: bool = False,
    execution_extreme: bool = False,
) -> tuple[str, dict[str, Any]]:
    literacy_high = _require_bool(literacy_high, "literacy_high")
    execution_extreme = _require_bool(execution_extreme, "execution_extreme")
    discoveries = prepare_discoveries(raw_discoveries)
    classes = [d["move_class"] for d in discoveries]
    by_id = {d["id"]: d for d in discoveries}

    base_trigger = "bottleneck"
    chain_s_avg = None

    if "M5" in classes:
        base_tier = "T5"
        base_trigger = "single_wall"
        chain_members: set[str] = set()
    else:
        m4_len, m4_ids = max_target_chain(discoveries, {"M4"})
        m3_len, m3_ids = max_target_chain(discoveries, {"M3", "M4", "M5"})
        if m4_len >= 2:
            base_tier = "T5"
            base_trigger = "dependent_chain"
            chain_members = m4_ids
        elif m3_len >= 3:
            base_tier = "T5"
            base_trigger = "dependent_chain"
            chain_members = m3_ids
        else:
            top_move = max(classes, key=lambda m: int(m[1]))
            base_tier = MOVE_TO_TIER[top_move]
            chain_members = set()

    dominant = max(
        discoveries,
        key=lambda d: (int(d["move_class"][1]), severity(d), d["id"]),
    )
    dominant_s = severity(dominant)

    if chain_members:
        chain_s_avg = sum(severity(by_id[x]) for x in chain_members) / len(chain_members)

    promotions: list[str] = []
    if assembly_triggered(discoveries):
        promotions.append("assembly")
    if literacy_high:
        promotions.append("literacy")
    if execution_extreme:
        promotions.append("execution")

    base_idx = TIER_ORDER.index(base_tier)
    requested_idx = base_idx + len(promotions)
    final_idx = min(5, requested_idx)
    final_tier = TIER_ORDER[final_idx]
    actual_increase = final_idx - base_idx

    return final_tier, {
        "base_tier": base_tier,
        "problem_tier": final_tier,
        "base_trigger": base_trigger,
        "trigger": base_trigger if not promotions else "promoted",
        "promotions": promotions,
        "promotion_tier_increase": actual_increase,
        "promotion_capped": requested_idx > 5,
        "dominant_s": dominant_s,
        "chain_s_avg": chain_s_avg,
        "chain_member_ids": sorted(chain_members),
        "calculated_discoveries": discoveries,
    }


def decimal_score(tier: str, s: float, e: int = 0, s_avg: float | None = None) -> float:
    if tier not in TIER_BANDS:
        raise ValueError(f"알 수 없는 tier: {tier}")
    e = _require_int_0_4(e, "execution_load")
    lo, hi = TIER_BANDS[tier]
    if tier == "T0":
        return round(min(2.0, 1.0 + 0.6 * s + 0.1 * e), 1)
    if tier == "T5":
        base = 9.5 + 0.4 * (s_avg if s_avg is not None else s)
        if s_avg is not None:
            base += 0.1
        return round(min(10.0, base), 1)
    raw = lo + (hi - lo) * (0.85 * s + 0.15 * (e / 4.0))
    return round(min(hi, max(lo, raw)), 1)


def validate_route(route: dict[str, Any]) -> None:
    if not isinstance(route.get("route_id"), str) or not route["route_id"]:
        raise ValueError("route_id 필요")
    _require_bool(route.get("uses_powerful_tool"), "uses_powerful_tool")
    _require_int_0_4(route.get("execution_load"), "execution_load")
    _require_bool(route.get("execution_extreme"), "execution_extreme")
    branches = route.get("independent_branches")
    if not isinstance(branches, list):
        raise ValueError("independent_branches는 목록")
    if branches:
        for branch in branches:
            if not isinstance(branch, dict):
                raise ValueError("branch는 객체")
            prepare_discoveries(branch.get("critical_discoveries", []))
    else:
        prepare_discoveries(route.get("critical_discoveries", []))


def score_problem(
    viable_routes: list[dict[str, Any]],
    literacy_high: bool = False,
) -> tuple[str | None, float | None, dict[str, Any]]:
    literacy_high = _require_bool(literacy_high, "literacy_high")
    if not viable_routes:
        return None, None, {"reason": "no_routes"}

    route_ids = [r.get("route_id") for r in viable_routes]
    if len(route_ids) != len(set(route_ids)):
        raise ValueError("중복 route_id")
    for route in viable_routes:
        validate_route(route)

    eligible = [r for r in viable_routes if not r["uses_powerful_tool"]]
    if not eligible:
        return None, None, {"reason": "no_curriculum_compliant_routes"}

    scored_routes: list[tuple[str, float, dict[str, Any], str]] = []
    for route in eligible:
        route_exec = route["execution_extreme"]
        route_e = route["execution_load"]
        branches = route["independent_branches"]

        if branches:
            branch_results: list[tuple[str, float, dict[str, Any], int]] = []
            for index, branch in enumerate(branches):
                tier, info = classify_path(
                    branch.get("critical_discoveries", []),
                    literacy_high=literacy_high,
                    execution_extreme=route_exec,
                )
                score = decimal_score(tier, info["dominant_s"], route_e, info["chain_s_avg"])
                branch_results.append((tier, score, info, index))
            # 독립 가지는 가장 어려운 것(max-pooling)
            tier, score, info, branch_index = max(
                branch_results,
                key=lambda x: (TIER_ORDER.index(x[0]), x[1], -x[3]),
            )
            info = deepcopy(info)
            info["selected_branch_index"] = branch_index
        else:
            tier, info = classify_path(
                route.get("critical_discoveries", []),
                literacy_high=literacy_high,
                execution_extreme=route_exec,
            )
            score = decimal_score(tier, info["dominant_s"], route_e, info["chain_s_avg"])

        scored_routes.append((tier, score, info, route["route_id"]))

    # 대체 풀이 경로 사이에는 가장 쉬운 것(min-over-paths)
    tier, score, info, route_id = min(
        scored_routes,
        key=lambda x: (TIER_ORDER.index(x[0]), x[1], x[3]),
    )
    out = deepcopy(info)
    out["selected_route_id"] = route_id
    return tier, score, out
```

문제 전체 tier는 eligible viable route 중 가장 쉬운 path tier다.
AI가 쓴 점수·tier 필드는 무시하고 이 코드 결과로 덮어쓴다.

## 16. 캘리브레이션 앵커 (8개 — 회귀 테스트용 고정)

| # | 문항 | C/R/B/H | E | 기대 범위 | 목표값 | 비고 |
|---|---|---|---|---|---|---|
| H1 | 1484 (내심+평행사변형+넓이비) | 3/3/3/3 | 2 | ≥ 9.5 | 9.8 | T5 single-wall (M5). 완화 게이트에서 chain→single-wall로 바뀜 |
| H2 | 1505 (줄 고리 확률 2/3) | 4/4/3/4 | 1 | ≥ 9.5 | 9.9 | T5 single-wall (M5) |
| M1 | 평행사변형 14번 (이등분선·GH) | 2/2/2/3 | 2 | 6.0–7.5 | 6.8 | T3 (M3). min-over-paths 예시: 이등분선 등거리 루트 채택 |
| M2 | 평행사변형 17번 (이등분선·수직) | 3/2/2/3 | 1 | 6.0–7.5 | 6.9 | T3 (M3) |
| M3 | 평행사변형 16번 (평행사변형 조건) | 2/2/1/2 | 1 | 2.5–5.0 | 4.7 | T2 (M2). M1/M2 경계 — 축 부여에 따라 변동 |
| M4 | 평행사변형 15번 (변 길이) | 1/1/0/– | 1 | ≤ 2.0 | 1.2 | T0 (루틴 게이트, H 무관) |
| L1 | 내심 ∠BIC=119° → ∠A | 1/1/0/– | 1 | ≤ 2.0 | 1.2 | T0 (루틴 게이트, H 무관) |
| L2 | 외심 둘레 14cm | 1/0/0/– | 0 | ≤ 2.0 | 1.1 | T0 (루틴 게이트, H 무관) |

- 앵커는 few-shot 암기용이 아니라 **어떤 구조가 고/저난도를 만드는지의 calibration 사례**로 사용한다.
- M3(16번)의 경계 특성은 스펙의 한계가 아니라 사실 그대로 둔다 (판정 분산의 실측치).
- 현재 앵커 8개는 전부 중등 문항이다. **고등 문항용 상·하 앵커는 추후 확보 필요**
  (고등은 scope lock 기준이 달라지므로 같은 앵커를 그대로 쓸 수 없다).

### 추가 검증 앵커 (킬러 교재 — 회귀 테스트용)

| # | 문항 | C/R/B/H | E | 기대 범위 | 목표값 | 비고 |
|---|---|---|---|---|---|---|
| K1 | 1417 (정삼각형+회전+150°) | 3/3/3/3 | 1 | ≥ 9.5 | 9.8 | T5 single-wall (M5). 병목=150° 각 소거. (2) 넓이=15cm² |
| K2 | 1421 (외심+중점+이등변) | 2/2/2/3 | 1 | 8.0–9.0 | 8.5 | T4 (G_assembly). 병목 M3 → +1 tier. 답 ③ 48°. 중등 풀이 필수 (scope lock) |
| K3 | 1420 (이등분선∩수직이등분선) | 3/2/2/2 | 2 | 8.0–9.0 | 8.7 | T4 (G_assembly). 병목=숨은 이등변 △EBC 발견 (M3, C3) → +1 tier. 답 ② 31cm |
| K4 | 1425 (마름모+수선, 문자식 답) | 2/2/2/3 | 2 | 8.0–9.0 | 8.6 | T4 (G_literacy-b, +1). 병목 M3 → +1 tier. 답 ⑤ EG+FH (문자식 선지 매칭) |
| K5 | 1500 (주머니 ab+cd=2) | 2/2/1/2 | 3 | 8.0–9.0 | 8.6 | T4 (G_assembly + G_execution). M2 3개 → T3, +1 → T4. 답 ② 7/64 |
| K6 | 1501 (비표준 주사위, A 우승) | 2/2/2/3 | 2 | 8.0–9.0 | 8.6 | T4 (G_literacy-a, +1). 병목 M3 (C2: A의 단순 분포가 조건화 암시) → +1 tier. 답 ① 17/72 |

## 17. Acceptance Tests

### 원본 테스트 유지

1. H1 ≥ 9.5
2. H2 ≥ 9.5
3. L1 ≤ 2.0
4. L2 ≤ 2.0
5. M1·M2가 6.0–7.5 밴드
6. L1 숫자 변경 119°→137°에도 구조가 같으면 ≤2.0
7. 옳지 않은 것을 고르시오형 병렬 5개념 문항이 개념 수 때문에 T4 이상이 되지 않음
8. 긴 루틴 계산형보다 짧은 R≥3 표현 전환형 H2가 높음
9. 어려운 좌표 풀이가 있어도 쉬운 정석 풀이가 있으면 점수 상승 없음
10. 비현실적 brute force를 쉬운 viable route로 채택하지 않음
11. K3 1420 ≥8.0, assembly 발동
12. K4 1425는 T4이고 promotions에 literacy
13. K5 1500 ≥8.0, assembly+execution 중첩
14. K6 1501은 T4이고 promotions에 literacy
15. 일반 문제는 literacy·execution 없이 승급하지 않음
16. 독립 선지 M3×3은 assembly 미발동
17. independent branches [T3,T5] → T5 max
18. viable routes [T3,T5] → T3 min
19. 대체 풀이 순서 변경에도 결과 동일
20. 발견 순서 변경에도 dominant_s 동일
21. 사슬 평균은 선택 사슬 구성원만 포함
22. 모든 경로 제외 또는 빈 경로 → null·reason
23. 빈 발견 목록과 M0 하나의 결과 동일
24. 선택되지 않은 경로의 execution_extreme은 최종 승급에 영향 없음
25. 구버전 조건이 Schema·스코어러·검증표에 남아 있지 않음

### v1.2.1 추가 테스트

26. Luna의 유효한 T2 → 1단계 최종 확정
27. Luna T3 → Sol / medium 호출
28. Luna T2지만 정답 불일치 → Sol / medium
29. Luna T2지만 필수 필드 누락 → Sol / medium
30. Luna T2지만 confidence 미달 → Sol / medium
31. Sol / medium 정상 T2 → Sol 결과 최종 확정
32. Sol / medium 정상 T5 → Sol 결과 최종 확정
33. Sol / medium 실패 → Sol / high
34. Sol / high 실패 → score=null, tier=null, failed
35. 단계 간 평균·투표 없음
36. 모든 powerful-tool 경로 제외 → 다음 단계
37. M2→M0→M2→M2 의존 흐름에서 assembly 발동 가능
38. 독립 branch M3×3은 assembly 미발동
39. 기본 T5에서도 base_tier와 실제 promotions 저장
40. literacy 조건 d가 프롬프트와 Schema에 존재
41. literacy_high=true + 근거 없음 → 반려
42. execution_extreme=true + 근거 없음 → 반려
43. 중복 discovery ID 반려
44. 존재하지 않는 depends_on 반려
45. 자기 의존 반려
46. 순환 의존 반려
47. 중복 route_id 반려
48. 필수 boolean 누락 시 임의 기본값 금지
49. 기존 점수·수동 override가 AI 입력에 없음
50. 전환 후 failed 문항에 기존 점수가 남지 않음
51. 향후 교사 override 기능은 동작
52. 문제풀이 모델 변경이 난이도 모델 정책에 영향 없음
53. 난이도 정책 변경이 문제풀이 모델에 영향 없음
54. stage1·stage2·stage3 원시 결과와 final_stage 저장
55. 문항 revision 변경 시 구 결과 재사용 금지
56. 줄바꿈만 다른 동일 문항은 정규화 해시 동일
57. 원시 AI JSON은 스코어러 실행 전후 동일
58. base T5 + literacy 발동 시 tier는 T5, promotions에는 literacy, 실제 상승량 0

## 18. 안정성 (Stability)

- 기본 라우팅은 문항별 1~3단계 호출이다.
- `strict_calibration=true`는 명시적 별도 캘리브레이션 작업에서만 허용한다.
- strict calibration에서는 같은 모델·같은 프롬프트로 3회 독립 실행한다.
- tier와 C/R/B/H의 중앙값을 사용해 deterministic scorer가 최종 점수를 재계산한다.
- 최종 score 자체를 투표하거나 평균 내지 않는다.
- 전체 1,300문항 재평가에서는 strict calibration을 사용하지 않는다.

## 19. 비용

- 저난도 정상 문항은 Luna / medium 1회.
- T3 이상 또는 1단계 실패만 Sol / medium 추가.
- 2단계 실패만 Sol / high 추가.
- strict calibration은 기본 비활성.
- 전체 재평가는 이번 한 번만 수행한다.
- 이후에는 실질적으로 내용·이미지가 변경된 문항만 재평가한다.

## 20. 모델·API 설정

### 문제풀이·해설

- 데스크톱 앱의 기존 사용자 선택 모델 사용
- 현재 GPT-6.1 Sol / high 유지

### 난이도 평가

- 1단계 Luna / medium
- 2단계 Sol / medium
- 3단계 Sol / high
- 실제 model ID는 프로젝트의 공식 매핑 사용
- Responses API 사용
- 구조화 출력 JSON Schema 강제
- 텍스트+이미지 입력 지원
- 지원 여부가 확인되지 않은 temperature 등의 옵션을 임의로 넣지 않음
- 각 단계 프롬프트는 같은 기준·Schema 사용
- 실행 전 사용자에게 세 프롬프트 제시·승인
- 승인 프롬프트 SHA-256을 `prompt_hash`로 저장

## 21. README 필수 기재

1. 이 점수는 실제 학생 집단의 정답률이 아니다.
2. '정규교과 70% 이해 + 계산 실수 + 조건 3개 이상 시 망각 + 발상 생성 취약'이라는
   특정 기준 학생에 대한 construct-based predicted difficulty다.
3. 실제 응시 데이터가 생기면 empirical difficulty를 별도로 저장하고,
   이후 발상 점수와 정답률의 관계를 보정할 수 있다.
4. concept count, solution length, arithmetic length를 insight difficulty와 동일시하지 않는다.

## 22. 완료 보고

구현 완료 후 간단히 다음을 보고한다.

- 전체 변경 파일 목록
- scoring algorithm 요약
- 문제풀이·난이도 모델 분리 방식
- 3단계 라우팅 구현
- §16 기본 앵커 8개 결과
- K1~K6 결과
- §17 acceptance test 결과
- V1~V8을 실행했다면 GPT 결과 vs 수동 점수·티어·게이트·scope 비교
- ±1.0 이상 차이의 원인
- 나머지 22문항 검증 결과
- 단계별 실제 호출 수
- 전체 재평가 tier 분포
- 기존 점수·수동 override 처리
- failed 문항 수
- README 반영
- Computer Use 사용 여부·사전 승인·횟수


---

# Part 3. 약 1,300문제 일괄 재평가 계획

## 1. 평가 순서

1순위: 2학기 기말고사 전체

2순위: 2학기 중간고사 전체

- 신동중·신구중이 기존 평가 완료 상태라도 신규 v1.2.1 대상이면 동일 정책 적용

3순위: 1학기 기말고사 전체

4순위: 1학기 중간고사 전체

## 2. 실행 방식

- 시험지 단위 진행
- 문항별 독립 호출
- Luna / medium → Sol / medium → Sol / high
- 결과는 staging 영역 저장
- 기존 점수는 마지막 원자적 전환 전까지 유지
- failed는 null로 기록
- 시험지 단위 진행 리포트
- 중단 후 완료 문항·단계 재사용
- 예상 소요 약 20.6시간은 참고치

## 3. 기존 점수 처리

- 기존 자동 점수·교사 점수·override를 복구 전용 스냅샷에 저장
- AI 입력·보정·fallback에는 사용하지 않음
- 전환 조건 통과 시 신규 성공 결과만 활성화
- failed는 기존 점수로 복귀하지 않음
- 선삭제 금지

## 4. 분포 보고

- 중등·고등 분리
- T0~T5 분포
- 기존 대비 tier 이동은 참고 리포트로만 제공
- 기존 분포에 맞춰 새 점수를 조정하지 않음
- assembly·literacy·execution 발동 수
- final stage별 문항 수


---

# Part 4. 데스크톱 앱 적용

## 1. 적용 범위

새 문제 등록과 실질적으로 내용·이미지가 변경된 문항에 v1.2.1 자동 평가를 적용한다.

- 1단계 Luna / medium
- 유효한 T2 이하 확정
- T3 이상 또는 실패는 Sol / medium
- 2단계 실패만 Sol / high
- 3단계 실패는 null·failed

## 2. 모델 정책 분리

- 문제풀이·해설은 데스크톱 앱 사용자 선택 모델
- 난이도 평가는 고정 3단계 전용 정책
- 두 정책이 서로 영향을 주지 않음

## 3. 스코어러 통합

- 웹 전체 재평가와 같은 JSON Schema
- 같은 deterministic scorer
- 같은 normalizer
- 같은 model policy version
- 공통 모듈 재사용

## 4. 재사용

- 동일 내용·이미지·평가 버전이면 저장 결과 재사용
- 문항 revision 또는 이미지 hash가 바뀌면 재평가
- 과거 수동 점수는 승계하지 않음

## 5. UI

- 기존 난이도 표시 유지
- 향후 교사 조정 기능 유지
- 자동 평가이므로 추가 확인 게이트 없음
- 단계별 모델 정보는 로그·관리 정보에서 확인 가능

## 6. 검증

- 코드 수준 라우팅 테스트
- scorer acceptance test
- 웹·데스크톱 공통 모듈 확인
- Computer Use는 원칙적으로 사용하지 않음


---

# Part 5. 원문 대비 누락·정합성 최종 점검표

아래는 원본 1,037줄과 이 통합본을 대조한 체크리스트다.

## A. 원문 내용 보존

- [x] 목적: 데스크톱 신규 업로드 + 웹 약 1,300문제 전체 재평가
- [x] 기존 점수 백업·별도 staging·원자적 전환·선삭제 금지
- [x] 시험지 실행 순서: 2학기 기말 → 2학기 중간 → 1학기 기말 → 1학기 중간
- [x] 문항별 실패 계속 진행 / 공통 장애 전체 일시정지
- [x] 재시도 최대 3회 원칙
- [x] 결과 버전·문항 revision·프롬프트 hash 기록
- [x] V1–V8 수동 검증 문항과 이미지 파일명·다중 문항 개별 호출 규칙
- [x] 나머지 22문항 검증 규칙
- [x] 기준 학생 전문
- [x] Strict Curriculum Scope Lock 전문
- [x] 피타고라스·모듈러 우회 예시
- [x] critical_discovery 정의와 발견 쪼개기 규칙
- [x] C·R·B·H 고정 메뉴
- [x] Routine Gate
- [x] Move M0~M5와 8/6/4 임계값
- [x] M2/M3 보조선 예시
- [x] 기본 Path Tier
- [x] G_assembly 예시 2·12·13·19·20·24·30
- [x] G_literacy a·b·c·d와 예시 4·5·6·7·41·45·47
- [x] G_execution 예시 8·9·15·23·58·59
- [x] min-over-paths와 1484 예시
- [x] 병렬 선지 max-pooling
- [x] T0~T5 구간
- [x] 소수점 공식·E 정의·T5 single/chain 공식
- [x] PASS A→B→C
- [x] PASS B 이후 PASS A 단서 소급 금지
- [x] Fallback score=null
- [x] JSON 필드와 근거 역할
- [x] `confidence`는 학생 정답 확률이 아니라 평가 근거 안정성
- [x] `is_non_obvious=false` 사슬 제외
- [x] 기본 앵커 H1·H2·M1~M4·L1·L2
- [x] 추가 앵커 K1~K6
- [x] 원본 acceptance test
- [x] strict calibration 3회·중앙값·score 투표 금지
- [x] Responses API·텍스트+이미지·JSON Schema
- [x] 지원 미확인 temperature 등 옵션 금지
- [x] 프롬프트 사전 승인·SHA-256
- [x] README 필수 4개 설명
- [x] 데스크톱 UI 변경 없음·교사 조정 유지·확인 게이트 없음
- [x] 전체 재평가 이번 한 번·이후 변경 문항만
- [x] 예상 20.6시간 참고치
- [x] 전체 변경 파일·앵커·수동 검증·분포 완료 보고

## B. 후속 사용자 요구 반영

- [x] 문제풀이 모델 Sol/high 유지
- [x] 난이도 전용 3단계 정책 분리
- [x] Luna 유효 T2 이하 확정
- [x] T3 이상만 Sol/medium
- [x] 2단계 실패만 Sol/high
- [x] 기존 자동·수동 점수 신규 결과에 승계하지 않음
- [x] failed 문항 기존 점수 fallback 금지
- [x] 향후 교사 조정 기능 유지
- [x] 기존 점수는 복구 스냅샷만 유지
- [x] Computer Use 최소화 및 사전 승인

## C. 정합성 오류 수정

- [x] powerful-tool 전부 제외 시 금지 경로 재활성 fallback 삭제
- [x] G_literacy (d)를 Schema 설명에 추가
- [x] G_assembly가 중간 M0·M1 연결을 인정
- [x] 기본 T5에서도 base_tier·promotions 기록
- [x] 병렬 선지 규칙을 independent_branches max-pooling으로 통일
- [x] T3+literacy 하나로 T5라는 구 문구 제거
- [x] derived_answer·solution validation 추가
- [x] discovery·route ID·depends_on·cycle 엄격 검증
- [x] 원시 AI JSON 변형 금지
- [x] 근거 없는 literacy/execution true 반려
- [x] calibration 상수 사후 조정 금지
- [x] 고등 문항 provisional calibration 상태 기록

## D. 의도적으로 변경한 원문 정책

- [x] 기존 “문제당 1회”를 1~3단계 라우팅으로 변경
- [x] 원문 §20의 Sol/high 단일 모델을 3단계 정책으로 교체
- [x] 실패 문항의 기존 운영 점수 유지 규칙을 null·failed로 변경
- [x] 별도 표본 승인 대기 대신 이 요청 자체를 조건부 원자적 전환 승인으로 사용
- [x] 병렬 선지 “가장 어려운 하나만 AI가 기록”을 모든 branch 기록+코드 max로 변경
- [x] “별도 파일 없이 문서만”은 구현 기준으로 유지하되 V1–V8 이미지 검증은 이미지 첨부 조건으로 명확화

## E. 최종 무누락 판정

- [x] 원본의 모든 제목·예시·앵커·공식·운영·검증·API·README 요구를 본문 또는 점검표에서 확인
- [x] 후속 사용자 요구를 반영
- [x] 앞선 리뷰에서 지적된 누락 14개를 모두 반영
- [x] 상충 규칙은 Part 2 v1.2.1 기준으로 단일화

이 점검표는 문서 작성 시점의 정적 대조 결과다.
실제 구현 리포지토리의 파일명·API model ID·DB 컬럼명은 Codex가 현재 코드 규약을 확인해 매핑해야 한다.

## F. 자동 대조 결과

- 원본 파일: 1,037줄
- 통합본: 1,706줄
- 필수 예시·앵커·운영 규칙·API 규칙·검증 규칙 86개 표식: 86/86 확인
- V1–V8 표 항목: 8/8 확인
- H1·H2·M1~M4·L1·L2 앵커: 8/8 확인
- K1~K6 추가 앵커: 6/6 확인
- G_assembly·G_literacy·G_execution 사용자 예시 번호: 전부 확인
- PASS A→B→C와 사후 단서 소급 금지: 확인
- Responses API·텍스트+이미지·구조화 출력·prompt hash: 확인
- README 필수 설명: 확인
- strict calibration 3회·중앙값·score 투표 금지: 확인
- 과거 충돌 문구 6종이 실제 운영 지시 본문에 남아 있지 않음: 확인
- 결정론적 스코어러 Python 참고 코드 구문 검사(AST): 통과
- Markdown 코드 펜스 짝: 정상

자동 대조는 문서 내용의 존재와 정합성을 확인한 것이다.
실제 리포지토리 구현 결과나 모델 출력의 정확성을 검증한 것은 아니다.
