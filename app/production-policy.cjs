'use strict';
const {randomInt}=require('node:crypto');
const rubricPolicy=`[상세 풀이와 6점 서술형 채점]
원문·유사문제·수정본 모두 하위권 학생도 따라갈 수 있도록 단계별 계산과 그 이유, 적용한 성질을 설명한다. 옳거나 그른 보기/선택지를 고르는 문항은 각 보기를 하나씩 판정하고, 틀린 보기에는 왜 틀렸는지와 올바른 설명 또는 반례를 명확히 적는다. 답 번호만 쓰지 않는다.
단계별 채점이 가능한 서술형(proof 또는 written_response)에만 validation.rubric에 총 6점의 단계별 채점기준을 작성한다. 각 단계에 수행 내용, 배점, 점수를 주는 조건, 부분점수 기준과 대안 풀이 인정 기준을 적는다. 단계 배점의 합은 정확히 6점이다. 객관식·단답형·옳고 그름 선택 문항은 rubric=null이며 채점 단계를 억지로 만들지 않는다. 실제 보류된 풀이 또는 풀이를 새로 작성하지 않는 재검수도 rubric=null이 가능하다. 모든 유형에 상세한 풀이와 이유를 작성한다. solution에는 완성된 교육용 해설을 적고 별도 채점표는 프로그램이 붙이므로 중복 작성하지 않는다.
객관식 선택지 참조는 ①②③④⑤처럼 원문 선택지 순서에 맞는 기호로 작성하고 correctChoiceIndices에 0부터 시작하는 정답 인덱스를 기록한다. 원문이 정답 두 개 이상을 요구하면 questionType=multiple_choice로 기록하고 요구한 개수만큼 인덱스를 적는다. single_choice는 원문이 정답 하나를 요구할 때만 사용한다. 단일 정답 유사문제의 선택지는 프로그램이 무작위 배치하며 참조도 함께 갱신한다.`;
function rubricText(r){
 if(!r)return '';
 return '\n\n[서술형 채점기준 · 총 6점]\n'+r.steps.map((s,i)=>`${i+1}단계 (${s.points}점): ${s.description}\n인정 기준: ${s.criteria}\n부분점수: ${s.partialCredit}`).join('\n')+'\n다른 올바른 풀이: '+r.alternatives;
}
function rubricErrors(r){
 if(!r)return ['6점 서술형 채점기준이 누락되었습니다.'];
 if(r.total!==6||!r.steps.length||r.steps.some(s=>!Number.isFinite(s.points)||s.points<=0)||Math.abs(r.steps.reduce((n,s)=>n+s.points,0)-6)>1e-8)return ['서술형 채점기준의 단계별 배점 합계가 6점이어야 합니다.'];
 return [];
}
function withRubric(solution,r){return String(solution||'').split('\n\n[서술형 채점기준')[0]+rubricText(r);}
function shuffleChoices(item,rng=randomInt){
 const q=item.question,n=q.choices.length;
 if(item.questionType!=='single_choice'||n<2||n>8||item.validation.correctChoiceIndices.length!==1||!Number.isInteger(item.validation.correctChoiceIndices[0])||item.validation.correctChoiceIndices[0]<0||item.validation.correctChoiceIndices[0]>=n)return null;
 const order=Array.from({length:n},(_,i)=>i);for(let i=n-1;i>0;i--){const j=rng(i+1);[order[i],order[j]]=[order[j],order[i]];}
 const oldToNew=order.map((_,i)=>order.indexOf(i)),symbols='①②③④⑤⑥⑦⑧';
 const remap=text=>String(text||'').replace(/[①②③④⑤⑥⑦⑧]|(?<!문제\s)(?<!\d)([1-8])\s*번/g,(m,d)=>{const i=d?Number(d)-1:symbols.indexOf(m);return i<n?(d?`${oldToNew[i]+1}번`:symbols[oldToNew[i]]):m;});
 q.choices=order.map(i=>q.choices[i].replace(/^\s*(?:[①②③④⑤⑥⑦⑧]\s*|\d+[.)]\s+)/,''));
 const correct=oldToNew[item.validation.correctChoiceIndices[0]];q.answer=`${symbols[correct]} ${q.choices[correct]}`;
 q.solution=remap(q.solution);require('./solution-guide.js').remap(q.solutionGuide,oldToNew,remap);item.validation.correctChoiceIndices=[correct];
 for(const k of ['evidence','unverified'])item.validation[k]=item.validation[k].map(remap);
 for(const k of ['forwardSolution','crossCheck'])item.validation[k]=remap(item.validation[k]);
 if(item.validation.rubric){for(const s of item.validation.rubric.steps)for(const k of ['description','criteria','partialCredit'])s[k]=remap(s[k]);item.validation.rubric.alternatives=remap(item.validation.rubric.alternatives);}
 return {order,oldToNew,correctIndex:correct};
}
const usesRubric=type=>['proof','written_response'].includes(type);
module.exports={rubricPolicy,rubricText,rubricErrors,withRubric,shuffleChoices,usesRubric};
