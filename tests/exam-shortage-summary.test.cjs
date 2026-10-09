'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../app/bank-exam-model.cjs');
const row=(id,type,score)=>({question_id:id,revision_id:'r-'+id,metadata:{content:{responseType:type},classification:{primaryUnit:{id:'m2-6.3'}}},confirmed:{difficulty:score}});
test('49 eligible with two written explains exact five-request shortage without relaxing input',async()=>{
 const {compositionFailureText}=await import('../web-bank/composition-summary.js');
 const candidates=Array.from({length:49},(_,i)=>row('q'+i,i<2?'proof':'single_choice',5)),rules={count:20,units:['m2-6.3'],types:{서술형:5}};
 const before=JSON.stringify({candidates,rules}),result=M.selectQuestions(candidates,rules);
 assert.equal(result.eligible,49);assert.equal(result.complete,false);assert.deepEqual(result.shortages,[{label:'서술형',requested:5,available:2,missing:3}]);assert.equal(compositionFailureText(result),'서술형 5개 요청 / 2개 가능 / 3개 부족');assert.equal(JSON.stringify({candidates,rules}),before);
 assert(M.selectQuestions(candidates,{...rules,types:{서술형:2}}).complete);
});
test('shortages use filtered unique candidates; difficulty and cross constraints remain distinct',()=>{
 const rows=[row('w1','proof',8),row('w2','proof',8),row('c1','single_choice',3),row('c2','single_choice',3)];
 const r=M.selectQuestions([...rows,rows[0]],{count:2,units:['m2-6.3'],types:{서술형:2},excludeIds:['w2']});assert.deepEqual(r.shortages,[{label:'서술형',requested:2,available:1,missing:1}]);
 const cross=M.selectQuestions(rows,{count:2,units:['m2-6.3'],types:{서술형:2},profile:{low:50,middle:0,high:50,targetAverage:5.5}});assert.equal(cross.constraintConflict,true);assert.deepEqual(cross.shortages,[]);assert.equal(cross.crossCounts.low['서술형'],0);assert.equal(cross.crossCounts.high['서술형'],2);
 const high=M.selectQuestions(rows,{count:3,units:['m2-6.3'],profile:{low:0,middle:0,high:100,targetAverage:8}});assert.deepEqual(high.shortages,[{label:'상',requested:3,available:2,missing:1}]);
});
test('actual paper summary counts final boundary scores, unresolved items and each format separately',async()=>{
 const {paperComposition,paperCompositionText}=await import('../web-bank/composition-summary.js');
 const catalogs=new Map([['a',row('a','single_choice',3)],['b',row('b','proof',3.1)],['c',row('c','single_value',8)]]);
 let items=[{revisionId:'a'},{revisionId:'b'},{revisionId:'c'},{revisionId:'unread'}];
 const s=paperComposition(items,catalogs);assert.deepEqual(s,{total:4,difficulty:{low:1,middle:1,high:1,unknown:1,killer:0},formats:{선택형:1,서술형:1,단답형:1,미분류:1}});assert.match(paperCompositionText(s),/총 4문항.*단답형 1.*미분류 1/);
 items.splice(0,1);assert.equal(paperComposition(items,catalogs).total,3);items[0]={revisionId:'c',scoreSnapshot:3};assert.equal(paperComposition(items,catalogs).difficulty.low,1);assert.equal(paperComposition(items,catalogs).formats['서술형'],0);
 assert.deepEqual(paperComposition(JSON.parse(JSON.stringify(items)),catalogs),paperComposition(items,catalogs));assert.equal(paperComposition([{revisionId:'c',scoreSnapshot:null}],catalogs).difficulty.unknown,1);assert.equal(paperComposition([{revisionId:'c',scoreSnapshot:''}],catalogs).difficulty.unknown,1);
});
