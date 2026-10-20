'use strict';
// Transfer completed FAILURE history to a new, independently bound batch.
// Never relabel an old result as having been evaluated by the new candidate.
const assert=require('node:assert/strict');
const C=require('../app/difficulty-v122/canonical.cjs'),K=require('../app/difficulty-v122/contracts.cjs');
const Batch=require('../app/difficulty-v122/phase-batch.cjs');
const contractOnly=new Set(['prompt_hash','schema_hash','criteria_payload_hash']);
function plan(sources,versions,priorCalls){
 const snap=Batch.snapshot(sources,versions),seen=new Set();
 const adopted=priorCalls.map(record=>{
  const old=record.envelope;K.verifyEnvelope(old);
  assert.equal(record.stage,1);assert.equal(old.stage,1);
  assert.equal(old.status,'failed');assert.equal(old.validation.reason,'difficulty_structure_invalid');
  assert.equal(old.score,null);assert.equal(old.final_tier,null);
  assert.equal(old.evidence.completed,true);assert.equal(old.evidence.exitCode,0);
  assert.equal(C.hash(record.call.raw),old.raw_response_hash);
  const index=snap.manifest.identities.findIndex(i=>i.question_id===old.question_id&&i.revision_id===old.revision_id);
  assert(index>=0,'completed revision missing from continuation');
  assert(!seen.has(index),'duplicate completed stage');seen.add(index);
  const current=snap.manifest.identities[index];
  for(const key of K.required)if(!contractOnly.has(key))assert.equal(current[key],old[key],'non-contract identity changed: '+key);
  return {index,question_id:old.question_id,revision_id:old.revision_id,prior_request_id:old.request_id,
   prior_identity:record.identity,current_identity:current,prior_record_hash:C.hash(record),
   next_stage:2,original_status:'failed',reason:old.validation.reason,score:null,tier:null};
 }).sort((a,b)=>a.index-b.index);
 const continuation={version:'completed-failures-contract-continuation-r1',batch_manifest_hash:snap.hash,
  contract_only_changes:[...contractOnly],adopted,completed_calls_not_reissued:true,old_results_relabelled:false};
 return {snap,continuation,continuation_hash:C.hash(continuation)};
}
function seed(batchStore,planned){
 const {snap,continuation,continuation_hash}=planned;
 batchStore.acquire();
 try{
  const existing=batchStore.read('manifest.json');
  if(existing){
   assert.equal(C.hash(existing),snap.hash,'manifest_hash_mismatch');
   assert.equal(C.hash(batchStore.read('continuation.json')),continuation_hash,'continuation_hash_mismatch');
   assert.equal(batchStore.read('checkpoint.json').manifest_hash,snap.hash,'manifest_hash_mismatch');
   return {reused:true};
  }
  assert.equal(batchStore.read('checkpoint.json'),null,'unbound_checkpoint');
  batchStore.write('manifest.json',snap.manifest);
  batchStore.write('continuation.json',continuation);
  const prior=new Map(continuation.adopted.map(a=>[a.index,a]));
  const state={manifest_hash:snap.hash,policy:Batch.version,calls:prior.size,
   continuation_hash,events:[{at:new Date().toISOString(),type:'completed_failures_adopted',count:prior.size,continuation_hash}],
   items:snap.manifest.identities.map((i,index)=>({index,key:K.evaluationKey(i),next:prior.has(index)?2:1,
    status:prior.has(index)?'failed':'pending',result:null,reused:false,
    ...(prior.has(index)?{prior_stage_1_request_id:prior.get(index).prior_request_id}:{})}))};
  batchStore.write('stage-1-candidates.json',{manifest_hash:snap.hash,stage:1,indices:state.items.map(i=>i.index)});
  batchStore.write('checkpoint.json',state);return {reused:false};
 }finally{batchStore.release();}
}
module.exports={plan,seed};
