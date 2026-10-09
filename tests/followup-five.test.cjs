'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../app/curriculum.js'),M=require('../app/bank-exam-model.cjs');
const unit='m2-6.3';
const evidence=()=>({confirmed:true,status:'confirmed',taxonomyVersion:C.version,conditionUnitIds:[unit],solutions:[{id:'s',verified:true,complete:true,unitIds:[unit],dependencyUnitIds:[],text:'원래 저장된 풀이'}]});
const candidate=(id,school='학교A',score=5)=>({question_id:id,revision_id:'r'+id,visibility:'approved',metadata:{source:{school},content:{responseType:'single_choice'},difficulty:{aiScore:score,criteriaVersion:require('../app/difficulty-assessment.cjs').version},classification:{taxonomyVersion:C.version}},confirmed:{scopeEvidence:evidence(),type:'출제유형'+id}});
const rules=extra=>({count:1,units:[unit],schools:[],status:'approved',profile:{low:0,middle:100,high:0,targetAverage:5},...extra});
test('scope-review boolean confirmed evidence is accepted without confusing it with nested classification',()=>{
 const c=candidate('a');assert.equal(M.selectQuestions([c],rules()).complete,true);assert.equal(M.scopeFit({classification:{confirmed:{...evidence(),confirmed:undefined},taxonomyVersion:C.version}},[unit]).ok,true);
 const result=M.selectQuestions([c],rules());assert.equal(result.items[0].selectedSolution.text,'원래 저장된 풀이');
});
test('unselected schools mean all; selected schools restrict; changing back after zero has no stale result',()=>{
 const data=[candidate('a','학교A'),candidate('b','학교B')];assert.equal(M.selectQuestions(data,rules({count:2})).items.length,2);
 assert.deepEqual(M.selectQuestions(data,rules({schools:['학교B']})).items.map(c=>c.question_id),['b']);
 assert.equal(M.selectQuestions(data,rules({schools:['학교C']})).eligible,0);assert.equal(M.selectQuestions(data,rules()).complete,true);
});
test('explicit scope, difficulty, format, stale evidence and exclusion constraints remain enforced',()=>{
 const cases=[['난이도 점수·구간 없음',c=>{c.metadata.difficulty.aiScore=null;}],['범위 정보',c=>{delete c.confirmed.scopeEvidence;c.metadata.analysis={status:'stale'};}],['저장된 조건',c=>{c.confirmed.scopeEvidence.conditionUnitIds=['m3-9.1'];}],['응답 형식',c=>{c.metadata.content.responseType='proof';},{types:{선택형:1}}],['기존 시험지',()=>{},{excludeIds:['a']}]];
 for(const [reason,change,extra]of cases){const c=candidate('a');change(c);const result=M.selectQuestions([c],rules(extra));assert.equal(result.complete,false,reason);if(reason==='응답 형식')assert.deepEqual(result.shortages,[{label:'선택형',requested:1,available:0,missing:1}]);else assert.ok(Object.keys(result.reasons).some(s=>s.includes(reason)),JSON.stringify(result.reasons));}
 assert.equal(M.selectQuestions([candidate('a')],rules({forbidden:[unit]})).complete,false);
});
test('independent diagnostics expose combined blockers instead of masking everything behind school',()=>{
 const c=candidate('a');c.metadata.difficulty.aiScore=null;c.metadata.analysis={status:'stale'};c.visibility='shared_pending';
 const r=M.selectQuestions([c],rules({schools:['다른학교']}));assert.equal(r.diagnostics.total,1);for(const label of ['학교','난이도'])assert.equal(r.diagnostics.checks.find(x=>x.label===label).failed,1);
});
test('photo ratio 0/51/49 requests five high-score questions; shortage is explicit, never relaxed',()=>{
 const data=Array.from({length:10},(_,i)=>candidate(String(i),i%2?'학교A':'학교B',i<5?5:8.5));const requested=rules({count:10,profile:{low:0,middle:51,high:49,targetAverage:6.7}});
 const result=M.selectQuestions(data,requested);assert.equal(result.items.length,10);assert.deepEqual(result.profileSummary.requested,{low:0,middle:5,high:5});
 const short=M.selectQuestions(data,{...requested,schools:['학교A']});assert.equal(short.items.length,0);assert.deepEqual(short.shortages.find(s=>s.label==='상'),{label:'상',requested:5,available:3,missing:2});
});
test('valid single constraints can still lack a joint combination and report it without filling with forbidden rows',()=>{
 const a=candidate('a','학교A',8.5),b=candidate('b','학교A',5);a.metadata.content.responseType='proof';
 const r=M.selectQuestions([a,b],rules({count:2,types:{선택형:2},profile:{low:0,middle:50,high:50,targetAverage:6.5}}));assert.equal(r.complete,false);assert.equal(r.items.length,0);assert.equal(r.eligible,2);assert.deepEqual(r.shortages.find(s=>s.label==='선택형'),{label:'선택형',requested:2,available:1,missing:1});
});
test('metadata-based verified solution is carried into output just like shared scope evidence',()=>{
 const c=candidate('a');c.metadata.classification=evidence();delete c.confirmed.scopeEvidence;const r=M.selectQuestions([c],rules());assert.equal(r.complete,true);assert.equal(r.items[0].selectedSolution.text,'원래 저장된 풀이');
});
