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
 if((catalog.setCandidates||[catalog]).some(c=>next.variants.some(v=>v.paper?.items.some(i=>i.questionId===c.question_id&&i.revisionId!==c.revision_id))))throw Error('다른 시험지에 같은 문항의 다른 버전이 있습니다.');
 for(const v of affected){const index=v.paper.items.findIndex(i=>i.questionId===id),current=v.paper.items[index],rules=v.paper.rules;
  if((B.responseType({content:{responseType:current.responseType}})||B.responseType(current.catalogSnapshot?.metadata||{}))!==B.responseType(catalog.metadata))throw Error(v.label+'의 문항 형식과 같은 후보만 교체할 수 있습니다.');
  if((catalog.setCandidates||[catalog]).some(c=>rules.excludeIds?.includes(c.question_id)))throw Error('중복 제외한 회차의 문항입니다.');
  v.paper.items=R.createSession().replace(v.paper.items,index,catalog,rules);if(current.autoSlot!=null)v.paper.items[index].autoSlot=current.autoSlot;
  delete v.paper.layout;delete v.paper.scopeAllocation;require('./mock-auto-fill.cjs').report(v.paper);
 }
 const papers=next.variants.filter(v=>v.paper);
 next.sharing={distinct:new Set(papers.flatMap(v=>v.paper.items.map(i=>i.questionId))).size,total:papers.reduce((n,v)=>n+v.paper.items.length,0),optimal:false,method:'manual-shared-replacement'};
 return {document:next,affectedIds:affected.map(v=>v.id)};
}
function distribution(doc){
 const rows=inventory(doc),shared=new Set(rows.filter(r=>new Set(r.uses.map(u=>u.id)).size>1).map(r=>r.item.questionId));
 const variants=doc.variants.filter(v=>v.paper).map(v=>{
  const units=new Map();let common=0;
  for(const item of v.paper.items){if(shared.has(item.questionId)){common++;continue;}
   const c=item.catalogSnapshot?.metadata?.classification,unit=c?.confirmed?.primaryUnit||c?.primaryUnit||c?.suggested?.primaryUnit;
   const id=unit?.id||'unknown',row=units.get(id)||{id,name:unit?.name||null,count:0};row.count++;units.set(id,row);
  }
  return {id:v.id,label:v.label,total:v.paper.items.length,common,individual:v.paper.items.length-common,units:[...units.values()]};
 });
 return {shared:shared.size,total:variants.reduce((n,v)=>n+v.total,0),distinct:rows.length,variants};
}
module.exports={inventory,replace,distribution};
