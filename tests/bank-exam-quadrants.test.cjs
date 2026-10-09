const test=require('node:test'),assert=require('node:assert/strict');
const {paginateQuadrants}=require('../app/bank-exam-model.cjs');
test('short questions keep four fixed quadrants instead of rising into the prior slot',()=>{
 const items=Array.from({length:5},(_,i)=>({questionId:String(i+1),height:40,workspaceMm:0}));
 const result=paginateQuadrants(items,800);
 assert.equal(result.pages.length,2);
 assert.deepEqual(result.pages[0].columns.map(c=>c.map(x=>x.top)),[[0,400],[0,400]]);
 assert.deepEqual(result.pages[1].columns.map(c=>c.map(x=>x.questionId)),[['5'],[]]);
});
test('a tall question uses a full column and an overlong question is reported',()=>{
 const result=paginateQuadrants([{questionId:'a',height:80},{questionId:'b',height:500},{questionId:'c',height:80},{questionId:'d',height:801}],800);
 assert.deepEqual(result.pages[0].columns.map(c=>c.map(x=>x.questionId)),[['a'],['b']]);
 assert.deepEqual(result.pages[1].columns.map(c=>c.map(x=>x.questionId)),[['c'],['d']]);
 assert.deepEqual(result.overflows,['d']);
});
test('explicit page/column breaks and writing space preserve quadrant order',()=>{
 const result=paginateQuadrants([{questionId:'a',height:40},{questionId:'b',height:40,breakBefore:'column'},{questionId:'c',height:40,breakBefore:'page'},{questionId:'d',height:40,workspaceMm:100},{questionId:'e',height:40}],800);
 assert.deepEqual(result.pages.map(p=>p.columns.map(c=>c.map(q=>q.questionId))),[[['a'],['b']],[['c'],['d']],[['e'],[]]]);
 assert.ok(result.pages.every(p=>p.columns.every(c=>c.length<=2)));
});
