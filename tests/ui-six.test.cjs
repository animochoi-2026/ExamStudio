'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const D=require('../app/difficulty-assessment.cjs'),M=require('../app/bank-exam-model.cjs'),I=require('../app/source-inventory.cjs');
const row=(id,score,teacher)=>({question_id:id,metadata:{difficulty:{aiScore:score,criteriaVersion:D.version}},confirmed:teacher?{difficultyBand:teacher}:{}});
test('shared numeric grouping preserves legacy teacher bands without using them',()=>{
 const rows=[row('a',3.9),row('b',4),row('c',6.4),row('d',6.5),row('e',8),row('f',2,'어려움'),row('g',9,'쉬움'),row('h',null,'보통'),row('i',null),{...row('j',null),metadata:{difficulty:{assessmentStatus:'deferred'}}}];const before=JSON.stringify(rows);
 assert.deepEqual(rows.map(M.compositionBand),['middle','middle','middle','middle','high','low','high','unknown','unknown','unknown']);
 assert.deepEqual(M.difficultySummary([...rows,rows[0]]).counts,{low:1,middle:4,high:2,unknown:3,deferred:0});assert.equal(M.numericScore(rows[5]),2);assert.equal(M.numericScore(rows[7]),null);assert.equal(JSON.stringify(rows),before);
 const stats=D.statistics(rows).reduce((sum,g)=>sum+(g.all.compositionDistribution.high||0),0);assert.equal(stats,2);
});
test('latest preserved v5 snapshot groups 11/37/2 and is never rewritten',()=>{
 const p='tmp/difficulty-current-only-20261003/verified-current.json';if(!fs.existsSync(p))return;const bytes=fs.readFileSync(p),rows=JSON.parse(bytes);assert.deepEqual(M.difficultySummary(rows).counts,{low:11,middle:37,high:2,deferred:0,unknown:0});assert.deepEqual(fs.readFileSync(p),bytes);
});
test('ratio estimate uses representatives, target suggests ratios, rounded counts always conserve total',()=>{
 assert.ok(Math.abs(M.profileAverage({low:0,middle:48,high:52})-6.56)<1e-10);assert.deepEqual(M.profileForTarget(6.56),{low:0,middle:48,high:52});assert.deepEqual(M.profileForTarget(10),{low:0,middle:0,high:100});
 for(let n=1;n<=100;n++)for(const p of [{low:33,middle:34,high:33},{low:0,middle:48,high:52},{low:17,middle:23,high:60}])assert.equal(Object.values(M.profileCounts(n,p)).reduce((a,b)=>a+b,0),n);
});
test('source count uses explicit totals only and separates objective/written identities across revisions',()=>{
 assert.equal(I.sourceCountLabel({question_count:23,source:{},progress:{expected_count:25}}),'(총 23/25문제)');assert.equal(I.sourceCountLabel({question_count:25,source:{}}),'(총 25/?문제)');assert.equal(I.sourceCountLabel({question_count:25,source:{numbering:{total:25,uncertain:true}}}),'(총 25/?문제)');
 assert.equal(I.sourceCountLabel({question_count:25,source:{numbering:{objectiveCount:20,writtenCount:5}}}),'(총 25/25문제)');
 const a={question_id:'a',metadata:{source:{originalNumber:'1',numbering:{section:'objective'}}}},b={question_id:'b',metadata:{source:{originalNumber:'1',numbering:{section:'written'}}}},v=I.inventory([a,{...a,revision_id:'old'},b],{numbering:{total:2,objectiveCount:1,writtenCount:1}});assert.equal(v.included,2);assert.equal(v.distinct,2);assert.equal(v.complete,true);assert.deepEqual(v.duplicates,[]);
});
test('flow packs tall plus short questions in remaining space and preserves explicit breaks',()=>{
 const items=[{questionId:'a',height:430},{questionId:'b',height:120},{questionId:'c',height:80},{questionId:'d',height:100,breakBefore:'column'},{questionId:'e',height:100,breakBefore:'page'},{questionId:'f',height:801}];const actual=M.paginate(items,800,18);
 assert.deepEqual(actual.pages[0].columns.map(c=>c.map(x=>x.questionId)),[['a','b','c'],['d']]);assert.deepEqual(actual.pages[1].columns.map(c=>c.map(x=>x.questionId)),[['e'],['f']]);assert.deepEqual(actual.overflows,['f']);assert.deepEqual(actual.pages[0].columns[0].map(x=>x.top),[0,448,586]);
});
