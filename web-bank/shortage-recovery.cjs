'use strict';
const B=require('../app/bank-exam-model.cjs'),S=require('../app/exam-scope-allocation.cjs'),sets=require('../app/question-sets.cjs');
const bands=['low','middle','high'];
const school=c=>c.metadata?.source?.school||'';
// Explicit recovery only. Scope/access/exclusions, format totals and complete sets remain hard constraints.
function recover(candidates,input,{mode='balanced',requiredIds=[]}={}){
 B.validateRules(input);
 if(input.profile?.driver==='target'){
  const result=B.selectQuestions(candidates,{...input,schoolMode:'flexible',supplementRequiredIds:requiredIds});
  if(!result.complete)return result;
  return {...result,rules:input,recovery:{mode,original:B.profileCounts(input.count,input.profile),actual:result.profileSummary.actual,schools:Object.fromEntries([...new Set(result.items.map(school))].map(s=>[s,result.items.filter(c=>school(c)===s).length])),approximate:!result.profileSummary.optimization.optimalWithinAllocation}};
 }
 const relaxed={...input,scopeDistribution:false,schoolMode:'flexible',profile:null,bins:[]};
 const inspection=B.inspectCandidates(candidates,relaxed),pool=sets.units(inspection.eligible,{strict:false}).flat();
 const fixedIds=new Set(requiredIds);
 for(const c of pool)if(fixedIds.has(c.question_id))for(const id of sets.members(c))fixedIds.add(id);
 const fixed=pool.filter(c=>fixedIds.has(c.question_id));
 if(fixed.length!==fixedIds.size)throw Error('선택한 보충 문항 또는 세트가 현재 시험범위·중복 제외 조건에 맞지 않습니다.');
 const types={...relaxed.types};for(const c of fixed){const type=B.responseType(c.metadata);if(Object.hasOwn(types,type))types[type]--;}
 if(fixed.length>input.count||Object.values(types).some(n=>n<0))throw Error('선택한 보충 문항이 요청 문항 수 또는 응답 형식 수를 초과합니다.');
 const remainder=input.count-fixed.length;
 const seed=remainder?B.selectQuestions(pool.filter(c=>!fixedIds.has(c.question_id)),{...relaxed,count:remainder,types}):{complete:true,items:[]};
 if(!seed.complete)return {...seed,diagnostics:inspection.diagnostics,reasons:inspection.reasons};
 let items=[...fixed,...seed.items];
 const original=input.profile?B.profileCounts(input.count,input.profile):null,chapters=S.scopeWeights(input.units),weight=chapters.reduce((n,g)=>n+g.weight,0);
 const schools=[...new Set(input.schools||[])],schoolTargets={};let left=input.count;
 for(const name of schools){schoolTargets[name]=input.schoolMode==='equal'?input.count/schools.length:Math.min(left,pool.filter(c=>school(c)===name).length);left-=schoolTargets[name];}
 const features=new Map(pool.map(c=>[c.question_id,{band:B.compositionBand(c),chapter:S.chapterFor(c,chapters),school:school(c),score:B.numericScore(c)??5}]));
 function cost(rows){
  const counts=Object.fromEntries(bands.map(b=>[b,0])),byChapter={},bySchool={};let total=0,unknown=0;
  for(const c of rows){const f=features.get(c.question_id),b=f.band;if(Object.hasOwn(counts,b))counts[b]++;else unknown++;byChapter[f.chapter]=(byChapter[f.chapter]||0)+1;bySchool[f.school]=(bySchool[f.school]||0)+1;total+=f.score;}
  return (original?bands.reduce((n,b)=>n+(counts[b]-original[b])**2,0):0)+unknown*input.count+
   (input.scopeDistribution&&weight?chapters.reduce((n,g)=>n+((byChapter[g.id]||0)-input.count*g.weight/weight)**2,0)+(byChapter.unassigned||0)*input.count:0)+
   schools.reduce((n,s)=>n+((bySchool[s]||0)-schoolTargets[s])**2,0)+(Number.isFinite(input.profile?.targetAverage)?(total/input.count-input.profile.targetAverage)**2:0);
 }
 // Same-size/format set exchanges improve the feasible seed without splitting a set.
 // Bounded local search: describe as approximation, never claim a global optimum.
 let work=0,limited=false;
 if(mode==='balanced'){
  const groups=sets.units(pool),signature=g=>[g.length,...Object.keys(input.types||{}).map(t=>g.filter(c=>B.responseType(c.metadata)===t).length)].join('|');
  let score=cost(items),improved=true;
  while(improved&&work<60000){improved=false;const used=new Set(items.map(c=>c.question_id));let best=null,bestScore=score;
   for(const out of sets.units(items)){if(out.some(c=>fixedIds.has(c.question_id)))continue;const key=signature(out),removed=new Set(out.map(c=>c.question_id));
    for(const add of groups){if(signature(add)!==key||add.some(c=>used.has(c.question_id)))continue;if(++work>60000){limited=true;break;}const next=items.filter(c=>!removed.has(c.question_id)).concat(add),value=cost(next);if(value<bestScore-1e-8){best=next;bestScore=value;}}
    if(limited)break;
   }if(best){items=best;score=bestScore;improved=true;}
  }
 }
 const check=B.selectQuestions(items,relaxed);if(!check.complete||!sets.complete(items)||items.length!==input.count)throw Error('보충 결과의 문항 수·응답 형식·세트 검증에 실패했습니다.');
 items=sets.ordered(items);const actual=Object.fromEntries(bands.map(b=>[b,items.filter(c=>B.compositionBand(c)===b).length])),scores=items.map(B.numericScore),actualAverage=scores.every(n=>n!==null)?scores.reduce((a,b)=>a+b,0)/scores.length:null;
 return {...check,items,diagnostics:inspection.diagnostics,reasons:inspection.reasons,rules:input,
  profileSummary:{requested:original||actual,actualAverage,targetAverage:input.profile?.targetAverage??5,assignment:Object.fromEntries(items.map(c=>[c.question_id,B.compositionBand(c)]))},
  recovery:{mode,original,actual,schools:Object.fromEntries([...new Set(items.map(school))].map(s=>[s,items.filter(c=>school(c)===s).length])),scope:chapters.map(g=>({title:g.title,count:items.filter(c=>S.chapterFor(c,chapters)===g.id).length})),approximate:mode==='balanced',searchLimitReached:limited,work}
 };
}
module.exports={recover};
