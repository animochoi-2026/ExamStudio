'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../app/difficulty-v121/failures.cjs'),Run=require('../app/difficulty-v121/run.cjs');
const entry=id=>({id,questionId:id,revisionId:'r',input:{inputVersion:'v',contentHash:'c',images:[]},validationContext:{storedAnswer:'2'},source:{school:'시험중',originalNumber:'14'}});
test('unknown item is recorded, no escalation/recall, next independent item runs',async()=>{
 const saved=new Map(),calls=[];
 for(const id of ['bad','next']){
  const e=entry(id);
  const out=await F.attempt(e,observe=>Run.evaluateEntry(e,{runStage:async(_,n)=>{
   calls.push(id+':'+n);return {evidence:{completed:false,errors:[{message:'connection reset',code:'ECONNRESET'}]},computed:{reason:'subscription_execution_failed'},key:'k'};
  },saveStage:async(_,n,r)=>observe(n,r)}),async f=>saved.set(id,f));
  assert(out.failure);assert.equal(out.failure.school,'시험중');assert.equal(out.failure.stage,1);
  assert.equal(out.failure.errorMessage,'connection reset');assert.equal(out.failure.actualErrorRecorded,true);
 }
 assert.deepEqual(calls,['bad:1','next:1']);
 assert.equal(F.verifySaved(entry('bad'),saved.get('bad')).status,'unresolved');
 assert.throws(()=>F.verifySaved({...entry('bad'),revisionId:'changed'},saved.get('bad')),/integrity/);
});
test('recording failure or exhausted authorization never silently continues',async()=>{
 await assert.rejects(F.attempt(entry('a'),async()=>{throw Error('approved_call_budget_exhausted');},async()=>{}),/budget/);
 await assert.rejects(F.attempt(entry('a'),async()=>{throw Error('network');},async()=>{throw Error('disk full');}),/disk full/);
});
test('old missing diagnostics are labelled honestly and credentials redacted',()=>{
 assert.equal(F.failureRecord(entry('a'),'subscription_execution_failed').actualErrorRecorded,false);
 const text=F.redact('connection reset Bearer secret https://example.com?token=secret api_key=secret');
 assert(!text.includes('secret'));assert(text.includes('connection reset'));
});
