const test=require('node:test'),assert=require('node:assert/strict'),m=require('../web-bank/past-print-model.cjs');
const row=(q,n,u='m2-8.7')=>({question_id:q,revision_id:q+'-revision',metadata:{source:{originalNumber:String(n)},classification:{primaryUnit:{id:u}}}});
test('source filtering, descending years, original order, no dedup and no count cap',()=>{
 const sources=[{source_id:'old',source:{school:'A',academicYear:2024}},{source_id:'new',source:{school:'A',academicYear:2025}}],rows=new Map([['old',[row('same',1)]],['new',[row('last',3),row('same',1),row('outside',2,'m1-1.1')]]]);
 const result=m.collect(sources,rows,['m2-8.7']);assert.deepEqual(result.items.map(x=>[x.year,x.questionId]),[[2025,'same'],[2025,'last'],[2024,'same']]);assert.equal(result.excluded.length,1);assert.equal(m.estimate(result.items),3);
 assert(m.matches(sources[1],{schools:[m.schoolKey(sources[1].source)],from:2025,to:2026}));assert(!m.matches(sources[0],{schools:[m.schoolKey(sources[0].source)],from:2025,to:2026}));
 rows.set('new',Array.from({length:1100},(_,i)=>row('same',i+1)));assert.equal(m.collect(sources,rows,['m2-8.7']).items.length,1101);
});
