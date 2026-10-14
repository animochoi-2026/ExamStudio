const test=require('node:test'),assert=require('node:assert/strict'),{replacementFixture}=require('./replacement-stages-fixture.cjs'),format=require('../app/response-format.cjs');
test('ordinary and mock replacement preserve response format in both queries and confirmation',async t=>{
 const x=await replacementFixture({mixedFormats:true});t.after(()=>x.close());
 for(const mock of [false,true]){
  const rules={...x.rules,...(mock?{mockExamId:require('crypto').randomUUID()}:{})};
  for(const stage of ['preferred_school','other_schools']){
   const first=await x.get({rules,stage});assert.equal(first.total,stage==='preferred_school'?28:31);
   const pages=stage==='preferred_school'?[first]:[first,await x.get({rules,stage,page:1})];
   assert.deepEqual(pages.map(p=>p.items.length),stage==='preferred_school'?[28]:[20,11]);
   const rows=pages.flatMap(p=>p.items);assert(rows.every(c=>format.fromMetadata(c.metadata)==='서술형'));assert.equal(new Set(rows.map(c=>c.question_id)).size,first.total);
   const objective=x.questions[stage==='preferred_school'?30:80];
   assert.equal((await x.get({rules,stage,candidate:objective.q})).items.length,0,'direct confirmation rejects objective');
   assert.equal((await x.get({rules,stage,candidate:rows[0].question_id})).items.length,1);
   // Reverse direction, without trusting a caller-supplied desired format.
   const choices=await x.get({rules:{...rules,responseType:'서술형'},stage,current_revision:x.questions[30].r});
   assert(choices.items.length);assert(choices.items.every(c=>format.fromMetadata(c.metadata)==='선택형'));
   assert.equal((await x.get({rules,stage,current_revision:x.questions[30].r,candidate:rows[0].question_id})).items.length,0);
  }
 }
});
