const test=require('node:test'),assert=require('node:assert/strict');
const {paginateQuadrants}=require('../app/bank-exam-model.cjs');
test('short questions keep four fixed quadrants instead of rising into the prior slot',()=>{
 const items=Array.from({length:5},(_,i)=>({questionId:String(i+1),height:40,workspaceMm:0}));
 const result=paginateQuadrants(items,800);
 assert.equal(result.pages.length,2);
 assert.deepEqual(result.pages[0].columns.map(c=>c.map(x=>x.top)),[[0,400],[0,400]]);
 assert.deepEqual(result.pages[1].columns.map(c=>c.map(x=>x.questionId)),[['5'],[]]);
});
test('uneven questions share available space while overlong questions are reported',()=>{
 const result=paginateQuadrants([{questionId:'a',height:80},{questionId:'b',height:500},{questionId:'c',height:80},{questionId:'d',height:801}],800);
 assert.deepEqual(result.pages[0].columns.map(c=>c.map(x=>x.questionId)),[['a','b'],['c']]);
 assert.deepEqual(result.pages[1].columns.map(c=>c.map(x=>x.questionId)),[['d'],[]]);
 assert.deepEqual(result.overflows,['d']);
});
test('explicit page/column breaks and writing space preserve quadrant order',()=>{
 const result=paginateQuadrants([{questionId:'a',height:40},{questionId:'b',height:40,breakBefore:'column'},{questionId:'c',height:40,breakBefore:'page'},{questionId:'d',height:40,workspaceMm:100},{questionId:'e',height:40}],800);
 assert.deepEqual(result.pages.map(p=>p.columns.map(c=>c.map(q=>q.questionId))),[[['a'],['b']],[['c','d'],['e']]]);
 assert.ok(result.pages.every(p=>p.columns.every(c=>c.length<=2)));
});

test('adaptive two-item placement never overlaps, truncates writing space or ignores explicit full columns',()=>{
 for(const geometry of [800,{height:900,firstHeight:740,introHeight:180}])for(const heights of [[80,500,90,600],[440,110,320,310]]){
  const result=paginateQuadrants(heights.map((height,i)=>({questionId:String(i),height,workspaceMm:15})),geometry);
  assert.deepEqual(result.pages.flatMap(p=>p.columns.flatMap(c=>c.map(q=>q.questionId))),['0','1','2','3']);
  for(const p of result.pages)for(const [ci,col]of p.columns.entries())for(const [i,q]of col.entries()){
   assert(q.top>=p.areas[ci].top);assert(q.top+q.height<=p.areas[ci].top+p.areas[ci].height);if(i)assert(q.top>=col[i-1].top+col[i-1].height+18);
  }
 }
 const full=paginateQuadrants([{questionId:'a',height:50,layout:'full'},{questionId:'b',height:40}],800);assert.deepEqual(full.pages[0].columns.map(c=>c.map(q=>q.questionId)),[['a'],['b']]);
});
