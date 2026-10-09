'use strict';
// A local display/selection policy. AI and teacher source records remain intact.
const version='final-number-proof-plus2-v1';
const boundaries=Object.freeze({lowMax:3,highMin:8,killerMin:9});
const score=v=>{if(v===null||v===undefined||v==='')return null;const text=typeof v==='string'?v.trim():null,n=Number(v);if(typeof v!=='number'&&(typeof v!=='string'||!/^\d+(?:\.\d)?$/.test(text))||!Number.isFinite(n)||n<0||n>10||Math.abs(n*10-Math.round(n*10))>1e-8)throw Error('난이도는 0~10점, 소수 한 자리입니다.');return n;};
function composition(value){const n=score(value);return n===null?'unknown':n<=boundaries.lowMax?'low':n<boundaries.highMin?'middle':'high';}
function proofEvidence(c){
 const text=String(c.content?.body??c.body??'');
 // Require an explicit task in the printed question. A solution mentioning a
 // proof, response format or an AI type label alone never qualifies.
 const direct=text.match(/(?:증명|보이)(?:하여라|하시오|하세요|해\s*보|시오)|증명(?:하는|하[는라]|해라)\s*(?:과정|방법|것)|증명하라/);
 if(direct)return {kind:'construct',evidence:direct[0]};
 if(/증명|보이는\s*과정/.test(text)&&/(?:빈칸|빈\s*곳|들어갈|옳은|완성)/.test(text))return {kind:'complete',evidence:text.slice(0,220)};
 return null;
}
function adjustment(c,raw){const n=score(raw);if(n===null)return {version,rawScore:null,score:null,delta:0,evidence:null};const evidence=proofEvidence(c),result=evidence?Math.min(10,n+2):n;return {version,rawScore:n,score:result,delta:Math.round((result-n)*10)/10,evidence};}
function applied(c,raw){const n=score(raw),saved=c.metadata?.difficulty?.proofAdjustment;const valid=saved?.version===version&&saved.rawScore===n&&saved.evidence&&['construct','complete'].includes(saved.evidence.kind);return {version,rawScore:n,score:n===null?null:valid?Math.min(10,n+2):n,delta:n===null?0:valid?Math.round((Math.min(10,n+2)-n)*10)/10:0,evidence:valid?saved.evidence:null};}
// Only use after reassessment has verified unchanged question/revision/basis.
// Preserve explicitly verified printed-layout proof evidence (not only body regex).
function rebase(c,raw){const n=score(raw),old=score(c.metadata?.difficulty?.aiScore),saved=c.metadata?.difficulty?.proofAdjustment;
 if(n!==null&&saved?.version===version&&[old,n].includes(saved.rawScore)&&['construct','complete'].includes(saved.evidence?.kind)){const result=Math.min(10,n+2);return {...saved,rawScore:n,score:result,delta:Math.round((result-n)*10)/10};}
 return adjustment(c,raw);
}
const instructions='assessment.score와 score는 공통 루브릭의 AI 원점수만 반환하세요. 증명 유형의 고정 +2 보정은 앱이 검증 후 한 번 적용하므로 AI 응답에는 가산하지 마세요. 원래 증명 발견·추론 부담은 공통 루브릭으로 평가하되 고정 가산과 혼동하지 마세요. 교사 참고점수는 해당 유형의 비교 자료이며 전체 분포를 올리거나 복제하지 않습니다.';
module.exports={version,boundaries,score,composition,proofEvidence,adjustment,applied,rebase,instructions};
