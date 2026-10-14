const test=require('node:test'),assert=require('node:assert/strict'),{replacementFixture}=require('./replacement-stages-fixture.cjs');
test('preferred whole scope 47; other exact unit 20/20/5; stable score and identity filters',async t=>{
 const x=await replacementFixture();t.after(()=>x.close());const {get,questions:q,rules,db}=x;
 const base=await get();assert.equal(base.items.length,47);assert.equal(base.total,47);assert(base.items.every(c=>c.schoolKey==='school-preferred'));assert(base.items.some(c=>c.metadata.classification.primaryUnit.id==='m2-8.6'));
 assert(!JSON.stringify(base).includes('PRIVATE'));assert(!Object.hasOwn(base,'extraCount'));assert(!base.items.some(c=>x.selected.includes(c.question_id)||c.question_id===q[96].q));
 assert.equal((await get({rules:{...rules,schools:['school-preferred']}})).items.length,47);
 assert.equal((await get({rules:{...rules,schools:['school-preferred','school-other']}})).items.length,92);
 const pages=[];for(let page=0;page<3;page++)pages.push(await get({stage:'other_schools',page}));assert.deepEqual(pages.map(p=>p.items.length),[20,20,5]);
 const all=pages.flatMap(p=>p.items);assert.equal(new Set(all.map(c=>c.question_id)).size,45);assert.equal(pages[2].hasMore,false);assert(all.every(c=>c.schoolKey==='school-other'&&c.metadata.classification.primaryUnit.id==='m2-8.7'));
 const scores=all.map(c=>c.summaryDifficulty.score??-1);assert.deepEqual(scores,[...scores].sort((a,b)=>b-a));assert.deepEqual((await get({stage:'other_schools'})).items,pages[0].items);
 assert.equal((await get({candidate:q[49].q})).items.length,0);assert.equal((await get({stage:'other_schools',candidate:q[49].q})).items.length,1);
 const none=await get({rules:{...rules,schools:[]}});assert(none.needsSchool);assert.equal(none.items.length,0);assert.equal((await get({rules:{...rules,schools:[]},stage:'other_schools'})).items.length,20);
 await db.exec('reset role');await db.query("update bank_catalog set confirmed='{\"difficulty\":10}' where question_id=$1",[q[49].q]);assert.equal((await get({stage:'other_schools',page:1,expected_version:pages[0].version})).changed,true);
 await db.exec('reset role');await db.query("update bank_catalog set metadata=jsonb_set(metadata,'{source,schoolId}','\"homonym\"') where question_id=$1",[q[2].q]);await assert.rejects(()=>get(),/동명이교/);
 await x.actor(null);await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select bank_replacement_candidates($1,$2,$3,$4)',[x.S,q[0].r,rules,x.selected]));
 console.log('Preferred 47; other 20/20/5; stable order, no type rank, source identity, duplicate originals, lazy other stage, anon denied.');
});
test('mock retained-group exclusions, full round selection, late conflict and final atomic save',async t=>{
 const x=await replacementFixture();t.after(()=>x.close());const {A,B,C,S,rpc,get,rules,questions:q,makeDoc}=x;
 const save=(u,d)=>rpc(u,'bank_mock_save',{s:S,e:d.id,expected:0,doc:d});
 await save(B,makeDoc([3,50]));await save(C,makeDoc([4,51]));const doc=makeDoc([1,2,5,52]),r={...rules,mockExamId:doc.id};
 const selected=[...x.selected,q[4].q,q[51].q];
 const base=await get({rules:r,selected}),other=await get({rules:r,selected,stage:'other_schools'});
 assert.equal(base.total,45);assert.equal(other.total,43);assert(base.items.some(c=>c.question_id===q[3].q));
 assert(!base.items.some(c=>[q[2].q,q[4].q].includes(c.question_id)));assert(!other.items.some(c=>[q[49].q,q[51].q].includes(c.question_id)));
 assert.equal((await get()).total,47); // ordinary exam never inherits mock usage
 await save(B,makeDoc([6]));await assert.rejects(()=>get({rules:r,selected,candidate:q[5].q}),/다른 실전모의고사 회차/);
 await assert.rejects(()=>save(A,makeDoc([6])),e=>e.code==='PT409');
 const valid=makeDoc([7]);assert.equal((await save(A,valid)).version,1);
 await assert.rejects(()=>get({rules:{...r,mockExamId:valid.id}},B));
 console.log('Mock both stages exclude own group only; late conflict and final save blocked; different group remains usable.');
});
