'use strict';
// Pure local validation. No subscription adapter, process launch or network.
const P=require('./profile.cjs'),Policy=require('./policy.cjs'),Run=require('./run.cjs');
function review(entry,byStage,answerReviews=[]){
 const selected=[],provenance=[],observations=[];
 const savedResponseFailures=byStage.flatMap((cs,i)=>cs.filter(c=>!c.result.raw||!c.result.evidence?.completed||c.result.evidence.failed||c.result.evidence.exitCode!==0).map(c=>({stage:i+1,file:c.file,hash:c.hash,reason:c.result.computed?.reason||'unconfirmed_response',errors:c.result.evidence?.errors||[]})));
 for(let n=1;n<=3;n++){
  const available=(byStage[n-1]||[]).filter(c=>c.result.raw&&c.result.evidence?.completed&&!c.result.evidence.failed&&c.result.evidence.exitCode===0);
  const evaluated=available.map(c=>{const answerReview=answerReviews.find(r=>r.file===c.file&&r.questionId===entry.questionId&&r.revisionId===entry.revisionId&&r.inputVersion===entry.input.inputVersion);return {...c,answerReview,evaluated:P.evaluate(c.result.raw,entry.validationContext,{answerReview})};});
  observations.push(...evaluated.map(c=>({stage:n,file:c.file,raw:c.result.raw,validation:c.evaluated.validation})));
  // Earliest now-valid response at this stage wins. Original/retry evidence stays
  // intact, and the ordinary Luna T3+ escalation rule still applies.
  const chosen=evaluated.find(c=>Policy.decide(3,c.evaluated).status==='complete')||evaluated.at(-1);
  if(!chosen)return {status:'unresolved',reason:'saved_response_missing',missingStage:n,observations,provenance,savedResponseFailures};
  selected.push(chosen.evaluated);provenance.push({stage:n,file:chosen.file,hash:chosen.hash,...(chosen.evaluated.validation.reason==='reviewed_answer_equivalence'?{answerReview:chosen.answerReview}:{})});
  const decision=Policy.decide(n,chosen.evaluated);
  if(!decision.next){const record=Run.finalRecord(entry,selected);return {status:record.final_status,reason:record.failure_reason,record,observations,provenance,savedResponseFailures};}
 }
 throw Error('unreachable saved validation state');
}
module.exports={review};
