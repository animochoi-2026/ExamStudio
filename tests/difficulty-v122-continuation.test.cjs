'use strict';
require('./offline-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const X=require('../scripts/difficulty-v122-continuation.cjs'),B=require('../app/difficulty-v122/phase-batch.cjs');
const I=require('../app/difficulty-v122/input.cjs'),K=require('../app/difficulty-v122/contracts.cjs'),R=require('../app/difficulty-v122/response-contract.cjs');
const C=require('../app/difficulty-v122/canonical.cjs'),P=require('../app/difficulty-v122/policy.cjs'),CP=require('../app/difficulty-v122/checkpoint.cjs');
const versions=require('../app/difficulty-v122/candidate-versions.json').versions;
const {wireFixture}=require('./difficulty-v122-entrypoints.test.cjs');
function setup(){
 const text='1. Required relation\nThe given angle determines the result.';
 const sources=Array.from({length:6},(_,i)=>({question_id:'continuation-'+i,revision_id:'r',question:{body:'Find the angle.',choices:[]},
  scope:{grade:'중2'},difficulty_basis:text,approved_routes:[{route_id:'main',source:'confirmed_solution',solution_excerpt:text}],images:[]}));
 const p=I.prepare(sources[0]),oldVersions={...versions,prompt_hash:'old-prompt',schema_hash:'old-schema',criteria_payload_hash:'old-criteria'};
 const identity=K.identity(p,oldVersions),id=K.stageKey(K.evaluationKey(identity),1),raw=wireFixture(p);
 const call={raw,status:'complete',started_at:'2026-10-20T00:00:00Z',completed_at:'2026-10-20T00:01:00Z',request_id:id,evidence:{completed:true,exitCode:0,errors:[]}};
 const checked={validation:{valid:false,reason:'difficulty_structure_invalid',detail:'saved failure'},computed:{status:'failed',score:null,problem_tier:null,reason:'difficulty_structure_invalid'}};
 const envelope=K.envelope(p,oldVersions,1,call,checked,R.bind(p,id));
 const prior=[{identity,stage:1,request_id:id,idempotency_key:id,call,envelope}];
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'difficulty-continuation-')),cp=CP.open(path.join(dir,'batch'));
 return {sources,prior,cp,store:require('../app/difficulty-v122/ledger.cjs').fileStore(path.join(dir,'ledger'))};
}
test('only exact-source confirmed failures may be adopted; originals stay immutable',()=>{
 const x=setup(),hash=C.hash(x.prior),p=X.plan(x.sources,versions,x.prior);
 assert.equal(p.continuation.adopted.length,1);assert.equal(C.hash(x.prior),hash);
 for(const key of ['question_content_hash','image_asset_hash','source_manifest_hash','validator_hash','scorer_hash']){
  const changed={...versions,[key]:'changed'};
  assert.throws(()=>X.plan(x.sources,changed,x.prior),/non-contract identity changed/);
 }
 const wrong=structuredClone(x.prior);wrong[0].envelope.status='unresolved';
 assert.throws(()=>X.plan(x.sources,versions,wrong));
});
test('seed does not rewrite request identity or store a fabricated stage result',()=>{
 const x=setup(),p=X.plan(x.sources,versions,x.prior);X.seed(x.cp,p);
 const s=x.cp.read('checkpoint.json');assert.equal(s.calls,1);assert.equal(s.items[0].next,2);
 assert.equal(s.items[0].result,null);assert.equal(s.items[0].prior_stage_1_request_id,x.prior[0].request_id);
 assert.equal(x.cp.read('calls/'+K.stageKey(s.items[0].key,1)+'.json'),null);
 assert.equal(X.seed(x.cp,p).reused,true);
});
test('different manifest cannot resume and a valid lease blocks seeding',()=>{
 const x=setup(),p=X.plan(x.sources,versions,x.prior);x.cp.acquire();
 assert.throws(()=>X.seed(CP.open(x.cp.root),p),/batch_lease_active/);x.cp.release();
 X.seed(x.cp,p);
 assert.throws(()=>X.seed(x.cp,X.plan(x.sources,{...versions,prompt_hash:'another'},x.prior)),/manifest_hash_mismatch/);
});
test('barriers, three workers, budget accounting and no stage-1 replay survive continuation',async()=>{
 const x=setup(),p=X.plan(x.sources,versions,x.prior);X.seed(x.cp,p);
 const calls=[],active=new Map(),finished=new Set();let peak=0;
 await B.run(x.sources,{versions,policyVersion:P.model_policy_version,store:x.store,batchStore:x.cp,callLimit:18,
  runStage:async req=>{
   const q=req.prepared.identities.question_id;
   assert(!(req.stage===1&&q==='continuation-0'),'completed stage reissued');
   if(req.stage>1)assert.equal([...finished].filter(k=>k.startsWith('1:')).length,5);
   assert([...active.values()].every(stage=>stage===req.stage));
   active.set(req.request_id,req.stage);peak=Math.max(peak,active.size);assert(peak<=3);
   await new Promise(resolve=>setTimeout(resolve,5));
   active.delete(req.request_id);finished.add(req.stage+':'+q);calls.push(req.request_id);
   return {status:'complete',raw:wireFixture(req.prepared),request_binding_hash:req.request_envelope.envelope_hash,model:req.model,effort:req.effort};
  }});
 assert.equal(peak,3);assert.equal(new Set(calls).size,calls.length);
 assert.equal(x.cp.read('checkpoint.json').calls,1+calls.length);
 assert(x.cp.read('checkpoint.json').complete);
 const count=calls.length;
 await B.run(x.sources,{versions,policyVersion:P.model_policy_version,store:x.store,batchStore:x.cp,runStage:()=>{throw Error('duplicate call');}});
 assert.equal(calls.length,count);
});
test('17 saved calls keep four exact final results and thirteen next-stage candidates without relabelling',()=>{
 const F=require('../scripts/check-difficulty-v122-contract-r2.cjs'),rows=F.cases(),before=C.hash(rows.map(x=>x.call));
 const transition={from:[rows[0].call.identity.validator_hash],to:versions.validator_hash,attestation_hash:C.hash({offline:'test only'})};
 const planned=X.plan(rows.map(x=>x.source),versions,rows.map(x=>x.call),{contractTransition:transition});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'difficulty-adopt-success-')),cp=CP.open(dir);
 X.seed(cp,planned);const s=cp.read('checkpoint.json');
 assert.equal(s.calls,17);assert.equal(s.items.filter(x=>x.result).length,4);assert.equal(s.items.filter(x=>x.next===2).length,13);
 for(const i of s.items.filter(x=>x.result))assert.deepEqual(i.result,rows[i.index].call.envelope);
 assert.equal(C.hash(rows.map(x=>x.call)),before);
 assert.throws(()=>X.plan(rows.map(x=>x.source),{...versions,validator_hash:'unknown'},rows.map(x=>x.call),{contractTransition:transition}),/non-contract/);
});
