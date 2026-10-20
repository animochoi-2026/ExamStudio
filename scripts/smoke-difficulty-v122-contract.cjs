'use strict';
// Explicit one-shot local smoke. Importing or preparing this file never calls AI.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'artifacts/difficulty-v122-rc1'),out=path.join(base,'rc-contract-fix-20261020'),dir=path.join(out,'smoke');
const C=require('../app/difficulty-v122/canonical.cjs'),I=require('../app/difficulty-v122/input.cjs'),K=require('../app/difficulty-v122/contracts.cjs');
const P=require('../app/difficulty-v122/policy.cjs'),CP=require('../app/difficulty-v122/checkpoint.cjs'),Batch=require('../app/difficulty-v122/phase-batch.cjs');
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>C.bytesHash(fs.readFileSync(f));
const ids=[
 ['d3c4c76d-1b41-4ff6-b566-55852b776ea8','2ea407fb-c69f-4d28-87f5-94e0267b5076'],
 ['48039f42-ac97-4c88-8e61-a1847b26e676','92f2b167-fb7a-430e-a329-08584b407f7b'],
 ['dd3121cf-360c-4e04-abfe-ca56cf8a1cb8','97ee33e6-657e-4033-bf0b-b6e460bf30ee']
];
async function prepare(){
 const gate=read(path.join(out,'minimal-preflight.json'));assert.equal(gate.failed,0);assert.equal(gate.passed,6);assert.equal(gate.test_passed,59);
 const versions=read(path.join(root,'app/difficulty-v122/candidate-versions.json'));
 for(const [f,h]of Object.entries(versions.files))assert.equal(sha(path.join(root,'app/difficulty-v122',f)),h);
 const cache=require('./difficulty-v122-cache.cjs').createCache(),Native=require('../app/difficulty-v122/native-source.cjs');
 const rows=fs.readdirSync(path.join(base,'corpus-snapshot')).filter(f=>/^page-\d+\.json$/.test(f)).flatMap(f=>read(path.join(base,'corpus-snapshot',f)));
 const review=read(path.join(base,'approved-review-snapshot.json')).rows,sources=[];
 for(const [id,rev]of ids){
  const row=rows.find(r=>r.question_id===id);assert.equal(row.revision_id,rev);
  const approved=review.find(r=>r.question_id===id&&r.revision_id===rev);if(approved)row.metadata.difficulty.v121Active=approved.active;
  sources.push(await Native.fromNative(row,JSON.parse(cache.read(row.files.find(f=>f.role==='data'))),cache.read));
 }
 const snap=Batch.snapshot(sources,versions.versions);
 for(const p of snap.prepared)require('../app/difficulty-v122/prompt.cjs').render(p);
 const lockedFiles=Object.fromEntries([...Object.keys(versions.files).map(f=>'app/difficulty-v122/'+f),
  'app/difficulty-v122/candidate-versions.json','scripts/run-difficulty-v122.cjs','scripts/smoke-difficulty-v122-contract.cjs',
  'supabase/functions/bank-difficulty-v12/engine.mjs'].map(f=>[f,sha(path.join(root,f))]));
 const plan={authorization:'2026-10-20 user request: two smoke blockers fixed then same three items, Luna medium barrier then candidate Sol medium, maximum six, no retries',policy:P.model_policy_version,
  batch_policy:Batch.version,concurrency:3,crossStageConcurrency:0,maxCalls:6,stage1Max:3,stage2Max:3,stage3Max:0,automaticRetries:0,
  versions:versions.versions,snapshot:snap.manifest,snapshot_hash:snap.hash,lockedFiles,
  preflight_sha256:sha(path.join(out,'minimal-preflight.json')),sources_hash:C.hash(sources),
  prior_incident_sha256:sha(path.join(base,'batch-preflight-20261020/final/stop-report.json')),
  prior_incident_note:'Preserved separately; confirmed minimum 3 synthetic-test attempts, total unknown. Never reset or claimed zero historical calls.'};
 CP.atomic(path.join(dir,'sources.json'),sources);CP.atomic(path.join(dir,'approved-plan.json'),plan);
 return plan;
}
async function execute(){
 require('../app/difficulty-v122/test-boundary.cjs').assertLiveTransportAllowed();
 const plan=read(path.join(dir,'approved-plan.json')),sources=read(path.join(dir,'sources.json'));
 assert.equal(plan.sources_hash,C.hash(sources));assert.equal(plan.maxCalls,6);assert.equal(plan.stage3Max,0);
 assert.deepEqual(sources.map(s=>[s.question_id,s.revision_id]),ids);
 for(const [f,h]of Object.entries(plan.lockedFiles))assert.equal(sha(path.join(root,f)),h,'frozen smoke dependency changed: '+f);
 assert.equal(sha(path.join(out,'minimal-preflight.json')),plan.preflight_sha256);
 const live=require('../app/difficulty-v122/subscription.cjs').provider,spawn=require('node:child_process').spawn;
 fs.mkdirSync(path.join(dir,'launches'),{recursive:true});
 fs.writeFileSync(path.join(dir,'started.json'),C.json({at:new Date().toISOString(),pid:process.pid,plan_hash:C.hash(plan)}),{flag:'wx'});
 const runStage=live({artifactRoot:path.join(dir,'transport'),launch:(exe,args,options)=>{
  const model=args[args.indexOf('--model')+1],effort=args.find(a=>a.startsWith('model_reasoning_effort=')),id=path.basename(path.dirname(args[args.indexOf('--output-schema')+1]));
  assert(!effort.includes('"high"'));assert(fs.readdirSync(path.join(dir,'launches')).length<6);
  fs.writeFileSync(path.join(dir,'launches',id+'.json'),C.json({at:new Date().toISOString(),request_id:id,model,effort}),{flag:'wx'});
  return spawn(exe,args,options);
 }});
 const result=await Batch.run(sources,{versions:plan.versions,policyVersion:plan.policy,smoke:true,stopOnSmokeFailure:false,callLimit:6,
  instructions:require('../app/difficulty-v122/prompt.cjs').instructions,store:require('../app/difficulty-v122/ledger.cjs').fileStore(path.join(dir,'ledger')),
  batchStore:CP.open(path.join(dir,'batch')),readCurrent:(_s,index)=>{
   for(const [f,h]of Object.entries(plan.lockedFiles))assert.equal(sha(path.join(root,f)),h);
   return I.prepare(read(path.join(dir,'sources.json'))[index]);
  },runStage});
 const state=read(path.join(dir,'batch/checkpoint.json')),launches=fs.readdirSync(path.join(dir,'launches')).map(f=>read(path.join(dir,'launches',f)));
 const stages=fs.existsSync(path.join(dir,'batch/calls'))?fs.readdirSync(path.join(dir,'batch/calls')).map(f=>read(path.join(dir,'batch/calls',f))):[];
 const checks=[],check=(name,fn)=>{try{fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.message});}};
 check('three Luna calls, no high, hard cap',()=>{assert.equal(launches.filter(l=>l.model==='gpt-6-luna').length,3);assert(launches.length<=6);assert(!launches.some(l=>l.effort.includes('"high"')));});
 check('all three final results complete',()=>{assert(!state.stopped);assert(state.complete);assert(result.every(r=>r.result?.status==='complete'));});
 check('phase barrier and frozen candidate set',()=>{
  const start=state.events.findIndex(e=>e.type==='stage_started'&&e.stage===2),end=state.events.findIndex(e=>e.type==='stage_finished'&&e.stage===1);
  assert(end>=0);const targets=read(path.join(dir,'batch/stage-2-candidates.json')).indices;
  if(targets.length)assert(start>end);else assert.equal(start,-1);
  assert.deepEqual(stages.filter(s=>s.stage===2).map(s=>ids.findIndex(x=>x[0]===s.identity.question_id)).sort(),[...targets].sort());
 });
 check('frozen files still unchanged',()=>{for(const [f,h]of Object.entries(plan.lockedFiles))assert.equal(sha(path.join(root,f)),h);});
 const report={at:new Date().toISOString(),passed:checks.filter(x=>x.passed).length,failed:checks.filter(x=>!x.passed).length,checks,
  calls:{luna:launches.filter(l=>l.model==='gpt-6-luna').length,solMedium:launches.filter(l=>l.model==='gpt-6.1-sol').length,solHigh:0,total:launches.length,retries:0},
  results:result,stageResults:stages.map(s=>({question_id:s.identity.question_id,stage:s.stage,status:s.envelope.status,
   score:s.envelope.score,tier:s.envelope.final_tier,validation:s.envelope.validation,raw_hash:s.envelope.raw_response_hash,
   failure_reason:s.envelope.failure_reason,evidence:s.envelope.evidence})),batchStopped:state.stopped||null,productionWrites:0,deployments:0,computerUse:0};
 CP.atomic(path.join(dir,'report.json'),report);
 console.log(JSON.stringify({passed:report.passed,failed:report.failed,calls:report.calls,stageResults:report.stageResults,batchStopped:report.batchStopped}));
 if(report.failed)process.exitCode=1;
}
if(require.main===module){
 const action=process.argv[2];
 (action==='--prepare'?prepare():action==='--execute-approved'?execute():Promise.reject(Error('Use --prepare or --execute-approved')))
 .then(r=>{if(r)console.log(JSON.stringify({snapshot_hash:r.snapshot_hash,prepared:true,actualAIcalls:0}));}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={prepare};
