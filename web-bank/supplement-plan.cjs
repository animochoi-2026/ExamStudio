'use strict';
const B=require('../app/bank-exam-model.cjs'),S=require('../app/exam-scope-allocation.cjs'),sets=require('../app/question-sets.cjs');
const bands=['low','middle','high'];
// Only explicit shortage recovery may transfer difficulty slots. Original
// questions, scores, format counts and scope remain authoritative.
function select(candidates,input){
 const ids=new Set(input.supplementRequiredIds||[]);
 if(!ids.size)return B.selectQuestions(candidates,input);
 const rules={...input},eligible=B.inspectCandidates(candidates,rules).eligible;
 const required=eligible.filter(c=>ids.has(c.question_id));
 if(required.length!==ids.size)throw Error('선택한 보충 문항이 현재 범위·형식·중복 조건에 맞지 않습니다. 다시 선택하세요.');
 if(required.length>rules.count)throw Error('선택한 보충 문항이 시험지 문항 수보다 많습니다.');
 const original=B.profileCounts(rules.count,rules.profile),available=Object.fromEntries(bands.map(k=>[k,eligible.filter(c=>B.compositionBand(c)===k).length]));
 const fixed=Object.fromEntries(bands.map(k=>[k,required.filter(c=>B.compositionBand(c)===k).length]));
 const deficit=Object.fromEntries(bands.map(k=>[k,Math.max(0,original[k]-available[k])]));
 const profiles=[];
 for(let low=Math.max(fixed.low,original.low-deficit.low);low<=Math.min(available.low,original.low+fixed.low);low++)
 for(let middle=Math.max(fixed.middle,original.middle-deficit.middle);middle<=Math.min(available.middle,original.middle+fixed.middle);middle++){
  const q={low,middle,high:rules.count-low-middle};
  if(q.high<Math.max(fixed.high,original.high-deficit.high)||q.high>Math.min(available.high,original.high+fixed.high))continue;
  const moved=bands.reduce((n,k)=>n+Math.max(0,q[k]-original[k]),0);
  if(moved<=required.length)profiles.push({q,moved});
 }
 profiles.sort((a,b)=>a.moved-b.moved||b.q.low-a.q.low||b.q.middle-a.q.middle);
 const groups=rules.scopeDistribution?S.scopeWeights(rules.units):[];
 const cell=c=>[B.compositionBand(c),B.responseType(c.metadata),groups.length>1?S.chapterFor(c,groups):''].join('|');
 for(const {q,moved}of profiles){
  const profile={...rules.profile,...Object.fromEntries(bands.map(k=>[k,q[k]*100/rules.count]))},nextRules={...rules,profile};
  const result=B.selectQuestions(eligible,nextRules);if(!result.complete)continue;
  const items=[...result.items];let ok=true;
  for(const c of required){if(items.some(x=>x.question_id===c.question_id))continue;
   const at=items.findIndex(x=>!ids.has(x.question_id)&&!sets.descriptor(x)&&cell(x)===cell(c));
   if(at<0){ok=false;break;}items[at]=c;
  }
  if(!ok||!sets.complete(items))continue;
  const check=B.selectQuestions(items,nextRules);if(!check.complete)continue;
  const scores=items.map(B.numericScore),actualAverage=scores.every(x=>x!==null)?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*100)/100:null;
  return {...result,items,schoolAllocation:check.schoolAllocation?{...check.schoolAllocation,manualSupplements:true,optimal:false}:undefined,diversity:B.diversitySummary(items,false),profileSummary:{...result.profileSummary,actualAverage,assignment:Object.fromEntries(items.map(c=>[c.question_id,B.compositionBand(c)]))},rules:nextRules,supplementAdjustment:{original,actual:q,transferred:moved,questionIds:[...ids]}};
 }
 throw Error('선택한 보충 문항을 모두 포함하면서 문항 수·객관식/서술형 수·시험범위를 맞출 수 없습니다. 후보를 다시 선택하세요. 기존 시험지는 유지됩니다.');
}
module.exports={select};
