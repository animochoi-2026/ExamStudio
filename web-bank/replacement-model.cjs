'use strict';
const clone=x=>structuredClone(x),sets=require('../app/question-sets.cjs'),model=require('../app/bank-exam-model.cjs');
const layoutKeys=['workspaceMm','breakBefore','originalPoints','points','originalNumber'];
function assertSingle(item){if(item.questionSet)throw Error('세트 문항은 개별 교체·복원할 수 없습니다. 이동·제외는 세트 단위로 처리합니다.');}
function noDuplicate(items,index,id,restore=false){if(items.some((x,i)=>i!==index&&x.questionId===id))throw Error(restore?'원본 문항이 현재 시험지의 다른 위치에 포함되어 있어 복원할 수 없습니다.':'선택한 문항이 현재 시험지의 다른 위치에 포함되어 있습니다.');}
function preserveLayout(content,current){const next=clone(content);for(const key of layoutKeys){if(Object.hasOwn(current,key))next[key]=clone(current[key]);else delete next[key];}return next;}
function replaceSet(items,index,catalog,rules){
 const current=items[index],ids=sets.members(current),first=items.findIndex(x=>x.questionId===ids[0]),candidates=catalog.setCandidates;
 if(sets.issues(items).length||!Array.isArray(candidates)||candidates.length!==ids.length||!sets.complete(candidates)||sets.units(candidates).length!==1)throw Error('같은 문항 수의 완전한 세트로 교체하세요.');
 const next=items.slice();for(let i=0;i<ids.length;i++){
  const old=items[first+i],c=candidates[i];
  if(model.responseType({content:{responseType:old.responseType}})!==model.responseType(c.metadata))throw Error('세트의 각 문항은 기존 객관식·서술형을 유지해야 합니다.');
  if(items.some(x=>x.questionId===c.question_id))throw Error('이미 포함된 세트 문항입니다.');
  const single={...old,questionSet:null},replacement=createSession().replace([single],0,{...c,questionSet:null},rules)[0];
  next[first+i]={...replacement,questionSet:clone(c.questionSet),...(old.autoSlot!=null?{autoSlot:old.autoSlot}:{})};
 }return next;
}
function createSession(){const originals=new Map();return {
 has:item=>originals.has(item.questionId),
 original:item=>clone(originals.get(item.questionId)),
 replace(items,index,catalog,rules={}){
  const current=items[index];if(!current)throw Error('교체할 문항이 변경되었습니다.');if(current.questionSet&&catalog.setCandidates)return replaceSet(items,index,catalog,rules);assertSingle(current);assertSingle(catalog);
  if(current.questionId===catalog.question_id)throw Error('현재 문항으로 교체할 수 없습니다.');noDuplicate(items,index,catalog.question_id);
  const fit=rules.units?.length?model.scopeFit({...catalog.metadata,classification:{...catalog.metadata?.classification,scopeEvidence:catalog.confirmed?.scopeEvidence??catalog.metadata?.classification?.scopeEvidence}},rules.units,rules.forbidden):{ok:true};
  if(!fit.ok)throw Error('현재 출제범위를 벗어나 교체할 수 없습니다. '+fit.reason);
  const next=preserveLayout({questionId:catalog.question_id,revisionId:catalog.revision_id,responseType:model.responseType(catalog.metadata),scoreSnapshot:model.numericScore(catalog),catalogSnapshot:clone(catalog),selectedSolutionId:fit.solutionId||null,solutionSnapshot:clone(fit.solution||null)},current);
  const original=originals.get(current.questionId)||clone(current);originals.delete(current.questionId);originals.set(next.questionId,original);
  return items.map((x,i)=>i===index?next:x);
 },
 restore(items,index){const current=items[index];assertSingle(current);const original=originals.get(current.questionId);if(!original)throw Error('복원할 원본이 없습니다.');noDuplicate(items,index,original.questionId,true);const next=preserveLayout(original,current);originals.delete(current.questionId);return items.map((x,i)=>i===index?next:x);},
 checkpoint:()=>clone([...originals]),rollback:checkpoint=>{originals.clear();for(const [k,v]of checkpoint)originals.set(k,v);},
 remove(items,index){const next=sets.remove(items,index),retained=new Set(next.map(x=>x.questionId));for(const id of originals.keys())if(!retained.has(id))originals.delete(id);return next;}
 };}
function searchRules(draft,{originalsOnly=false}={}){const r=draft.rules||{};return {schools:clone(r.schools||[]),units:clone(r.units||[]),forbidden:clone(r.forbidden||[]),excludeIds:clone(r.excludeIds||[]),unit:r.unit||null,type:r.type||null,originalsOnly};}
function reasons(c){return [c.sameType&&'같은 유형',c.sameUnit&&'같은 세부 단원',c.sameParent&&'같은 상위 단원',c.otherSchool&&'타학교'].filter(Boolean).join(' · ');}
module.exports={createSession,searchRules,reasons,preserveLayout};
