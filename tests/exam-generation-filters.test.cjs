'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../app/bank-exam-model.cjs');
const row=(id,unit,type,format='single_choice',school='A',score=5)=>({question_id:id,metadata:{source:{school,grade:'중2'},classification:{primaryUnit:{id:unit,name:unit==='m2-6.3'?'삼각형의 외심':'삼각형의 내심'},types:[{id:type,name:type==='task.angle'?'각도 계산':'길이 계산'}]},content:{responseType:format}},confirmed:{difficulty:score}});
test('generation unit/type use existing search classification and combine scope/school/count/format',()=>{
 const pool=[row('a','m2-6.3','task.angle','proof'),row('b','m2-6.3','task.angle'),row('c','m2-6.3','task.length'),row('d','m2-6.4','task.angle'),row('e','m2-6.3','task.angle','proof','B')],rules={count:2,units:['m2-6.3','m2-6.4'],schools:['A'],unit:'삼각형의 외심',type:'각도 계산',types:{서술형:1}};
 const before=JSON.stringify(pool),r=M.selectQuestions(pool,rules);assert(r.complete);assert.deepEqual(r.items.map(c=>c.question_id).sort(),['a','b']);assert.equal(JSON.stringify(pool),before);assert(M.selectQuestions(pool,{...rules,unit:'',type:''}).complete);assert.equal(M.selectQuestions(pool,{...rules,type:'길이 계산'}).complete,false);
 const corrected={...pool[2],confirmed:{difficulty:5,type:'각도 계산',primaryUnit:'삼각형의 외심'}};assert(M.inspectCandidates([corrected],rules).eligible.length===1);assert.deepEqual(M.selectQuestions(pool,JSON.parse(JSON.stringify(rules))).items.map(c=>c.question_id),r.items.map(c=>c.question_id));
});
