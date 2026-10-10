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
module.exports={loadSourceReview,orderReviewGroups};
