'use strict';
// Comparison data only. This module is never imported by input.cjs or prompt.json.
const expectations=[
 ['V1','1000038773_9_9xf4.png','20번','T5',9.8,[]],
 ['V2','1000038773_9_9xf4.png','21번','T4',8.9,['assembly']],
 ['V3','1000038773_9_9xf4.png','서답형1','T5',null,[],['피타고라스 정리 사용 금지']],
 ['V4','1000038773_9_9xf4.png','서답형2','T2',4.7,[]],
 ['V5','1000038779_10_78se.png','서술형3','T3',6.6,['literacy','execution']],
 ['V6','1000038784_11_9rgl.png','서술형4','T5',9.7,['literacy'],['모듈러 연산 사용 금지']],
 ['V7','1000038784_11_9rgl.png','서술형5','T2',4.7,[]],
 ['V8','1000038784_11_9rgl.png','서술형6','T2',4.7,[]]
].map(([id,file,target,tier,score,gates,restrictions=[]])=>({id,file,target,tier,score,gates,restrictions}));
function mapping(){return expectations.map(({id,file,target,restrictions})=>({id,file,target,restrictions,scope:'중2'}));}
function review(entries,manual){
 const externalChecks=expectations.map(x=>{const e=entries.find(e=>e.id===x.id),r=e?.state?.result,c=r?.computed,check=manual?.externalChecks?.[x.id];
  const mismatch=[];if(e?.state?.status!=='complete')mismatch.push('evaluation_failed');if(c?.problem_tier!==x.tier)mismatch.push('tier');
  if(x.gates.some(g=>!c?.promotions?.includes(g)))mismatch.push('gate');
  if(check?.scopeCompliant!==true||check?.evidenceReviewed!==true||!check?.note?.trim())mismatch.push('manual_scope_and_evidence_review');
  return {id:x.id,expectedTier:x.tier,computed:c||null,mismatch,representativeDelta:x.score!=null&&c?.score!=null?+(c.score-x.score).toFixed(1):null,analysisRequired:!!mismatch.length||x.score!=null&&Math.abs((c?.score??0)-x.score)>=1,review:check||null};});
 const bank=entries.filter(e=>e.questionId),bankChecks=bank.map(e=>({id:e.id,passed:e.state?.status==='complete'&&manual?.bankChecks?.[e.id]?.gatesAndScope===true&&!!manual?.bankChecks?.[e.id]?.note?.trim(),review:manual?.bankChecks?.[e.id]||null}));
 const passed=entries.length===30&&bank.length===22&&externalChecks.every(c=>!c.mismatch.length&&(!c.analysisRequired||c.review?.discrepancyResolved===true))&&bankChecks.every(c=>c.passed);
 return {passed,externalChecks,bankChecks};
}
module.exports={mapping,review,expectations};
