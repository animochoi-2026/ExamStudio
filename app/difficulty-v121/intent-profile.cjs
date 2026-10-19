'use strict';
const Base=require('./profile.cjs'),I=require('../difficulty-v12/input.cjs');
const id='difficulty-v1.2.1-intended';
const instructions=Base.instructions+`\n\n[사용자 승인 평가 정책: 출제 의도 인정, 2026-10-19]\n이번 평가는 원문 오류 탐지가 아니라 출제자가 의도한 풀이의 난이도를 측정한다. 원문 수치의 실현 불가능성, 문구 누락, 중복 선지가 있더라도 명시된 평가용 해석과 원문 조건을 형식적으로 적용하여 의도된 답을 도출할 수 있으면 그 답을 derived_answer에 적고 의도 풀이의 viable_routes를 반드시 작성한다. 모순이 없는 실제 도형의 존재 증명이나 원문 반례 탐색은 요구하지 않으며 그것을 발견 그래프·실행량·언어 부담에 더하지 않는다. 원문 문제점은 solution_summary의 별도 주의 문장으로 보존할 수 있지만, 그것만으로 source_ambiguity/solution_unresolved를 설정하거나 그래프를 비우지 않는다. 명시된 평가용 해석은 추가 풀이 힌트가 아니라 평가 대상 사건·대응·조건의 정의다. 실제 풀이 오류, 정답 계산 실패, 학습 범위 위반, 근거 없는 낮은 신뢰도는 그대로 실패 처리한다. 저장 정답·기존 점수·교사 기대치는 제공되지 않으므로 독립적으로 풀어야 한다.\n`;
const promptHash=I.hash(instructions),version=I.hash({baseVersion:Base.version,promptHash,policy:'intended-answer-20261019-1'});
function inputIdentity(e){return I.hash({version,baseIdentity:Base.inputIdentity(e)});}
// Kept separate from the baseline validator and historical profile version.
// Only a hash-bound, explicit local source review can move a source warning out
// of the blocking flags. Wrong answers, other flags and missing graphs still fail.
function evaluateReviewed(raw,context,review){
 if(review?.policy!=='intended-answer-20261019-1'||review.rawHash!==I.hash(raw)||review.contextHash!==I.hash(context)||!review.sourceSolutionHash||!review.rationale?.trim()||!review.authorization?.trim())throw Error('intended_review_integrity_required');
 const copy=structuredClone(raw);copy.assessment_uncertainty=copy.assessment_uncertainty.filter(x=>x!=='source_ambiguity');
 const r=Base.evaluate(copy,context);
 return {...r,raw:structuredClone(raw),sourceWarnings:[...raw.assessment_uncertainty],intentReviewHash:I.hash(review),validation:{...r.validation,...(r.validation.valid?{reason:'intended_answer_reviewed',sourceSoundnessCertified:false}:{})}};
}
module.exports={...Base,id,instructions,promptHash,version,inputIdentity,evaluateReviewed};
