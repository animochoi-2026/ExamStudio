const test=require('node:test'),assert=require('node:assert/strict'),P=require('../web-bank/supplement-plan.cjs'),B=require('../app/bank-exam-model.cjs'),M=require('../web-bank/mock-exam-model.cjs'),S=require('../web-bank/mock-round-supplements.cjs');
const row=(id,score,unit='m2-8.7',school='지정중',type='선택형')=>({question_id:id,revision_id:'r-'+id,metadata:{source:{kind:'학교기출',school,grade:'중2'},content:{responseType:type},classification:{primaryUnit:{id:unit}}},confirmed:{difficulty:score},summaryDifficulty:{score}});
const rules={count:10,types:{선택형:10,서술형:0},profile:{low:30,middle:50,high:20,targetAverage:5},units:['m2-8.7'],schools:['지정중'],scopeDistribution:true};
const pool=()=>[row('low',2),...Array.from({length:12},(_,i)=>row('middle'+i,5)),...Array.from({length:8},(_,i)=>row('high'+i,8))];
test('two missing low slots use explicit middle/high choices, without changing scores or counts',()=>{
 const rows=pool(),before=JSON.stringify(rows),ids=['middle11','high7'];assert.equal(B.selectQuestions(rows,rules).complete,false);
 const r=P.select(rows,{...rules,supplementRequiredIds:ids});assert.equal(r.items.length,10);assert(ids.every(id=>r.items.some(c=>c.question_id===id)));assert.equal(r.supplementAdjustment.transferred,2);assert.equal(r.supplementAdjustment.actual.low,1);assert.equal(JSON.stringify(rows),before);assert(B.selectQuestions(r.items,r.rules).complete);
 assert.equal(P.select(rows,rules).complete,false); // no implicit relaxation
 assert.throws(()=>P.select(rows,{...rules,supplementRequiredIds:['missing']}),/조건/);
});
test('same-level outside-school selection keeps original quotas; scope/type/used exclusions remain',()=>{
 const rows=[...pool(),row('outside1',2,'m2-8.7','타학교'),row('outside2',2,'m2-8.7','타학교')],ids=['outside1','outside2'];
 const r=P.select(rows,{...rules,supplementIds:ids,supplementRequiredIds:ids});assert.deepEqual(r.supplementAdjustment.actual,{low:3,middle:5,high:2,killer:0});assert.equal(r.supplementAdjustment.transferred,0);
 for(const extra of [{excludeIds:['outside1']},{units:['m2-8.6']},{types:{선택형:0,서술형:10}}])assert.throws(()=>P.select(rows,{...rules,supplementIds:ids,supplementRequiredIds:ids,...extra}));
});
test('mock joint allocation retains selected supplements in both variants, points and saved round unchanged',()=>{
 const doc=M.create('doc');doc.schools=['지정중'];doc.counts.A={choice:10,written:0,choicePoints:4,writtenPoints:6};M.addVariant(doc,'A','a');M.addVariant(doc,'A','b');doc.variants.forEach(v=>v.units=['m2-8.7']);const before=JSON.stringify(doc),rows=pool(),selected=rows.filter(c=>['middle11','high7'].includes(c.question_id));
 const request=S.withSelection(doc,['a','b'],selected.map(c=>c.question_id),selected),r=M.compose({document:request,snapshot:{candidates:rows},targetIds:['a','b']});assert(r.complete);assert.equal(JSON.stringify(doc),before);
 for(const {paper}of r.updates){assert.equal(paper.items.length,10);assert.equal(paper.items.reduce((n,x)=>n+x.points,0),40);assert(selected.every(c=>paper.items.some(i=>i.questionId===c.question_id)));assert.equal(paper.supplementAdjustment.transferred,2);}
 assert.throws(()=>M.compose({document:request,snapshot:{candidates:rows,excludeIds:['middle11']},targetIds:['a','b']}),/조건/);
});
test('live SQL in isolated database filters whole scope, schools and bands before 20-row pages; group recheck remains',async t=>{
 const x=await require('./replacement-stages-fixture.cjs').replacementFixture();t.after(()=>x.close());const {db,questions:q}=x;
 await db.exec('reset role');
 // 45 other-school middle candidates, split across two selected leaf units.
 await db.query("update bank_catalog set confirmed=jsonb_build_object('difficulty',5),metadata=jsonb_set(metadata,'{classification,primaryUnit,id}',case when (metadata#>>'{source,originalNumber}')::integer%2=0 then '\"m2-8.6\"'::jsonb else '\"m2-8.7\"'::jsonb end) where question_id=any($1)",[q.slice(49,94).map(c=>c.q)]);
 const r={...x.rules,grade:'중2',purpose:'supplement',supplementBands:['middle'],otherSchoolKeys:['school-other']},args={current_revision:null,rules:r,stage:'other_schools'};
 const pages=[];for(let page=0;page<3;page++)pages.push(await x.get({...args,page}));assert.deepEqual(pages.map(p=>p.items.length),[20,20,5]);assert.equal(new Set(pages.flatMap(p=>p.items.map(c=>c.question_id))).size,45);
 assert(pages[0].items.every(c=>c.schoolKey==='school-other'&&c.summaryDifficulty.score===5));assert(pages.flatMap(p=>p.items).some(c=>c.metadata.classification.primaryUnit.id==='m2-8.6'));
 assert.equal((await x.get({...args,rules:{...r,otherSchoolKeys:['school-preferred']}})).total,0);
 assert.equal((await x.get({...args,rules:{...r,supplementBands:['low']}})).total,0);
 const preferred=await x.get({current_revision:null,rules:{...r,supplementBands:['middle','high']}});assert(preferred.items.every(c=>c.summaryDifficulty.score>3));assert(preferred.filterSchools.some(s=>s.key==='school-other'));
 await assert.rejects(()=>x.get({...args,rules:{...r,supplementBands:[]}}),/난이도/);
 const doc=x.makeDoc([50]);await x.rpc(x.B,'bank_mock_save',{s:x.S,e:doc.id,expected:0,doc});const mockRules={...r,mockExamId:require('crypto').randomUUID()};
 assert.equal((await x.get({...args,rules:mockRules})).total,44);await assert.rejects(()=>x.get({...args,rules:mockRules,candidate:q[49].q}),/이미 사용/);
 assert.equal((await x.get({...args,rules:mockRules},x.C)).total,45);
 // Normal replacement still restricts to its target leaf, regardless of filters.
 assert((await x.get({stage:'other_schools'})).items.every(c=>c.metadata.classification.primaryUnit.id==='m2-8.7'));
});
