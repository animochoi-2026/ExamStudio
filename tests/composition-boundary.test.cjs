'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const D=require('../app/difficulty-assessment.cjs'),M=require('../app/bank-exam-model.cjs'),F=require('../app/bank-search-filters.cjs');
const row=(id,n)=>({question_id:id,metadata:{source:{school:'boundary'},difficulty:{aiScore:String(n),criteriaVersion:D.version},classification:{primaryUnit:{id:'m2-6.3'},types:[{id:'type-'+id}]}},content:{responseType:'single_choice'}});
test('explicit user 3/8 boundaries agree across buckets, filters, statistics and composition; scores remain untouched',()=>{
 const ns=[0,3,3.1,3.9,4,6.5,7.9,8,10],expected=['low','low','middle','middle','middle','middle','middle','high','high'],rows=ns.map((n,i)=>row('q'+i,n)),before=JSON.stringify(rows);
 assert.deepEqual(rows.map(D.compositionBand),expected);assert.deepEqual(rows.map(M.compositionBand),expected);
 for(const [i,c]of rows.entries())for(const k of ['low','middle','high'])assert.equal(F.matches(c,{compositionBand:k}),k===expected[i]);
 assert.deepEqual(M.difficultySummary(rows).counts,{low:2,middle:5,high:2,deferred:0,unknown:0});
 const stats=D.statistics(rows).flatMap(g=>g.all);assert.deepEqual(stats[0].compositionDistribution,{low:2,middle:5,high:2});assert.equal(stats[0].highShare,2/9);
 const result=M.selectQuestions(rows,{count:3,units:['m2-6.3'],profile:{low:0,middle:100,high:0,targetAverage:5}});assert.equal(result.complete,true);assert.ok(result.items.every(c=>D.compositionBand(c)==='middle'));
 assert.equal(JSON.stringify(rows),before);
});
test('teacher numeric override wins; a legacy band alone stays unknown without invented score',()=>{
 const a=row('a',9);a.confirmed={difficulty:'3.1',difficultyBand:'아주어려움'};const b=row('b',2);b.metadata.difficulty.userScore='8.0';const c={question_id:'c',confirmed:{difficultyBand:'쉬움'},metadata:{difficulty:{teacherBand:'보통'}}};const before=JSON.stringify([a,b,c]);
 assert.deepEqual([a,b,c].map(D.compositionBand),['middle','high','unknown']);assert.equal(D.effective(a).number,3.1);assert.equal(D.effective(c).number,null);assert.equal(JSON.stringify([a,b,c]),before);
});
test('review, statistics and desktop guidance all state the same explicit numeric cutoffs',()=>{
 for(const p of ['web-bank/composition-summary.js','web-bank/review-editor.js']){const s=fs.readFileSync(p,'utf8');assert.match(s,/하 3점 이하.*중 3점 초과~8점 미만.*상 8점 이상/);assert.doesNotMatch(s,/중 4~6\.5|상 6\.5/);}
 assert.match(fs.readFileSync('app/bank-ui.js','utf8'),/e\.number<=3\?'하':e\.number<8\?'중':'상'/);
});
