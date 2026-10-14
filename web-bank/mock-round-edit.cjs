'use strict';
const B=require('../app/bank-exam-model.cjs'),R=require('./replacement-model.cjs');
function inventory(doc){
 const rows=new Map();for(const v of doc.variants)for(const [index,item]of (v.paper?.items||[]).entries()){
  if(!rows.has(item.questionId))rows.set(item.questionId,{item,uses:[]});
  rows.get(item.questionId).uses.push({id:v.id,label:v.label,index:index+1});
 }return [...rows.values()];
}
function replace(doc,id,catalog){
 const next=structuredClone(doc),affected=next.variants.filter(v=>v.paper?.items.some(i=>i.questionId===id));
 if(!affected.length)throw Error('교체할 문항을 찾을 수 없습니다.');
 if(next.variants.some(v=>v.paper?.items.some(i=>i.questionId===catalog.question_id&&i.revisionId!==catalog.revision_id)))throw Error('다른 시험지에 같은 문항의 다른 버전이 있습니다.');
 for(const v of affected){const index=v.paper.items.findIndex(i=>i.questionId===id),current=v.paper.items[index],rules=v.paper.rules;
  if((B.responseType({content:{responseType:current.responseType}})||B.responseType(current.catalogSnapshot?.metadata||{}))!==B.responseType(catalog.metadata))throw Error(v.label+'의 문항 형식과 같은 후보만 교체할 수 있습니다.');
  if(rules.excludeIds?.includes(catalog.question_id))throw Error('중복 제외한 회차의 문항입니다.');
  v.paper.items=R.createSession().replace(v.paper.items,index,catalog,rules);if(current.autoSlot!=null)v.paper.items[index].autoSlot=current.autoSlot;
  delete v.paper.layout;delete v.paper.scopeAllocation;require('./mock-auto-fill.cjs').report(v.paper);
 }
 const papers=next.variants.filter(v=>v.paper);
 next.sharing={distinct:new Set(papers.flatMap(v=>v.paper.items.map(i=>i.questionId))).size,total:papers.reduce((n,v)=>n+v.paper.items.length,0),optimal:false,method:'manual-shared-replacement'};
 return {document:next,affectedIds:affected.map(v=>v.id)};
}
module.exports={inventory,replace};
