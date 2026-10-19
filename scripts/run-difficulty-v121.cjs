'use strict';
// Local subscription runner. Results are private staging files, never live scores.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {app,safeStorage}=require('electron');
const root=path.resolve(process.argv[2]||path.join(__dirname,'../artifacts/difficulty-v121'));
const data=process.argv[3]||'C:/Users/reals/Desktop/문제생성기/data/r2-current';
app.setPath('userData',path.join(data,'desktop'));app.setPath('sessionData',path.join(data,'desktop/session'));
const I=require('../app/difficulty-v12/input.cjs'),P=require('../app/difficulty-v121/profile.cjs');
const Run=require('../app/difficulty-v121/run.cjs'),Policy=require('../app/difficulty-v121/policy.cjs'),Sub=require('../app/difficulty-v12/subscription.cjs');
const Failures=require('../app/difficulty-v121/failures.cjs');
const {runPool}=require('../app/difficulty-v121/pool.cjs');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
function write(file,value){const target=path.join(root,file),temp=target+'.tmp';fs.writeFileSync(temp,JSON.stringify(value));fs.renameSync(temp,target);}
function log(value){const line=JSON.stringify({at:new Date().toISOString(),...value})+'\n';fs.appendFileSync(path.join(root,'progress.jsonl'),line);try{process.stdout.write(line);}catch{}}
for(const stream of [process.stdout,process.stderr])stream.on('error',()=>{});
let lock,counts,concurrency=1;
const activeStages=new Map();
function publish(status,extra={}){write('run-status.json',{status,...counts,concurrency,activeStages:[...activeStages.values()],...extra,updatedAt:new Date().toISOString()});}
app.whenReady().then(async()=>{try{
 const targets=read('targets.json').rows,approval=read('execution-approval.json'),snapshot=read('snapshot-manifest.json');
 concurrency=approval.concurrency??1;
 if(![1,2,3].includes(concurrency)||(concurrency>1&&!approval.concurrencyAuthorization))throw Error('concurrency_approval_required');
 if(approval.granted!==true||approval.targetHash!==I.hash(targets)||approval.promptHash!==P.promptHash||approval.schemaHash!==P.schemaHash||approval.profileVersion!==P.version||approval.maximumCalls!==targets.length*3||approval.automaticRetries!==0||approval.strictCalibration!==false||I.hash(approval.stages)!==I.hash(Policy.stages))throw Error('approved_target_policy_mismatch');
 if(snapshot.targetHash!==approval.targetHash||snapshot.hash!==I.hash(snapshot.rows))throw Error('manifest_integrity_mismatch');
 for(const row of snapshot.rows)if(I.hash(read(row.file))!==row.hash)throw Error('snapshot_integrity_mismatch');
 if(fs.existsSync(path.join(root,'preparation-errors.json'))&&read('preparation-errors.json').length)throw Error('preparation_incomplete');
 for(const dir of ['calls','results','failures'])fs.mkdirSync(path.join(root,dir),{recursive:true});
 const lockFile=path.join(root,'runner.lock');lock=fs.openSync(lockFile,'wx');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,at:new Date().toISOString()}));
 const executable=require('../app/codex.cjs').findCodex();Sub.assertSubscription(executable);
 const auth=new(require('../app/shared-bank-auth.cjs').SharedBankAuth)({directory:path.join(data,'shared-bank-auth'),safeStorage});
 const storage=new(require('../app/shared-bank-storage.cjs').SharedBankStorage)({auth});
 const jobFile=path.join(root,'job.json'),job=fs.existsSync(jobFile)?read('job.json'):{id:crypto.randomUUID(),createdAt:new Date().toISOString(),targetHash:approval.targetHash,snapshotHash:snapshot.hash};
 if(job.targetHash!==approval.targetHash||job.snapshotHash!==snapshot.hash)throw Error('job_target_changed');write('job.json',job);
 counts={completed:0,failed:0,reused:0,unresolved:0,total:targets.length};let documentId=null;
 const resume=fs.existsSync(path.join(root,'resume-decisions.json'))?read('resume-decisions.json'):{};
 const healthFile='system-health.json',previousHealth=fs.existsSync(path.join(root,healthFile))?read(healthFile):null;
 const health=previousHealth?.profileVersion===P.version?previousHealth:{profileVersion:P.version,recent:[],blocked:false};
 // Item failures are isolated; repeated errors remain evidence, not a queue stop.
 health.blocked=false;
 const calls=()=>fs.readdirSync(path.join(root,'calls'),{withFileTypes:true}).filter(d=>d.isDirectory()&&fs.existsSync(path.join(root,'calls',d.name,'intent.json'))&&!read('calls/'+d.name+'/intent.json').revalidatedFrom).length;
 await runPool(Policy.ordered(targets.map(t=>({...t,questionId:t.question_id}))),{concurrency,shouldStop:()=>fs.existsSync(path.join(root,'stop.request'))},async target=>{
  if(fs.existsSync(path.join(root,'stop.request')))throw Error('operator_stop_requested');
  const entryFile='entries/'+target.questionId+'.json',waitStarted=Date.now();
  while(!fs.existsSync(path.join(root,entryFile))){
   if(fs.existsSync(path.join(root,'stop.request')))throw Error('operator_stop_requested');
   if(Date.now()-waitStarted>15*60*1000)throw Error('input_not_ready:'+target.questionId);
   await new Promise(resolve=>setTimeout(resolve,2000));
  }
  const entry=read(entryFile),source=read('snapshot/'+target.questionId+'.json');
  if(entry.questionId!==target.questionId||entry.revisionId!==target.revision_id||entry.catalogHash!==I.hash(source.catalog)||![P.version,...(approval.preparedProfileVersions||[])].includes(entry.profileVersion))throw Error('input_integrity_mismatch');
  const resultFile='results/'+entry.questionId+'.json';
  if(fs.existsSync(path.join(root,resultFile))){const result=read(resultFile);if(result.question_revision_id!==entry.revisionId||result.profile_version!==P.version||result.input_identity!==P.inputIdentity(entry))throw Error('staged_result_changed');counts[result.final_status==='complete'?'completed':'failed']++;counts.reused++;if(result.final_status!=='complete')write('failures/'+entry.questionId+'.json',Failures.failureRecord(entry,result.failure_reason,{stage:result.final_stage,status:'failed'}));return;}
  const failureFile='failures/'+entry.questionId+'.json';
  if(fs.existsSync(path.join(root,failureFile))){Failures.verifySaved(entry,read(failureFile));counts.unresolved++;log({phase:'item_failure_reused',questionId:entry.questionId,...counts});return;}
  if(resume[entry.questionId]){
   const decision=resume[entry.questionId];if(!/^[a-f0-9]{64}$/.test(decision.cacheKey))throw Error('invalid_resume_cache_key');
   const pending=require('../app/difficulty-v121/resume.cjs').verifyDeferred(entry,decision,read('calls/'+decision.cacheKey+'/result.json'));
   write(failureFile,Failures.failureRecord(entry,pending.reason,{result:read('calls/'+decision.cacheKey+'/result.json')}));
   counts.unresolved++;log({phase:'unknown_result_deferred',...pending});
   publish('running',{dispatched:calls()});return;
  }
  if(documentId!==entry.source.documentId){documentId=entry.source.documentId;log({phase:'exam_started',documentId,counts,dispatched:calls()});}
  const readCurrent=async()=>{
   const [[c],children,[q]]=await Promise.all([
    storage.rows('bank_catalog','revision_id=eq.'+entry.revisionId),
    storage.rows('bank_revisions','parent_id=eq.'+entry.revisionId+'&committed=eq.true&select=id'),
    storage.rows('bank_questions','id=eq.'+entry.questionId+'&select=id,archived')]);
   if(!c||q?.archived!==false||children.length||I.hash(c)!==entry.catalogHash)throw Error('source_or_review_changed:'+entry.questionId);
   return {revisionId:entry.revisionId,contentHash:entry.input.contentHash};
  };
  const outcome=await Failures.attempt(entry,observe=>Run.evaluateEntry(entry,{readCurrent,
   runStage:async(e,n,stage)=>{
    // Count intents, including unknown outcomes. Cached stages consume no new call.
    const selected=Sub.profile(P.id,stage.id),key=I.hash({inputVersion:e.input.inputVersion,evaluationVersion:selected.evaluationVersion,identity:P.inputIdentity(e)});
    if(!fs.existsSync(path.join(root,'calls',key,'result.json'))&&calls()>=approval.maximumCalls)throw Error('approved_call_budget_exhausted');
    log({phase:'stage_started',questionId:e.questionId,stage:n,model:stage.model,effort:stage.effort,dispatched:calls()});
    activeStages.set(e.questionId,{questionId:e.questionId,stage:n,model:stage.model,startedAt:new Date().toISOString()});publish('running',{dispatched:calls()});
    return Sub.runOne(e,{executable,outputRoot:path.join(root,'calls'),scoringProfile:P.id,executionProfile:stage.id});
   },saveStage:async(e,n,r)=>{
    observe(n,r);
    activeStages.delete(e.questionId);
    const reason=r.validation?.reason||r.computed?.reason||null;
    log({phase:'stage_saved',questionId:e.questionId,stage:n,status:r.status,reason,confirmed:r.evidence?.completed===true});
    if(['schema_invalid','invalid_response','graph_or_scorer_invalid'].includes(reason)){
     health.recent=[...health.recent.filter(x=>x.questionId!==e.questionId),{questionId:e.questionId,reason}].slice(-3);
     health.blocked=health.recent.length===3&&health.recent.every(x=>x.reason===reason);
    }else health.recent=[];
    health.blocked=false;write(healthFile,health);
   }}),async failure=>write(failureFile,failure));
  activeStages.delete(entry.questionId);
  if(outcome.failure){counts.unresolved++;publish('running',{dispatched:calls()});log({phase:'item_deferred',questionId:entry.questionId,reason:outcome.failure.reason,...counts,dispatched:calls()});return;}
  const result=outcome.result;
  write(resultFile,{...result,evaluation_run_id:job.id,profile_version:P.version,input_identity:P.inputIdentity(entry),completed_at:new Date().toISOString()});
  if(result.final_status!=='complete')write(failureFile,Failures.failureRecord(entry,result.failure_reason,{stage:result.final_stage,status:'failed'}));
  counts[result.final_status==='complete'?'completed':'failed']++;
  publish('running',{dispatched:calls()});log({phase:'item_saved',...counts,dispatched:calls()});
 });
 const finalStatus=counts.unresolved?'staging_incomplete':'staging_complete';
 publish(finalStatus,{dispatched:calls()});log({phase:finalStatus,...counts,dispatched:calls(),productionWrites:0});
}catch(e){const message=Failures.redact(e.message);write('run-status.json',{status:'blocked',...counts,reason:message,updatedAt:new Date().toISOString()});log({phase:'blocked',...counts,reason:message});process.exitCode=1;}finally{if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(path.join(root,'runner.lock'));}app.exit(process.exitCode||0);}});
