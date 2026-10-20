'use strict';
// Explicit continuation of the already-completed Luna phase after the authorized
// wire-contract repair. Never reruns Luna or overwrites its original evidence.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'artifacts/difficulty-v122-rc1/rc-contract-fix-20261020');
const previous=path.join(base,'smoke'),dir=path.join(base,'selection-fix/smoke-medium');
const C=require('../app/difficulty-v122/canonical.cjs'),K=require('../app/difficulty-v122/contracts.cjs'),I=require('../app/difficulty-v122/input.cjs');
const P=require('../app/difficulty-v122/policy.cjs'),Batch=require('../app/difficulty-v122/phase-batch.cjs'),CP=require('../app/difficulty-v122/checkpoint.cjs');
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>C.bytesHash(fs.readFileSync(f));
async function prepare(){
 const gate=read(path.join(base,'selection-fix/minimal-preflight.json'));assert.equal(gate.failed,0);assert.equal(gate.totalValidations,59);
 assert(!fs.existsSync(path.join(previous,'batch/runner.lock')),'prior runner lease still exists');
 const launched=fs.readdirSync(path.join(previous,'launches'));assert.equal(launched.length,3);
 const calls=fs.readdirSync(path.join(previous,'batch/calls')).map(f=>({file:f,...read(path.join(previous,'batch/calls',f))}));assert.equal(calls.length,3);
 const sources=read(path.join(previous,'sources.json')),m=read(path.join(root,'app/difficulty-v122/candidate-versions.json'));
 const snapshot=Batch.snapshot(sources,m.versions),priorPlan=read(path.join(previous,'approved-plan.json'));
 const evidence=snapshot.manifest.identities.map((identity,index)=>{
  const prior=calls.find(c=>c.identity.question_id===identity.question_id);assert(prior);K.verifyEnvelope(prior.envelope);
  assert.equal(prior.stage,1);assert.equal(prior.call.status,'complete');assert.equal(prior.envelope.status,'failed');
  assert.equal(require('../app/difficulty-v122/router.cjs').next(1,{...prior.envelope,raw:prior.call.raw}),2);
  for(const key of K.required.filter(k=>!['prompt_hash','schema_hash','validator_hash','criteria_payload_hash'].includes(k)))assert.equal(prior.identity[key],identity[key],key);
  return {index,question_id:identity.question_id,stage1_request_id:prior.request_id,stage1_completed_at:prior.call.completed_at,
   stage1_call_file:'../../smoke/batch/calls/'+prior.file,stage1_call_hash:sha(path.join(previous,'batch/calls',prior.file)),
   stage1_identity:prior.identity,stage2_identity:identity,reason:prior.envelope.validation,prior_raw_hash:prior.envelope.raw_response_hash};
 });
 const lockedFiles=Object.fromEntries([...Object.keys(m.files).map(f=>'app/difficulty-v122/'+f),'app/difficulty-v122/candidate-versions.json',
  'scripts/smoke-difficulty-v122-contract-medium.cjs','supabase/functions/bank-difficulty-v12/engine.mjs'].map(f=>[f,sha(path.join(root,f))]));
 const plan={authorization:'User: repair same-scope implementation errors then three Luna completed before frozen candidates only Sol medium, six calls total',
  candidate_reason:'Three recorded Luna structural failures; original failures and raw preserved. Local wire-contract correction before independent Sol medium.',
  phase1_criteria_payload_hash:priorPlan.versions.criteria_payload_hash,phase2_criteria_payload_hash:m.versions.criteria_payload_hash,
  phases_use_identical_criteria_hash:false,mathematical_criteria_unchanged:true,versions:m.versions,evidence,
  priorCalls:3,remainingCalls:3,totalCallCap:6,stage3Calls:0,automaticRetries:0,concurrency:3,crossStageConcurrency:0,
  sources_hash:C.hash(sources),manifest_hash:snapshot.hash,lockedFiles,preflight_hash:sha(path.join(base,'selection-fix/minimal-preflight.json'))};
 CP.atomic(path.join(dir,'approved-plan.json'),plan);CP.atomic(path.join(dir,'sources.json'),sources);
 console.log(JSON.stringify({prepared:true,candidates:3,priorCalls:3,newCalls:0,remainingCap:3}));
}
async function execute(){
 require('../app/difficulty-v122/test-boundary.cjs').assertLiveTransportAllowed();
 const plan=read(path.join(dir,'approved-plan.json')),sources=read(path.join(dir,'sources.json')),snapshot=Batch.snapshot(sources,plan.versions);
 assert.equal(snapshot.hash,plan.manifest_hash);assert.equal(C.hash(sources),plan.sources_hash);
 for(const [f,h]of Object.entries(plan.lockedFiles))assert.equal(sha(path.join(root,f)),h);
 for(const e of plan.evidence)assert.equal(sha(path.resolve(dir,e.stage1_call_file)),e.stage1_call_hash);
 assert(!fs.existsSync(path.join(previous,'batch/runner.lock')));
 fs.mkdirSync(path.join(dir,'launches'),{recursive:true});
 fs.writeFileSync(path.join(dir,'started.json'),C.json({at:new Date().toISOString(),pid:process.pid,plan_hash:C.hash(plan)}),{flag:'wx'});
 const cp=CP.open(path.join(dir,'batch'));
 cp.acquire();try{
  cp.write('manifest.json',snapshot.manifest);
  cp.write('checkpoint.json',{manifest_hash:snapshot.hash,policy:Batch.version,calls:0,
   phase1_evidence_hash:C.hash(plan.evidence),prior_phase_calls:3,
   events:[{at:plan.evidence.map(e=>e.stage1_completed_at).sort().at(-1),type:'stage_finished',stage:1,evidence:'preserved original Luna call records'},
    {at:new Date().toISOString(),type:'authorized_wire_contract_continuation',originalFailurePreserved:true}],
   items:snapshot.manifest.identities.map((identity,index)=>({index,key:K.evaluationKey(identity),next:2,status:'pending',result:null,reused:false}))});
 }finally{cp.release();}
 const spawn=require('node:child_process').spawn,provider=require('../app/difficulty-v122/subscription.cjs').provider;
 const runStage=provider({artifactRoot:path.join(dir,'transport'),launch:(exe,args,options)=>{
  const model=args[args.indexOf('--model')+1],effort=args.find(a=>a.startsWith('model_reasoning_effort=')),id=path.basename(path.dirname(args[args.indexOf('--output-schema')+1]));
  assert.equal(model,'gpt-6.1-sol');assert.equal(effort,'model_reasoning_effort="medium"');
  const prior=fs.readdirSync(path.join(previous,'launches')).length,count=fs.readdirSync(path.join(dir,'launches')).length;
  assert.equal(prior,3);assert(count<3&&prior+count<6);
  fs.writeFileSync(path.join(dir,'launches',id+'.json'),C.json({at:new Date().toISOString(),request_id:id,model,effort}),{flag:'wx'});
  return spawn(exe,args,options);
 }});
 const results=await Batch.run(sources,{versions:plan.versions,policyVersion:P.model_policy_version,smoke:true,callLimit:3,
  instructions:require('../app/difficulty-v122/prompt.cjs').instructions,store:require('../app/difficulty-v122/ledger.cjs').fileStore(path.join(dir,'ledger')),batchStore:cp,
  readCurrent:(_s,index)=>{for(const [f,h]of Object.entries(plan.lockedFiles))assert.equal(sha(path.join(root,f)),h);return I.prepare(sources[index]);},runStage});
 const state=cp.read('checkpoint.json'),launches=fs.readdirSync(path.join(dir,'launches')).map(f=>read(path.join(dir,'launches',f)));
 const calls=fs.readdirSync(path.join(dir,'batch/calls')).map(f=>read(path.join(dir,'batch/calls',f)));
 const checks=[],check=(name,fn)=>{try{fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.message});}};
 check('three original Luna preserved, at most three medium, no high or retry',()=>{assert.equal(fs.readdirSync(path.join(previous,'launches')).length,3);assert(launches.length<=3);assert(launches.every(x=>x.model==='gpt-6.1-sol'&&x.effort==='model_reasoning_effort="medium"'));});
 check('three normally processed final results',()=>{assert.equal(results.length,3);assert(state.complete&&!state.stopped);assert(results.every(x=>x.result?.status==='complete'));});
 check('phase barrier and frozen candidates',()=>{assert(launches.every(l=>plan.evidence.every(e=>e.stage1_completed_at<l.at)));assert.deepEqual(cp.read('stage-2-candidates.json').indices,[0,1,2]);assert(calls.every(c=>c.stage===2));});
 check('locked files and original raw unchanged',()=>{for(const [f,h]of Object.entries(plan.lockedFiles))assert.equal(sha(path.join(root,f)),h);for(const e of plan.evidence)assert.equal(sha(path.resolve(dir,e.stage1_call_file)),e.stage1_call_hash);});
 const report={at:new Date().toISOString(),passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,checks,
  calls:{luna:3,solMedium:launches.length,solHigh:0,retries:0,total:3+launches.length},results,
  stageResults:calls.map(c=>({question_id:c.identity.question_id,stage:2,status:c.envelope.status,score:c.envelope.score,tier:c.envelope.final_tier,validation:c.envelope.validation,computed:c.envelope.computed,raw_hash:c.envelope.raw_response_hash})),
  phase1_contract_hash:plan.phase1_criteria_payload_hash,phase2_contract_hash:plan.phase2_criteria_payload_hash,phase1_original_failure_preserved:true,
  productionWrites:0,deployments:0,fullCorpusAICalls:0,computerUse:0};
 CP.atomic(path.join(dir,'report.json'),report);console.log(JSON.stringify(report));if(report.failed)process.exitCode=1;
}
if(require.main===module)(process.argv[2]==='--prepare'?prepare():process.argv[2]==='--execute-approved'?execute():Promise.reject(Error('explicit action required'))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={prepare,execute};
