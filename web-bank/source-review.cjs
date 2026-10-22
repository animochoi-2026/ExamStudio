'use strict';
const {orderSource}=require('./original-question.cjs');
function orderReviewGroups(rows){
 const groups=new Map();
 for(const row of rows){
  const s=row.metadata?.source||{},key=s.documentId||row.source_id||row.question_id;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(row);
 }
 return [...groups.values()].flatMap(orderSource);
}
// Fetch the complete exam before sorting: sorting each upload page separately
// can put question 1 after question 50. Cards and review navigation share this list.
async function loadSourceReview(rpc,spaceId,sourceId,isCurrent=()=>true){
 const all=[];
 for(let start=0;;start+=50){
  const page=await rpc('bank_source_questions',{s:spaceId,source_key:sourceId,start_at:start});
  if(!isCurrent())return null;
  all.push(...page);
  if(page.length<50)return orderSource(all);
 }
}
function uploadReviewReasons(row){
 if(row.visibility==='approved')return [];
 const m=row.metadata||{},r=m.reviews||{},reasons=[];
 if(row.revision_conflict)reasons.push('수정 버전 충돌');
 if(m.management?.disabled)reasons.push(m.management.disabledReason||'사용 중지 문항 확인');
 const recognition=r.recognition;
 if(recognition?.confirmed!==true){
  const ignored=new Set((recognition?.ignoredUncertainties||[]).map(x=>typeof x==='string'?x:x.id||x.text));
  for(const u of recognition?.uncertainties||[]){const text=typeof u==='string'?u:u.text||u.reason||u.message;if(text&&!ignored.has(typeof u==='string'?u:u.id||u.text))reasons.push(text);}
 }
 for(const [key,label]of [['answer','정답'],['solution','풀이'],['diagram','그림'],['scope','시험범위']]){
  const check=r[key];if(check&&(check.ok===false||check.passed===false||['failed','error','blocked','needs_review','needs_user_review'].includes(check.status)||check.errors?.length>0||check.geometry?.ok===false))reasons.push(label+' 확인 필요');
 }
 if(m.management?.review==='needs_user_review')reasons.push('사용자 확인 필요');
 return [...new Set(reasons)];
}
const needsUploadReview=row=>uploadReviewReasons(row).length>0;
module.exports={loadSourceReview,orderReviewGroups,uploadReviewReasons,needsUploadReview};
