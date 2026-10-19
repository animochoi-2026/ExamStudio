'use strict';
const fs=require('node:fs'),path=require('node:path');
const {app,safeStorage}=require('electron');
const root=path.resolve(process.argv[2]||path.join(__dirname,'../artifacts/difficulty-v121'));
const round=path.join(root,'retry-20261019-1'),data='C:/Users/reals/Desktop/문제생성기/data/r2-current';
app.setPath('userData',path.join(data,'desktop'));app.setPath('sessionData',path.join(data,'desktop/session'));
const I=require('../app/difficulty-v12/input.cjs'),P=require('../app/difficulty-v121/profile.cjs'),R=require('../app/difficulty-v121/retry.cjs');
const Run=require('../app/difficulty-v121/run.cjs'),Policy=require('../app/difficulty-v121/policy.cjs'),Sub=require('../app/difficulty-v12/subscription.cjs'),F=require('../app/difficulty-v121/failures.cjs');
const {runPool}=require('../app/difficulty-v121/pool.cjs');
const read=file=>R.read(path.join(round,file));
function write(file,value){const target=path.join(round,file);fs.writeFileSync(target+'.tmp',JSON.stringify(value));fs.renameSync(target+'.tmp',target);}
function log(value){const line=JSON.stringify({at:new Date().toISOString(),...value})+'\n';fs.appendFileSync(path.join(round,'progress.jsonl'),line);try{process.stdout.write(line);}catch{}}
for(const stream of [process.stdout,process.stderr])stream.on('error',()=>{});
let lock,started=false,counts={completed:0,failed:0,unresolved:0,total:0,reusedStages:0,dispatched:0};const active=new Map();
function publish(status,extra={}){write('run-status.json',{status,...counts,concurrency:3,activeStages:[...active.values()],...extra,updatedAt:new Date().toISOString()});}
app.whenReady().then(async()=>{try{
 const manifest=read('manifest.json'),approval=read('approval.json');
 if(approval.granted!==true||approval.manifestHash!==I.hash(manifest)||manifest.profileVersion!==P.version||manifest.promptHash!==P.promptHash||manifest.schemaHash!==P.schemaHash||I.hash(manifest.stages)!==I.hash(Policy.stages)||approval.maximumCalls!==manifest.rows.length*3||approval.concurrency!==3||approval.automaticRetries!==0)throw Error('retry_approval_integrity_mismatch');
 if(fs.existsSync(path.join(root,'runner.lock')))throw Error('original_runner_lock_present');
 R.checkProtected(root,manifest);
 lock=fs.openSync(path.join(round,'runner.lock'),'wx');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,at:new Date().toISOString(),roundId:manifest.roundId}));
 // Persistent one-shot guard survives process failure and prevents heartbeat relaunch.
 fs.writeFileSync(path.join(round,'started.json'),JSON.stringify({pid:process.pid,at:new Date().toISOString(),manifestHash:approval.manifestHash}),{flag:'wx'});started=true;
 for(const dir of ['calls','results','failures','stage-reuse'])fs.mkdirSync(path.join(round,dir),{recursive:true});
 counts.total=manifest.rows.length;
 const executable=require('../app/codex.cjs').findCodex();Sub.assertSubscription(executable);
 const auth=new(require('../app/shared-bank-auth.cjs').SharedBankAuth)({directory:path.join(data,'shared-bank-auth'),safeStorage});
 const storage=new(require('../app/shared-bank-storage.cjs').SharedBankStorage)({auth});
 publish('running');log({phase:'round_started',roundId:manifest.roundId,...counts,maximumCalls:approval.maximumCalls,productionWrites:0});
 await runPool(Policy.ordered(manifest.rows),{concurrency:3,shouldStop:()=>fs.existsSync(path.join(round,'stop.request'))},async target=>{
  const file=path.join(root,'entries',target.questionId+'.json');
  if(R.digest(file)!==target.entryHash)throw Error('retry_entry_integrity_mismatch');
  const entry=R.read(file);R.checkTarget(entry,target,manifest.successIds);
  const readCurrent=async()=>{
   const [[c],children,[q]]=await Promise.all([storage.rows('bank_catalog','revision_id=eq.'+entry.revisionId),storage.rows('bank_revisions','parent_id=eq.'+entry.revisionId+'&committed=eq.true&select=id'),storage.rows('bank_questions','id=eq.'+entry.questionId+'&select=id,archived')]);
   if(!c||q?.archived!==false||children.length||I.hash(c)!==entry.catalogHash)throw Error('source_or_review_changed:'+entry.questionId);
   return {revisionId:entry.revisionId,contentHash:entry.input.contentHash};
  };
  let lastStage=null,lastResult=null;
  const out=await F.attempt(entry,observe=>Run.evaluateEntry(entry,{readCurrent,runStage:async(e,n,stage)=>{
   R.checkTarget(e,target,manifest.successIds);
   // Check current original success again at the call boundary.
   const originalFile=path.join(root,'results',e.questionId+'.json');
   if(fs.existsSync(originalFile)&&R.read(originalFile).final_status==='complete')throw Error('integrity_success_recall_forbidden');
   const old=target.stages[n-1],key=R.keyFor(e,n);
   if(old.key!==key)throw Error('retry_stage_integrity_mismatch');
   if(old.file&&R.digest(path.join(root,old.file))!==manifest.protectedFiles[old.file])throw Error('original_response_integrity_mismatch');
   const plan=R.planStage(old.file?R.read(path.join(root,old.file)):null,e,n,target.terminalStage);
   if(plan.action==='reuse'){
    counts.reusedStages++;write('stage-reuse/'+e.questionId+'-'+n+'.json',{questionId:e.questionId,stage:n,originalCallKey:key,result:plan.result});
    log({phase:'stage_reused',questionId:e.questionId,stage:n,key,reason:plan.result.validation?.reason||null});return plan.result;
   }
   if(counts.dispatched>=approval.maximumCalls)throw Error('approved_call_budget_exhausted');
   const reservation=path.join(round,'calls',key+'.reservation.json');
   fs.writeFileSync(reservation,JSON.stringify({roundId:manifest.roundId,questionId:e.questionId,stage:n,key,at:new Date().toISOString()}),{flag:'wx'});
   counts.dispatched++;
   active.set(e.questionId,{questionId:e.questionId,stage:n,model:stage.model,startedAt:new Date().toISOString()});
   log({phase:'stage_started',questionId:e.questionId,stage:n,model:stage.model,effort:stage.effort,key,dispatched:counts.dispatched});publish('running');
   return Sub.runOne(e,{executable,outputRoot:path.join(round,'calls'),scoringProfile:P.id,executionProfile:stage.id});
  },saveStage:async(e,n,r)=>{lastStage=n;lastResult=r;observe(n,r);active.delete(e.questionId);log({phase:'stage_saved',questionId:e.questionId,stage:n,reason:r.validation?.reason||r.computed?.reason||null});publish('running');}}),async f=>write('failures/'+entry.questionId+'.json',f));
  active.delete(entry.questionId);
  if(out.failure)counts.unresolved++;
  else{
   write('results/'+entry.questionId+'.json',{...out.result,evaluation_run_id:manifest.roundId,original_evaluation_run_id:manifest.originalJob,profile_version:P.version,input_identity:P.inputIdentity(entry),completed_at:new Date().toISOString()});
   if(out.result.final_status==='complete')counts.completed++;
   else{counts.failed++;write('failures/'+entry.questionId+'.json',{...F.failureRecord(entry,out.result.failure_reason,{stage:lastStage,result:lastResult,status:'failed'}),validation:lastResult?.validation||null,errorMessage:[out.result.failure_reason,lastResult?.validation?.detail||lastResult?.computed?.detail].filter(Boolean).join(': '),errorOrigin:'local_validation'});}
  }
  publish('running');log({phase:'item_saved',questionId:entry.questionId,...counts});
 });
 R.checkProtected(root,manifest);
 publish('retry_finished',{originalFilesUnchanged:true,productionWrites:0});log({phase:'retry_finished',...counts,originalFilesUnchanged:true,productionWrites:0});
}catch(e){if(started){publish('blocked',{reason:F.redact(e.message)});log({phase:'blocked',reason:F.redact(e.message),...counts});}else process.stderr.write(F.redact(e.message)+'\n');process.exitCode=1;}
finally{if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(path.join(round,'runner.lock'));}app.exit(process.exitCode||0);}});
