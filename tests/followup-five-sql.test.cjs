'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {localServer}=require('./shared-bank-local-server.cjs'),{seed}=require('./followup-five-fixture.cjs'),model=require('../app/bank-exam-model.cjs');
test('actual scope-confirm RPC -> search payload -> all/selected school composition retains permission and review constraints',async t=>{
 const x=await localServer();t.after(()=>x.close());const {call}=await seed(x);
 const rows=await call(x.B,'bank_search_current',{s:x.S,filters:{},start_at:0});assert.equal(rows.length,10);assert.equal(rows[0].confirmed.scopeEvidence.confirmed,true);
 const rules={count:10,schools:[],units:['m2-6.3'],status:'approved',profile:{low:0,middle:51,high:49,targetAverage:6.7}};
 assert.equal(model.selectQuestions(rows,rules).items.length,10);
 assert.equal(model.selectQuestions(rows,{...rules,schools:['학교A']}).items.length,0);
 assert.equal(model.selectQuestions(rows,{...rules,count:2,schools:['학교A'],profile:{low:0,middle:50,high:50,targetAverage:6.7}}).items.length,2);
 assert.equal(model.selectQuestions(rows,{...rules,status:'shared_pending'}).items.length,10);
 assert.equal(model.selectQuestions(rows,{...rules,forbidden:['m2-6.3']}).items.length,0);
 await assert.rejects(call(x.X,'bank_search_current',{s:x.S,filters:{},start_at:0}));
 const after=await call(x.B,'bank_search_current',{s:x.S,filters:{},start_at:0});assert.deepEqual(after,rows,'composition does not mutate stored metadata or reviews');
});
