'use strict';
const M=require('./mock-exam-model.cjs'),B=require('../app/bank-exam-model.cjs'),S=require('../app/exam-scope-allocation.cjs'),sets=require('../app/question-sets.cjs');
const clone=x=>structuredClone(x);
function withSelection(document,targetIds,ids,rows=null){
 const doc=clone(document);
 for(const v of doc.variants)if(targetIds.includes(v.id)){
  const compatible=rows?B.inspectCandidates(rows,{...M.rulesFor(doc,v),schools:[]}).eligible.map(c=>c.question_id):ids;
  v.supplementIds=[...new Set([...(v.supplementIds||[]),...compatible])];
  if(rows)v.supplementRequiredIds=[...new Set([...(v.supplementRequiredIds||[]),...compatible])];
 }
 return doc;
}
function check({document,snapshot,targetIds,ids}){
 const doc=withSelection(document,targetIds,ids);
 return M.compose({document:doc,snapshot,targetIds,exactWork:0});
}
function plan({document,snapshot,targetIds}){
 const targets=document.variants.filter(v=>targetIds.includes(v.id));
 const known=new Set(targets.flatMap(v=>v.supplementIds||[]));
 const outside=snapshot.candidates.filter(c=>!M.baseCandidate(document,c));
 const base=check({document,snapshot,targetIds,ids:[]});
 if(base.complete)return {complete:true,requiredCount:0,suggestedIds:[],candidates:[],groups:[],failures:[]};
 // Start with the joint whole-bank plan, so a shared candidate absent from
 // each paper's independent recommendation is still considered.
 let ids=outside.map(c=>c.question_id);
 let full=check({document,snapshot,targetIds,ids});
 if(!full.complete)return {complete:false,requiredCount:null,suggestedIds:[],candidates:[],groups:[],failures:full.failures};
 const outsideIds=new Set(outside.map(c=>c.question_id));
 ids=[...new Set(full.updates.flatMap(u=>u.paper.items.map(i=>i.questionId)).filter(id=>outsideIds.has(id)))];
 // Remove redundant supplements across the WHOLE round, treating sets as units.
 // This is inclusion-minimal, not a claim of a global minimum on a large bank.
 const units=sets.units(snapshot.candidates,{strict:false}).map(group=>group.filter(c=>outsideIds.has(c.question_id))).filter(group=>group.length);
 for(const unit of units){const remove=new Set(unit.map(c=>c.question_id)),trial=ids.filter(id=>!remove.has(id));if(trial.length===ids.length)continue;const r=check({document,snapshot,targetIds,ids:trial});if(r.complete){ids=trial;full=r;}}
 full=check({document,snapshot,targetIds,ids});
 const byId=new Map(snapshot.candidates.map(c=>[c.question_id,c]));
 const key=(c,rules)=>[B.responseType(c.metadata),B.compositionBand(c),S.chapterFor(c,S.scopeWeights(rules.units))].join('|');
 const needs=targets.map(v=>{const rules=M.rulesFor(document,v,snapshot.excludeIds||[]),paper=full.updates.find(u=>u.id===v.id).paper;
  const selected=paper.items.filter(i=>ids.includes(i.questionId));
  return {id:v.id,label:v.label,rules,neededIds:selected.map(i=>i.questionId),keys:new Set(selected.map(i=>key(byId.get(i.questionId),rules)))};
 });
 const candidates=outside.flatMap(c=>{
  const applies=needs.filter(n=>n.keys.has(key(c,n.rules))&&B.inspectCandidates([c],{...n.rules,schools:[]}).eligible.length);
  return applies.length?[{...c,appliesTo:applies.map(n=>n.id),appliesLabels:applies.map(n=>n.label),origin:'선택 학교 밖 전체 문제은행'}]:[];
 });
 // An alternative set is selectable only when all of its members are eligible.
 const allowed=new Set(candidates.map(c=>c.question_id)),existing=new Set(snapshot.candidates.filter(c=>M.baseCandidate(document,c)||known.has(c.question_id)).map(c=>c.question_id));
 const available=candidates.filter(c=>{try{return sets.members(c).every(id=>allowed.has(id)||existing.has(id));}catch{return false;}}).map(c=>({...c,supplementMemberIds:sets.members(c).filter(id=>outsideIds.has(id))}));
 return {complete:true,requiredCount:ids.length,suggestedIds:ids,candidates:available,groups:needs.map(({id,label,neededIds})=>({id,label,neededIds})),failures:base.failures,method:'joint-feasibility-and-redundancy-removal'};
}
function selection(plan,selected,candidate){
 const members=candidate.supplementMemberIds||sets.members(candidate),next=new Set(selected);
 if(members.some(id=>next.has(id)))members.forEach(id=>next.delete(id));else members.forEach(id=>next.add(id));
 if(next.size>plan.requiredCount)throw Error(`추가 필요 ${plan.requiredCount}개까지만 선택할 수 있습니다.${members.length>1?' 이 후보는 '+members.length+'문항 세트입니다.':''}`);
 return next;
}
function failureMessage(plan){return plan.failures?.some(f=>f.failureKind==='search_limit'||f.searchLimitReached)
 ? '전체 문제은행의 후보는 조회했지만 배분 계산을 끝내지 못했습니다. 문항 부족으로 판정한 결과가 아닙니다.'
 : '전체 문제은행에서도 현재 조건을 충족하지 못합니다. 아래 시험지의 부족한 형식·단원·난이도를 확인해 주세요.';}
module.exports={plan,check,withSelection,selection,failureMessage};
