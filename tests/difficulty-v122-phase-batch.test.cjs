'use strict';
require('./offline-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Batch=require('../app/difficulty-v122/phase-batch.cjs'),CP=require('../app/difficulty-v122/checkpoint.cjs');
const {fileStore}=require('../app/difficulty-v122/ledger.cjs'),I=require('../app/difficulty-v122/input.cjs'),K=require('../app/difficulty-v122/contracts.cjs');
const V=require('../app/difficulty-v122/validate.cjs'),P=require('../app/difficulty-v122/policy.cjs'),C=require('../app/difficulty-v122/canonical.cjs');
const {wireFixture:fixture}=require('./difficulty-v122-entrypoints.test.cjs'),versions=require('../app/difficulty-v122/candidate-versions.json').versions;
function sources(n=7){return Array.from({length:n},(_,i)=>({question_id:'mock-'+i,revision_id:'rev-1',question:{body:'Find the angle.',choices:[]},
 scope:{grade:'중학교 2학년'},difficulty_basis:'The given angle determines the required angle.',difficulty_basis_source:'confirmed_solution',
 approved_routes:[{route_id:'approved-main',source:'confirmed_solution',solution_excerpt:'The given angle determines the required angle.'}],images:[]}));}
function ok(req,high=false){
 const raw=fixture(req.prepared);if(high)Object.assign(raw.viable_routes[0].critical_discoveries[1],{C:2,R:2,B:2,H:3,is_non_obvious:true});
 return {status:'complete',request_binding_hash:req.request_envelope.envelope_hash,model:req.model,effort:req.effort,raw,usage:{input_tokens:0,output_tokens:0}};
}
const failed=()=>({status:'failed',raw:null,reason:'subscription_execution_failed',
 evidence:{completed:false,usage:null,exitCode:1,errors:[{type:'turn.failed',message:'item execution failed'}]}});
function setup(n=7,fn=req=>ok(req)){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'phase-batch-')),events=[],src=sources(n);
 const runtime={versions,policyVersion:P.model_policy_version,instructions:'offline fixture',store:fileStore(path.join(root,'ledger')),
  batchStore:CP.open(path.join(root,'batch')),runStage:async req=>{
   events.push({kind:'start',stage:req.stage,id:req.request_id});
   const r=await fn(req,events);events.push({kind:'end',stage:req.stage,id:req.request_id});return r;
  }};
 return {root,src,runtime,events,run:()=>Batch.run(src,runtime)};
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function barrier(events,first,second){
 const starts=events.filter(e=>e.kind==='start'&&e.stage===first).length;
 const firstNext=events.findIndex(e=>e.kind==='start'&&e.stage===second);
 assert(firstNext>=0);
 assert.equal(events.slice(0,firstNext).filter(e=>e.kind==='end'&&e.stage===first).length,starts);
}
test('01 all Luna finishes before any Sol medium starts',async()=>{
 const h=setup(7,async req=>{await delay(3);return ok(req,req.stage===1);});await h.run();barrier(h.events,1,2);
 assert.equal(h.runtime.batchStore.read('stage-2-candidates.json').indices.length,7);
});
test('02 all Sol medium finishes before any Sol high starts',async()=>{
 const h=setup(7,async req=>{await delay(3);return req.stage<3?failed():ok(req);});await h.run();barrier(h.events,2,3);
});
test('03 each stage concurrency is exactly three when enough candidates',async()=>{
 const active=[0,0,0,0],peak=[0,0,0,0],h=setup(7,async req=>{
  active[req.stage]++;peak[req.stage]=Math.max(peak[req.stage],active[req.stage]);await delay(5);active[req.stage]--;
  return req.stage<3?failed():ok(req);
 });await h.run();assert.deepEqual(peak.slice(1),[3,3,3]);
});
test('04 cross-stage concurrency stays zero',async()=>{
 const active=new Map(),h=setup(7,async req=>{
  for(const [stage,count]of active)if(stage!==req.stage)assert.equal(count,0);
  active.set(req.stage,(active.get(req.stage)||0)+1);await delay(4);active.set(req.stage,active.get(req.stage)-1);
  return req.stage<3?failed():ok(req);
 });await h.run();
});
test('05 resume completed snapshot makes zero additional calls',async()=>{
 const h=setup(4);await h.run();const n=h.events.length;await h.run();assert.equal(h.events.length,n);
 assert(h.runtime.batchStore.read('checkpoint.json').complete);
});
test('06 duplicate key and live lease cannot dispatch; expired dead lease can recover',async()=>{
 const h=setup(1),snap=Batch.snapshot(h.src,versions),key=K.stageKey(K.evaluationKey(snap.manifest.identities[0]),1);
 h.runtime.store.claim(key,{request_id:key});
 const r=await h.run();assert.equal(h.events.length,0);assert.equal(r[0].status,'unresolved');
 const lease=CP.open(path.join(h.root,'lease'),{clock:()=>1,alive:()=>false});lease.acquire();
 assert.throws(()=>CP.open(path.join(h.root,'lease'),{clock:()=>2,alive:()=>true}).acquire(),/lease_active/);
 const recovered=CP.open(path.join(h.root,'lease'),{clock:()=>99999999,alive:()=>false});recovered.acquire();recovered.release();
 assert(fs.readdirSync(path.join(h.root,'lease')).some(x=>x.startsWith('retired-lease-')));
});
test('07 checkpoint atomically replaces complete JSON and retains old value on rename failure',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atomic-')),file=path.join(dir,'state.json');CP.atomic(file,{n:1});
 CP.atomic(file,{n:2},{replace:true});assert.deepEqual(JSON.parse(fs.readFileSync(file)),{n:2});
 assert.throws(()=>CP.atomic(file,{n:3},{replace:true,rename:()=>{throw Error('move failed');}}),/move failed/);
 assert.deepEqual(JSON.parse(fs.readFileSync(file)),{n:2});
});
test('08 stopped run preserves completed results and forbids automatic restart',async()=>{
 const h=setup(3,async req=>{if(req.prepared.identities.question_id==='mock-0')return ok(req);
  await delay(8);return {...failed(),systemicFailure:true};});
 await h.run();const before=C.hash(h.runtime.batchStore.read('checkpoint.json').items[0].result),n=h.events.length;
 await assert.rejects(h.run,/requires_explicit_recovery/);assert.equal(h.events.length,n);
 assert.equal(C.hash(h.runtime.batchStore.read('checkpoint.json').items[0].result),before);
});
test('09 timeout and unknown outcomes never promote or repeat',async()=>{
 for(const reason of ['timeout','result_unknown','response lost']){
  const h=setup(1,()=>({status:'unresolved',raw:null,reason}));const r=await h.run();await h.run();
  assert.equal(h.events.filter(e=>e.kind==='start').length,1);assert.equal(r[0].status,'unresolved');
 }
});
test('10 confirmed structural and terminal execution failures promote only once per stage',async()=>{
 for(const kind of ['structural','execution']){
  const h=setup(1,req=>req.stage===1?(kind==='execution'?failed():{status:'complete',raw:{}}):ok(req));
  await h.run();assert.deepEqual(h.events.filter(e=>e.kind==='start').map(e=>e.stage),[1,2]);
 }
});
test('11 Sol medium normal T2 finalizes without high',async()=>{
 const h=setup(1,req=>{const r=ok(req);const d=r.raw.viable_routes[0].critical_discoveries[1];
  Object.assign(d,{C:2,R:2,B:req.stage===1?2:1,H:3,is_non_obvious:true});return r;});
 const r=await h.run();assert.equal(r[0].result.final_tier,'T2');assert.deepEqual(h.events.filter(e=>e.kind==='start').map(e=>e.stage),[1,2]);
});
test('12 high failure remains failed with null score and tier',async()=>{
 const h=setup(1,failed),r=await h.run();assert.equal(r[0].status,'failed');assert.equal(r[0].result.score,null);assert.equal(r[0].result.final_tier,null);
 assert.deepEqual(h.events.filter(e=>e.kind==='start').map(e=>e.stage),[1,2,3]);
});
test('13 changed revision becomes stale_input before dispatch',async()=>{
 const h=setup(1);h.runtime.readCurrent=src=>I.prepare({...src,revision_id:'new-revision'});
 const r=await h.run();assert.equal(r[0].status,'stale_input');assert.equal(h.events.length,0);
});
test('14 an individual item failure does not stop other items',async()=>{
 const h=setup(4,req=>req.prepared.identities.question_id==='mock-0'?{status:'failed',reason:'input_unavailable',raw:null}:ok(req));
 const r=await h.run();assert.equal(r.filter(x=>x.status==='complete').length,3);assert.equal(r.filter(x=>x.status==='failed').length,1);
});
test('15 repeated common source/schema error stops before a later stage',async()=>{
 const h=setup(8,()=>({status:'complete',raw:{}}));const r=await h.run();
 assert(r.some(x=>x.batchStopped==='repeated_common_structure_error'));
 assert(h.events.filter(e=>e.kind==='start').length<=3);assert(!h.events.some(e=>e.stage>1));
});
test('16 resume rejects a mismatched fixed manifest without dispatch',async()=>{
 const h=setup(1);await h.run();h.src[0].revision_id='different';const n=h.events.length;
 await assert.rejects(h.run,/manifest_hash_mismatch/);assert.equal(h.events.length,n);
});
test('17 failed checkpoint move cannot report completion; hard budget is atomic',async()=>{
 const h=setup(1);h.runtime.batchStore=CP.open(path.join(h.root,'broken'),{rename:()=>{throw Error('move denied');}});
 await assert.rejects(h.run,/move denied/);assert.equal(h.events.length,0);assert.equal(h.runtime.batchStore.read('checkpoint.json'),null);
 const cap=setup(7);cap.runtime.callLimit=1;await cap.run();assert.equal(cap.events.filter(e=>e.kind==='start').length,1);
 assert.equal(cap.runtime.batchStore.read('checkpoint.json').calls,1);
});
test('18 local image reads work while network and database writes remain blocked',async()=>{
 const sharp=require('sharp'),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=','base64');
 assert.equal((await sharp(png).metadata()).height,1);
 await assert.rejects(()=>fetch('https://example.invalid/rest/v1/x',{method:'POST',body:'{}'}),/Offline test blocked/);
 const D=require('../artifacts/difficulty-v122-rc1/baseline/shindong-m2-three-stage-20261020/detect-db-writes.cjs');
 for(const op of ['insert','update','upsert','delete'])assert.equal(D.scan('client.from("x").'+op+'(x)').writes.length,1);
 assert.equal(D.scan(fs.readFileSync(require.resolve('../app/difficulty-v122/phase-batch.cjs'),'utf8')).writes.length,0);
});

test('19 approved two-stage smoke freezes candidates after all Luna settles, no high or retries',async()=>{
 const h=setup(3,async req=>{await delay(2);return req.stage===1?failed():ok(req);});
 Object.assign(h.runtime,{smoke:true,stopOnSmokeFailure:false,callLimit:6});
 const results=await h.run();barrier(h.events,1,2);assert(results.every(r=>r.result.status==='complete'));
 assert.equal(h.events.filter(e=>e.kind==='start').length,6);assert(!h.events.some(e=>e.stage===3));
 assert.deepEqual(h.runtime.batchStore.read('stage-2-candidates.json').indices,[0,1,2]);
});
