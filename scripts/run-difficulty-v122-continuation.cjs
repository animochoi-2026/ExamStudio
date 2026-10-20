'use strict';
// Local orchestration and reporting only. Frozen evaluator modules are imported unchanged.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),base=path.join(root,'artifacts/full-rollout-continuation-20261021');
const X=require('./difficulty-v122-continuation.cjs');
const C=require(root+'/app/difficulty-v122/canonical.cjs'),CP=require(root+'/app/difficulty-v122/checkpoint.cjs');
const I=require(root+'/app/difficulty-v122/input.cjs'),K=require(root+'/app/difficulty-v122/contracts.cjs');
const P=require(root+'/app/difficulty-v122/policy.cjs'),Batch=require(root+'/app/difficulty-v122/phase-batch.cjs');
const versions=require(root+'/app/difficulty-v122/candidate-versions.json').versions;
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),sha=f=>C.bytesHash(fs.readFileSync(f));
const save=(name,value,replace=false)=>CP.atomic(path.join(base,name),value,{replace});
const snapshot=read(base+'/target-snapshot.json'),targets=snapshot.targets;
const byQuestion=new Map(targets.map(t=>[t.identity.question_id,t]));
const frozen=read(base+'/execution-bundle.json');
const imported=fs.readdirSync(base+'/imported-calls').map(f=>read(base+'/imported-calls/'+f));
const importedIds=new Set(imported.map(r=>r.request_id));
const oldCompleted=new Set(imported.map(r=>r.identity.question_id));
const recordPath=id=>base+(importedIds.has(id)?'/imported-calls/':'/batch/calls/')+id+'.json';
const flags={approved_for_full_rollout:false,productionWrites:0,deployments:0,computerUse:0,browserAutomation:0,pdfGeneration:0};
let fullStarted=fs.existsSync(base+'/started.json'),active=new Map(),peak={1:0,2:0,3:0},callRecords=new Map(),lastState=null;
const log=(type,value={})=>{const e={at:new Date().toISOString(),type,...value};fs.appendFileSync(base+'/execution-events.jsonl',JSON.stringify(e)+'\n');console.log(JSON.stringify(e));};
function invariantFiles(){
 assert.equal(cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),frozen.source_commit);
 assert.equal(sha(base+'/target-snapshot.json'),frozen.snapshot_sha256);
 for(const [p,h]of Object.entries(frozen.code))assert.equal(sha(root+'/'+p),h,'frozen bundle mismatch: '+p);
 assert.equal(C.hash(frozen.code),frozen.bundle_hash);
 assert.equal(versions.criteria_payload_hash,snapshot.criteria_payload_hash);
 assert.equal(C.hash(targets.map(t=>t.identity)),snapshot.identities_hash);
}
function loadSources(){
 return targets.map(t=>{
  const file=path.join(base,t.source_file);assert.equal(sha(file),t.source_sha256,'snapshot source mismatch');
  const source=read(file);
  // Retain immutable image identities in memory; hydrate exact frozen image bytes on demand.
  source.images=source.images.map((image,index)=>{
   const {dataUrl,...small}=image;
   Object.defineProperty(small,'dataUrl',{enumerable:true,get(){return read(file).images[index].dataUrl;}});
   return small;
  });
  assert.deepEqual(K.identity(I.prepare(source),versions),t.identity);
  return source;
 });
}
function records(stage){return [...callRecords.values()].filter(r=>r.stage===stage);}
function stageSummary(stage,state){
 const rs=records(stage),items=state.items;
 return {stage,model:P.stages[stage-1].model,effort:P.stages[stage-1].effort,
  calls:rs.length,success:rs.filter(r=>r.envelope.status==='complete').length,
  finalized:rs.filter(r=>{const i=items.find(i=>i.key===r.envelope.evaluation_key);return i?.next===null&&i.result?.stage===stage&&i.result.status==='complete';}).length,
  next_candidates:items.filter(i=>i.next===stage+1).length,
  unresolved:rs.filter(r=>r.envelope.status==='unresolved').length,
  failed:rs.filter(r=>r.envelope.status==='failed').length,peak_concurrency:peak[stage]};
}
function freezeStage(stage,state){
 const file='stage-'+stage+'-complete.json';
 if(fs.existsSync(base+'/'+file))return;
 const rows=records(stage).map(r=>({identity:r.identity,request_id:r.request_id,idempotency_key:r.idempotency_key,model:r.envelope.model,effort:r.envelope.effort,status:r.envelope.status,score:r.envelope.score,tier:r.envelope.final_tier,validation:r.envelope.validation,raw_response_hash:r.envelope.raw_response_hash,call_record_sha256:sha(recordPath(r.request_id))}));
 const manifest={stage,batch_manifest_hash:state.manifest_hash,snapshot_identity_hash:snapshot.identities_hash,rows};
 const hash=C.hash(manifest),complete={completed_at:new Date().toISOString(),...stageSummary(stage,state),manifest_hash:hash,manifest};
 save(file,complete);
 save('stage-'+stage+'-unresolved.json',{stage,manifest_hash:hash,rows:rows.filter(r=>r.status==='unresolved')});
 if(stage<3){
  const candidates=state.items.filter(i=>i.next===stage+1).map(i=>({index:i.index,identity:targets[i.index].identity,source_file:targets[i.index].source_file,previous_stage_request_id:stage===1&&i.prior_stage_1_request_id?i.prior_stage_1_request_id:targets[i.index].stage_request_ids[stage-1]}));
  const candidate={stage:stage+1,previous_stage_manifest_hash:hash,batch_manifest_hash:state.manifest_hash,candidates};
  save('stage-'+(stage+1)+'-candidates.json',{...candidate,manifest_hash:C.hash(candidate)});
 }
 log('barrier_frozen',{stage,manifest_hash:hash,...stageSummary(stage,state)});
}
function summary(state){
 const items=state?.items||[],finals=items.filter(i=>i.result?.status==='complete').map(i=>i.result);
 const tiers=Object.fromEntries(Array.from({length:6},(_,i)=>['T'+i,0]));
 const display={하:0,중:0,상:0,킬러:0},transitions={},deltas={'<=-3':0,'(-3,-2]':0,'(-2,-1]':0,'(-1,0)':0,'0':0,'(0,1)':0,'[1,2)':0,'[2,3)':0,'>=3':0};
 const failures=items.filter(i=>i.result&&i.result.status!=='complete'||['unresolved','stale_input'].includes(i.status)).map(i=>({question_id:targets[i.index].identity.question_id,revision_id:targets[i.index].identity.revision_id,source:targets[i.index].source,stage:i.result?.stage||null,status:i.status,reason:i.reason||i.result?.failure_reason,detail:i.result?.validation?.detail||null,score:null,tier:null}));
 const promotions={},samples=[];
 for(const r of finals){
  tiers[r.final_tier]++;
  // Preserve the current display contract: killer is also included in high.
  if(r.score<=3)display.하++;else if(r.score<8)display.중++;else display.상++;
  if(r.score>=9)display.킬러++;
  const t=byQuestion.get(r.question_id),old=t.previous_tier;
  if(old){const k=old+'→'+r.final_tier;transitions[k]=(transitions[k]||0)+1;}
  if(t.previous_score!==null){const d=Math.round((r.score-Number(t.previous_score))*1e8)/1e8,k=d<=-3?'<=-3':d<=-2?'(-3,-2]':d<=-1?'(-2,-1]':d<0?'(-1,0)':d===0?'0':d<1?'(0,1)':d<2?'[1,2)':d<3?'[2,3)':'>=3';deltas[k]++;}
  for(const p of r.promotions||[]){const key=typeof p==='string'?p:C.json(p);promotions[key]=(promotions[key]||0)+1;}
  const group=r.final_tier+'|'+C.json(r.promotions);
  if(!samples.some(x=>x.group===group))samples.push({group,question_id:r.question_id,source:t.source,stage:r.stage,score:r.score,tier:r.final_tier,promotions:r.promotions,computed:r.computed});
 }
 const launches=fs.existsSync(base+'/launches')?fs.readdirSync(base+'/launches').filter(f=>f.endsWith('.json')):[];
 const report={at:new Date().toISOString(),status:state?.stopped?'hard_blocked':state?.complete?'completed_in_staging':'running',
  snapshot_count:targets.length,snapshot_identity_hash:snapshot.identities_hash,batch_manifest_hash:state?.manifest_hash||null,
  stages:[1,2,3].map(s=>stageSummary(s,state||{items:[]})),total_ai_calls:launches.length+imported.length,new_ai_calls:launches.length,carried_completed_calls:imported.length,reserved_calls:state?.calls||0,retries:0,duplicate_calls:0,
  stale_inputs:items.filter(i=>i.status==='stale_input').length,finalized:finals.length,unstarted:items.filter(i=>i.status==='pending').length,
  tier_distribution:tiers,display_distribution:display,display_contract:'하 <=3, 중 >3 and <8, 상 >=8, 킬러 >=9 (included in 상)',
  promotion_counts:promotions,failures,previous_tier_movements:transitions,score_delta_distribution:deltas,representative_samples:samples,
  stage_manifests:[1,2,3].flatMap(s=>{const f=base+'/stage-'+s+'-complete.json';return fs.existsSync(f)?[{stage:s,path:f,sha256:sha(f),manifest_hash:read(f).manifest_hash}]:[]}),
  stop_reason:state?.stopped||null,staging_path:base,full_rollout_started:fullStarted,evaluation_completed_in_staging:!!state?.complete,
  next_production_approval:'Separate explicit user approval of final candidate manifest, activation scope and rollback plan. No activation occurs in this runner.',
  ...flags};
 save('execution-report.json',report,true);return report;
}
async function main(){
 invariantFiles();
 const sources=loadSources();
 const planned=X.plan(sources,versions,imported);
 assert.equal(planned.continuation_hash,frozen.continuation_hash);
 assert.equal(planned.snap.hash,frozen.batch_manifest_hash);
 for(const r of imported)callRecords.set(r.request_id,r);
 const approved={at:new Date().toISOString(),scope:'Full evaluation of prepared snapshot in local staging only',stage1_subscription_execution_failed_to_stage2:true,authorization_source:'Explicit user message in this thread on 2026-10-21 Asia/Seoul',snapshot_sha256:sha(base+'/target-snapshot.json'),targets:targets.length,maximum_calls:targets.length*3,automatic_retries:0,concurrency:3,cross_stage_concurrency:0,bindings:P.stages,...flags};
 if(!fs.existsSync(base+'/execution-authorization.json'))save('execution-authorization.json',approved);
 fs.mkdirSync(base+'/launches',{recursive:true});
 const store=require(root+'/app/difficulty-v122/ledger.cjs').fileStore(base+'/ledger');
 const batchStore=CP.open(base+'/batch'),originalWrite=batchStore.write;
 X.seed(batchStore,planned);
 if(fs.existsSync(base+'/batch/calls'))for(const file of fs.readdirSync(base+'/batch/calls')){const v=read(base+'/batch/calls/'+file);callRecords.set(v.request_id,v);}
 batchStore.write=(name,value,replace=false)=>{
  originalWrite(name,value,replace);
  if(name.startsWith('calls/')){callRecords.set(value.request_id,value);log('call_saved',{stage:value.stage,question_id:value.identity.question_id,status:value.envelope.status,tier:value.envelope.final_tier,reason:value.envelope.validation?.detail||value.envelope.failure_reason});}
  if(name==='checkpoint.json'){
   lastState=value;
   const e=value.events.at(-1);
   if(e?.type==='stage_finished')freezeStage(e.stage,value);
   summary(value);
  }
 };
 const executable=require(root+'/app/codex.cjs').findCodex();
 const provider=require(root+'/app/difficulty-v122/subscription.cjs').provider({artifactRoot:base+'/transport',executable,
  launch:(exe,args,opt)=>{
   const requestId=path.basename(path.dirname(args[args.indexOf('--output-schema')+1]));
   const info=active.get(requestId);assert(info,'unreserved subprocess');
   assert.equal(args[args.indexOf('--model')+1],P.stages[info.stage-1].model);
   assert(args.includes('model_reasoning_effort="'+P.stages[info.stage-1].effort+'"'));
   if(!fullStarted){save('started.json',{at:new Date().toISOString(),pid:process.pid,snapshot_identity_hash:snapshot.identities_hash,...flags});fullStarted=true;}
   save('launches/'+requestId+'.json',{at:new Date().toISOString(),request_id:requestId,stage:info.stage,model:P.stages[info.stage-1].model,effort:P.stages[info.stage-1].effort});
   log('call_started',{stage:info.stage,request_id:requestId,active:active.size});
   return cp.spawn(exe,args,{...opt,windowsHide:true});
  }});
 await Batch.run(sources,{versions,policyVersion:P.model_policy_version,store,batchStore,callLimit:targets.length*3,
  instructions:require(root+'/app/difficulty-v122/prompt.cjs').instructions,
  readCurrent:async(source,index)=>{
   const t=targets[index];assert.equal(sha(base+'/'+t.source_file),t.source_sha256,'snapshot corruption');
   return I.prepare(source);
  },
  runStage:async request=>{
   assert(active.size<3,'concurrency exceeded');assert([...active.values()].every(x=>x.stage===request.stage),'cross stage overlap');
   const t=byQuestion.get(request.prepared.identities.question_id);
   assert(!(request.stage===1&&oldCompleted.has(t.identity.question_id)),'completed_stage_reissue_forbidden');
   assert.equal(request.request_id,t.stage_request_ids[request.stage-1]);
   if(request.stage>1)assert(fs.existsSync(base+'/stage-'+(request.stage-1)+'-complete.json'),'stage barrier missing');
   active.set(request.request_id,{stage:request.stage});peak[request.stage]=Math.max(peak[request.stage],active.size);
   try{return await provider(request);}
   catch(e){
    const fatal=/구독|로그인|auth|model|binding|bundle|image.*hash|snapshot/i.test(e.message);
    return {status:fatal?'failed':'unresolved',reason:fatal?'systemic_transport_precondition_failure':'result_unknown',raw:null,systemicFailure:fatal,model:request.model,effort:request.effort,request_id:request.request_id,evidence:{code:e.code||null,errors:[{type:'precondition',message:require(root+'/app/difficulty-v121/failures.cjs').redact(e.message)}]}};
   }finally{active.delete(request.request_id);}
  }});
 const state=batchStore.read('checkpoint.json');invariantFiles();
 // Empty final stages also receive explicit zero-call completion manifests.
 if(state.complete)for(let s=1;s<=3;s++)freezeStage(s,state);
 const report=summary(state);
 log('runner_finished',{status:report.status,stop_reason:report.stop_reason,calls:report.total_ai_calls,finalized:report.finalized});
 if(state.stopped)process.exitCode=2;
}
if(require.main===module)main().catch(e=>{
 const message=require(root+'/app/difficulty-v121/failures.cjs').redact(e.message);
 try{save('runner-error.json',{at:new Date().toISOString(),message,...flags});if(lastState){lastState.stopped=lastState.stopped||message;summary(lastState);}log('runner_error',{message});}catch{}
 process.exitCode=1;
});
