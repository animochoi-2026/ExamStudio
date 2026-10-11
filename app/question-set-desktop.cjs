'use strict';
const sets=require('./question-sets.cjs');
async function hydrate(bank,project){
 if(bank.storage.kind!=='shared'||!bank.auth.status().configured)return project;
 const known=[...Object.values(bank.state.items||{}),...Object.values(bank.state.bindings||{})];
 if(!project.problems.some(p=>sets.proposal(p)||[p.original,...(p.variants||[])].some(q=>q&&(q.questionSet||known.some(i=>i.localKey===project.id+':'+p.id+':'+q.id)))))return project;
 const registry=await bank.storage.rpc('bank_question_sets_get',{s:bank.auth.config().spaceId});
 for(const p of project.problems)for(const q of [p.original,...(p.variants||[])].filter(Boolean)){
  if(q.kind==='variant')continue;const item=bank.ensure(project,p,q),source=item.metadata?.source||{},g=registry.find(g=>g.source_document===source.documentId&&g.original_numbers.includes(String(source.originalNumber)));
  q.bankQuestionId=item.id;q.bankOriginalNumber=String(source.originalNumber||'');
  if(g)q.questionSet=structuredClone(g);else delete q.questionSet;
 }
 return project;
}
function targets(project,questionId){
 const rows=project.problems.flatMap(p=>[p.original,...(p.variants||[])].filter(Boolean).map(q=>({p,q}))),target=rows.find(x=>x.q.id===questionId);
 if(!target)throw Error('문항이 없습니다.');
 const g=sets.descriptor(target.q);if(!g)return [target];
 const ids=sets.members(target.q),result=ids.map(id=>rows.find(x=>x.q.bankQuestionId===id));
 if(result.some(x=>!x))throw Error('세트 짝 문항을 함께 불러온 뒤 선택하세요.');
 return result;
}
function forDocument(project,questions){
 for(const q of questions){const p=project.problems.find(p=>p.id===q.sourceId);if(p&&sets.proposal(p)&&!sets.descriptor(q))throw Error('공통 자료 세트를 등록 화면에서 확인한 뒤 출력하세요.');}
 const ordered=sets.ordered(questions.map(q=>({...q,questionId:q.bankQuestionId||q.id})));
 return ordered.map((q,i)=>{const g=sets.descriptor(q);if(!g)return q;const index=g.members.findIndex(x=>x.questionId===q.bankQuestionId);return sets.forPrint(q,g,{first:index===0,start:i-index+1,originalNumber:q.bankOriginalNumber});});
}
module.exports={hydrate,targets,forDocument};
