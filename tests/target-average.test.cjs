'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),B=require('../app/bank-exam-model.cjs'),M=require('../web-bank/mock-exam-model.cjs'),A=require('../web-bank/mock-auto-fill.cjs'),sets=require('../app/question-sets.cjs');
const row=(id,score,{school='지정중',unit='m2-8.7',type='선택형'}={})=>({question_id:id,revision_id:'r-'+id,metadata:{source:{kind:'학교기출',school,grade:'중2'},classification:{primaryUnit:{id:unit}},content:{responseType:type}},confirmed:{difficulty:score}});
const rules=(n=2,target=7)=>({count:n,units:['m2-8.7'],schools:['지정중'],schoolMode:'priority',types:{선택형:n,서술형:0},profile:{...B.profileForTarget(target),targetAverage:target,driver:'target'},scopeDistribution:true});
const average=items=>items.reduce((s,c)=>s+B.numericScore(c),0)/items.length;
function doc(n=2,variants=1){const d=M.create('test');d.schools=['지정중'];d.profile=rules().profile;d.counts.A={choice:n,written:0,choicePoints:4};for(let i=0;i<variants;i++){M.addVariant(d,'A','v'+i);d.variants.at(-1).units=['m2-8.7'];}return d;}
test('target 7 selects actual 7 average, even when every question is middle and recommended high quota is unavailable',()=>{
 const pool=[row('a',6.8),row('b',7.2),row('c',5),row('d',5)],before=JSON.stringify(pool),r=B.selectQuestions(pool,rules());assert(r.complete);assert.equal(average(r.items),7);assert.deepEqual(r.profileSummary.actual,{low:0,middle:2,high:0});assert.equal(JSON.stringify(pool),before);
 assert.equal(B.selectQuestions(pool,{...rules(),profile:{...rules().profile,driver:'ratio'}}).complete,false);
});
test('nearest average agrees with exhaustive combinations for small varied decimal-score pools',()=>{
 for(let k=0;k<30;k++){const pool=Array.from({length:10},(_,i)=>row('q'+i,((i*37+k*19)%101)/10)),r=rules(3,((k*17)%101)/10);let best=Infinity;
 for(let a=0;a<8;a++)for(let b=a+1;b<9;b++)for(let c=b+1;c<10;c++)best=Math.min(best,Math.abs(average([pool[a],pool[b],pool[c]])-r.profile.targetAverage));
 const result=B.selectQuestions(pool,r);assert(result.complete);assert(Math.abs(Math.abs(average(result.items)-r.profile.targetAverage)-best)<1e-8);
 }
});
test('school priority/equal counts, formats, exclusion, chapter allocation and whole sets survive optimization',()=>{
 const pair={id:'set',complete:true,members:[{questionId:'a'},{questionId:'b'}],original_numbers:['1','2']};
 const pool=[{...row('a',6,{type:'서술형'}),questionSet:pair},{...row('b',8),questionSet:pair},row('x',7),row('y',7),row('w',7,{school:'다른중',unit:'m2-7.1'}),row('c',7,{school:'다른중',unit:'m2-7.1'}),row('blocked',7),row('outside',7,{unit:'m2-6.3'})];
 const r={...rules(4),schools:['지정중','다른중'],schoolMode:'equal',units:['m2-8.7','m2-7.1'],types:{선택형:3,서술형:1},excludeIds:['x','y','blocked']};
 const result=B.selectQuestions(pool,r);assert(result.complete);assert(sets.complete(result.items));assert.equal(average(result.items),7);assert.deepEqual(result.schoolAllocation.counts,{지정중:2,다른중:2});assert(!result.items.some(c=>c.question_id==='outside'));
});
test('selected supplements and linked members are mandatory, unknown scores do not become zero',()=>{
 const pool=[row('a',8),row('b',6),row('c',7),row('d',7),row('missing',null)];const r=B.selectQuestions(pool,{...rules(),supplementRequiredIds:['a']});assert(r.complete);assert.deepEqual(new Set(r.items.map(c=>c.question_id)),new Set(['a','b']));assert(!r.items.some(c=>c.question_id==='missing'));
 const only=B.selectQuestions([row('one',6.8),row('two',6.8)],rules());assert(only.complete);assert.equal(only.profileSummary.actualAverage,6.8);
 const manual=B.selectQuestions([row('a',6),row('b',7),row('foreign',8,{school:'보충중'})],{...rules(),supplementIds:['foreign'],supplementRequiredIds:['foreign']});assert(manual.complete);assert(manual.items.some(c=>c.question_id==='foreign'));assert.equal(manual.profileSummary.actualAverage,7);
});
test('general automatic recovery optimizes average instead of reproducing suggested band quota',()=>{
 const r=require('../web-bank/shortage-recovery.cjs').recover([row('a',6.8),row('b',7.2),row('c',5)],rules(),{mode:'balanced'});assert(r.complete);assert.equal(r.profileSummary.actualAverage,7);assert.deepEqual(r.recovery.actual,{low:0,middle:2,high:0});
});
test('mock sharing never worsens target mean, and auto-fill keeps original identities unique across variants',()=>{
 const d=doc(),pool=[row('a',6.8),row('b',7.2),row('c',5),row('d',5)];const standard=M.compose({document:d,snapshot:{candidates:pool},targetIds:['v0']});assert(standard.complete);assert.equal(standard.updates[0].paper.items.reduce((s,c)=>s+c.scoreSnapshot,0)/2,7);
 const multi=doc(2,2),rows=[row('a',6.8),row('b',7.2),row('c',6.8),row('d',7.2),row('bad',2)],r=A.compose({document:multi,snapshot:{candidates:rows},targetIds:['v0','v1']});assert(r.complete);assert.equal(new Set(r.updates.flatMap(u=>u.paper.items.map(i=>i.questionId))).size,4);for(const u of r.updates){assert.equal(u.paper.items.reduce((s,c)=>s+c.scoreSnapshot,0)/2,7);assert.deepEqual(u.paper.autoComposition.transfers,[]);}
});
test('auto target recovery retains locked papers, fixed repair items and foreign-written boundaries',()=>{
 const d=doc();d.counts.A={choice:1,written:1};const rows=[row('c',6),row('w',8,{school:'타학교',type:'서술형'}),row('forbidden',7,{school:'타학교'})];const r=A.compose({document:d,snapshot:{candidates:rows},targetIds:['v0']});assert.equal(r.updates[0].paper.profileSummary.actualAverage,7);assert(!r.updates[0].paper.items.some(i=>i.questionId==='forbidden'));
 const saved=M.apply(d,r),next=A.compose({document:saved,snapshot:{candidates:[rows[1],row('new',6)],exclusions:[{questionId:'c'}]},targetIds:['v0'],repair:true});assert(next.updates[0].paper.items.some(i=>i.questionId==='w'));assert.equal(next.updates[0].paper.profileSummary.actualAverage,7);
});
test('large numeric optimization stays bounded and does not report global optimality',()=>{
 const pool=Array.from({length:1000},(_,i)=>row('q'+i,[5,6.8,7.2,8][i%4])),start=performance.now(),result=B.selectQuestions(pool,rules(20));assert(result.complete);assert.equal(average(result.items),7);assert(performance.now()-start<10000);assert(result.profileSummary.optimization.work<=120002);
});
