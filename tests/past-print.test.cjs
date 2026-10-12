const test=require('node:test'),assert=require('node:assert/strict'),m=require('../web-bank/past-print-model.cjs');
const row=(q,n,u='m2-8.7')=>({question_id:q,revision_id:q+'-revision',metadata:{source:{originalNumber:String(n)},classification:{primaryUnit:{id:u}}}});
test('source filtering, descending years, original order, no dedup and no count cap',()=>{
 const sources=[{source_id:'old',source:{school:'A',academicYear:2024}},{source_id:'new',source:{school:'A',academicYear:2025}}],rows=new Map([['old',[row('same',1)]],['new',[row('last',3),row('same',1),row('outside',2,'m1-1.1')]]]);
 const result=m.collect(sources,rows,['m2-8.7']);assert.deepEqual(result.items.map(x=>[x.year,x.questionId]),[[2025,'same'],[2025,'last'],[2024,'same']]);assert.equal(result.excluded.length,1);assert.equal(m.estimate(result.items),3);
 assert(m.matches(sources[1],{schools:[m.schoolKey(sources[1].source)],from:2025,to:2026}));assert(!m.matches(sources[0],{schools:[m.schoolKey(sources[0].source)],from:2025,to:2026}));
 rows.set('new',Array.from({length:1100},(_,i)=>row('same',i+1)));assert.equal(m.collect(sources,rows,['m2-8.7']).items.length,1101);
});
test('automatic title and exam-specific headings preserve snapshots and old saved order',()=>{
 assert.equal(m.title(['압구정중'],2023,2026),'압구정중 기출프린트 2023년~2026년');
 assert.equal(m.title(['압구정중','경원중','압구정중'],2026,2026),'압구정중 · 경원중 기출프린트 2026년');
 const items=[{questionId:'a',sourceId:'s1',year:2026,semester:'2학기',exam:'중간고사'},{questionId:'b',sourceId:'s2',year:2026,semester:'1학기',exam:'기말고사'}];
 const groups=m.groups(items);assert.equal(groups.length,2);assert.equal(m.estimate(items),3);
 assert.equal(m.header(groups[0],{semester:'1학기',exam:'기말고사'}),'[2026년 2학기 중간고사]');
 assert.equal(m.header(groups[1]),'[2026년 1학기 기말고사]');assert.deepEqual(groups.flatMap(g=>g.items.map(i=>i.questionId)),['a','b']);
 assert.equal(m.header({year:2025,items:[{}]},{semester:2,exam:'중간고사'}),'[2025년 2학기 중간고사]');
 assert.equal(m.header({year:2025,items:[{}]}),'[2025년 학기 미확인 시험 구분 미확인]');
 const s={source_id:'s1',source:{school:'압구정중',academicYear:2026,semester:'2학기',exam:'중간고사'}};
 const result=m.collect([s],new Map([['s1',[row('a',1)]]]),['m2-8.7']);assert.equal(result.items[0].semester,'2학기');assert.equal(result.items[0].exam,'중간고사');
});
