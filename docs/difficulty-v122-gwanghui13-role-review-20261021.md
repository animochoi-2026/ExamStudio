# 광희중 2025 기말 13번 — 출처 역할 검토안

상태: **미승인·미적용**. 난이도 재평가, 정답·풀이 재검증 또는 역할 확정 결과가 아니다.

## 검토 대상

- question: `0063e7dd-5688-40e8-a86f-0b6ffcd2713a`
- revision: `0545124c-69f3-481f-9fe0-162c50f3f883`
- difficulty basis hash: `52ebcb77e1cfa494c39202ab30de8fea915838dbf544d2a3908a0c49f2480f68`
- source manifest hash: `e10ce5f9f01f9edf9ed011c9c5cf48049d9e0218db86657868e4249c5b3d645c`
- basis step: `basis_step_id:3671d64b78b487c3128b9ed343199a0bd961376f0455ab7b856c6a27161942db`
- 원천: `approved_routes.approved-main`, UTF-16 offset `[824,895)`
- 현재 허용 역할: `required_judgment`, `required_derivation`, `shared_premise`

현재 승인 풀이에 저장된 해당 구간:

> ① 38, ② 39, ③ 40, ④ 41은 모두 계산한 값 42와 다르므로 틀리다. ⑤ 42가 계산 결과와 일치하므로 정답이다.

이 구간 직전에는 요구한 식 `a+b+c=6+12+24=42`의 계산이 별도 구간으로 저장되어 있다. 이는 저장된 문구의 위치·구조 확인이며 계산의 재검증이 아니다.

모델은 이 구간을 `disc_option_match`, `step_kind=choice_check`, `role=answer_aggregation`으로 출력했다. 목표 결론은 이전 노드 `disc_total_expression`으로 연결되어 있다. 이것은 검토 대상인 모델 출력이며 역할을 승인하는 근거로 자동 채택하지 않는다.

## 검토 선택지

| 안 | 해석 | 확인할 사항 |
|---|---|---|
| A | 계산된 답을 선택지 번호와 연결하는 답 표시·취합 | 새로운 수학 판단 없이 이미 얻은 결과를 표시하는 구간인지 확인한다. 승인 시에만 해당 span의 `answer_aggregation` 주석을 검토한다. |
| B | 정답 도출 뒤의 선택적 검산·설명 | 오답 선택지 비교가 풀이에 필수적이지 않은 사후 확인인지 검토한다. 승인 시에만 `optional_illustration` 주석을 검토한다. |
| C | 필수적인 선택지 판단 | 실제로 정답 도출에 추가 판단이 필요한지 별도 확인한다. 계약 오류를 통과시키기 위한 필수 역할 전환은 하지 않는다. |

**검토 제안:** 앞의 수학적 결론 구간과 마지막 선택지 확인 구간을 분리해 A/B 중 어느 의미인지 먼저 확인한다. 둘이 혼재한다면 의미 승인 후에만 정확한 source span 분할안을 작성한다. 현재는 어느 안도 채택하지 않는다.

다음은 제안하지 않는다.

- `answer_aggregation`을 모든 일반 풀이 단계에 허용하는 전역 정규식 변경
- 모델 응답의 역할을 그대로 source manifest에 반영
- 구간 전체를 필수 발견으로 승격하거나 앞의 수학적 결론까지 제외
- 과거 점수·티어 또는 예상 점수를 사용한 역할 선택

## 현재 보존 상태

원문·정답·해설·이미지, 승인 basis·route, source registry, source review, projection 및 scorer를 변경하지 않았다. `reviewed_spans`나 역할 overlay를 추가하지 않았다. 원본 응답과 실패 기록도 보존했다.

역할이 나중에 승인되더라도 기존 manifest를 덮어쓰거나 중단된 batch를 새 hash로 재개하지 않는다. 별도 후보의 입력·출처 identity 및 검증 증거를 새로 만들어야 한다. 이 검토안은 실행 승인이나 운영 반영 승인이 아니다.
