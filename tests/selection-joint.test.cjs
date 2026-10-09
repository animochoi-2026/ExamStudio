'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../app/bank-exam-model.cjs'),C=require('../app/curriculum.js');
const units=[...C.descendants('m2-u6'),...C.descendants('m2-u7')];
const row=(i,chapter,high,written,type)=>({question_id:'q'+i,revision_id:'r'+i,confirmed:{difficulty:high?8.3:5},metadata:{source:{grade:'중2'},classification:{primaryUnit:{id:chapter?'m2-7.1':'m2-6.1'},types:[{id:type,repeatKey:type}]},content:{responseType:written?'proof':'single_choice'}}});
test('joint chapter, difficulty, written and diversity choice agrees with exhaustive feasible selections',()=>{
 let seed=197;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
 for(let trial=0;trial<30;trial++){
  const data=Array.from({length:8},(_,i)=>row(i,i%2,random()<.5,random()<.5,'t'+Math.floor(random()*4)));
  let minimum=Infinity;for(let mask=0;mask<256;mask++){const chosen=data.filter((_,i)=>mask>>i&1);if(chosen.length!==4||chosen.filter(c=>M.compositionBand(c)==='high').length!==2||chosen.filter(c=>M.responseType(c.metadata)==='서술형').length!==2)continue;
   const groups=[chosen.filter(c=>c.metadata.classification.primaryUnit.id==='m2-6.1'),chosen.filter(c=>c.metadata.classification.primaryUnit.id==='m2-7.1')];if(groups.some(g=>g.length!==2||g.filter(c=>M.responseType(c.metadata)==='서술형').length!==1))continue;minimum=Math.min(minimum,M.diversitySummary(chosen).repeated);
  }
  const result=M.selectQuestions(data,{count:4,units,profile:{low:0,middle:50,high:50,targetAverage:6.5},types:{서술형:2},scopeDistribution:true});
  assert.equal(result.complete,Number.isFinite(minimum),'feasibility '+trial);if(result.complete){assert.equal(result.diversity.repeated,minimum,'repeat '+trial);assert.deepEqual(result.scopeAllocation.groups.map(g=>g.count),[2,2]);assert.deepEqual(result.scopeAllocation.groups.map(g=>g.writtenCount),[1,1]);}
 }
});
test('equal rounding alternatives do not lock in an avoidable type repeat',()=>{
 const data=[row(0,0,false,false,'x'),row(1,0,false,false,'x'),row(2,1,false,false,'y'),row(3,1,false,false,'z')];
 const result=M.selectQuestions(data,{count:3,units,scopeDistribution:true});assert(result.complete);assert.equal(result.diversity.repeated,0);assert.deepEqual(result.scopeAllocation.groups.map(g=>g.count),[1,2]);
});
test('candidate shortage cannot silently change exact range weight; search failure is distinguished',async()=>{
 const data=[...Array.from({length:8},(_,i)=>row(i,0,false,false,'t'+i)),row(8,1,false,false,'t8')];
 const rules={count:4,units,scopeDistribution:true},result=M.selectQuestions(data,rules);assert.equal(result.complete,false);assert.equal(result.items.length,0);assert.deepEqual(result.shortages,[{label:'사각형의 성질 범위 비중',requested:2,available:1,missing:1}]);
 const limit=M.selectQuestions(data,{...rules,scopeSearchBudget:{work:0}});assert.equal(limit.failureKind,'search_limit');const {compositionFailureText}=await import('../web-bank/composition-summary.js');assert.match(compositionFailureText(limit),/부족으로 판정하지 않았/);
});
test('elementary and high primary units stay exact; prerequisite permission never admits other questions',()=>{
 for(const selected of ['e5-2.2','e6-4.2','h1-common1-1.2','h2-algebra-2.1','h3-calculus2-1.1']){
  const leaf=C.leaves.find(n=>n.id===selected),inside=row(0,0,false,false,'a'),outside=row(1,0,false,false,'b');inside.metadata.source.grade=leaf.grade;inside.metadata.classification.primaryUnit={id:selected};
  const r=M.selectQuestions([inside,outside],{count:1,units:[selected]});assert(r.complete);assert.deepEqual(r.items.map(x=>x.question_id),['q0']);
 }
});
