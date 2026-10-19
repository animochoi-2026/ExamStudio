'use strict';
// One bounded local run. Original entries, responses and production data are read-only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const I=require('../app/difficulty-v12/input.cjs'),P=require('../app/difficulty-v121/intent-profile.cjs'),R=require('../app/difficulty-v121/retry.cjs');
const Sub=require('../app/difficulty-v12/subscription.cjs'),Policy=require('../app/difficulty-v121/policy.cjs'),Run=require('../app/difficulty-v121/run.cjs'),F=require('../app/difficulty-v121/failures.cjs'),{runPool}=require('../app/difficulty-v121/pool.cjs');
const root=path.resolve(__dirname,'../artifacts/difficulty-v121'),roundId='intended-answer-20261019',round=path.join(root,roundId);
const prefixes=['22a1','477c','4e6a','be44','fd9a','459a','9b04'];
const read=f=>R.read(path.join(round,f)),write=(f,v)=>{const p=path.join(round,f);fs.writeFileSync(p+'.tmp',JSON.stringify(v,null,2));fs.renameSync(p+'.tmp',p);};
function checkTarget(e,t,m){assert(!m.successIds.includes(e.questionId),'integrity_success_recall_forbidden');assert.equal(e.questionId,t.questionId);assert.equal(e.revisionId,t.revisionId);assert.equal(P.inputIdentity(e),t.identity,'target integrity');assert.equal(R.digest(path.join(round,t.entryFile)),t.entryHash,'entry integrity');assert.equal(R.digest(path.join(root,'entries',e.questionId+'.json')),e.localIntentReview.originalEntryHash,'original entry integrity');}
function processesClear(){const s=execFileSync('powershell.exe',['-NoProfile','-Command',"@(Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'electron.exe' -and $_.CommandLine -match 'run-difficulty-v121' -and $_.ProcessId -ne "+process.pid+") -or ($_.Name -eq 'codex.exe' -and $_.CommandLine -match 'examstudio-v12-') } | Select-Object ProcessId,Name) | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true});const p=JSON.parse(s||'[]');assert.equal((Array.isArray(p)?p:[p]).length,0,'existing evaluation process');for(const f of ['runner.lock','retry-20261019-1/runner.lock','reviewed-three-20261019-1/runner.lock'])assert(!fs.existsSync(path.join(root,f)),'existing evaluation lock');}
const m=read('manifest.json'),a=read('approval.json');
assert(a.granted&&a.manifestHash===I.hash(m)&&m.profileVersion===P.version&&m.promptHash===P.promptHash&&m.schemaHash===P.schemaHash,'approval integrity mismatch');
assert.deepEqual(m.rows.map(x=>x.questionId.slice(0,4)),prefixes);assert.deepEqual(m.stages,Policy.stages);assert.equal(m.maximumCalls,14);assert.equal(a.maximumCalls,14);assert.equal(m.concurrency,3);assert.equal(m.automaticRetries,0);
for(const t of m.rows){const e=read(t.entryFile);checkTarget(e,t,m);Sub.verifyInput(e.input);assert(t.oldStage1&&m.protectedFiles[t.oldStage1],'stage reuse provenance missing');}
if(process.argv.includes('--check')){R.checkProtected(root,m);processesClear();assert(!fs.existsSync(path.join(round,'started.json')),'already started');console.log(JSON.stringify({targets:m.rows.length,maximumCalls:m.maximumCalls,protectedFiles:Object.keys(m.protectedFiles).length,checks:'passed'}));}
else{
 const {app,safeStorage}=require('electron'),data='C:/Users/reals/Desktop/문제생성기/data/r2-current';
 app.setPath('userData',path.join(data,'desktop'));app.setPath('sessionData',path.join(data,'desktop/session'));
 const counts={total:7,completed:0,failed:0,unresolved:0,dispatched:0,reusedStages:0},active=new Map();let lock,started=false;
 const log=v=>{const s=JSON.stringify({at:new Date().toISOString(),...v});fs.appendFileSync(path.join(round,'progress.jsonl'),s+'\n');console.log(s);};
 const publish=(status,extra={})=>write('run-status.json',{status,...counts,localRecovered:6,activeStages:[...active.values()],updatedAt:new Date().toISOString(),...extra});
 app.whenReady().then(async()=>{try{
  processesClear();R.checkProtected(root,m);
  lock=fs.openSync(path.join(round,'runner.lock'),'wx');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,roundId,at:new Date().toISOString()}));
  fs.writeFileSync(path.join(round,'started.json'),JSON.stringify({pid:process.pid,manifestHash:a.manifestHash,at:new Date().toISOString()}),{flag:'wx'});started=true;
  for(const d of ['calls','results','failures','stage-reuse'])fs.mkdirSync(path.join(round,d),{recursive:true});
  const executable=require('../app/codex.cjs').findCodex();Sub.assertSubscription(executable);
  const auth=new(require('../app/shared-bank-auth.cjs').SharedBankAuth)({directory:path.join(data,'shared-bank-auth'),safeStorage});
  const storage=new(require('../app/shared-bank-storage.cjs').SharedBankStorage)({auth});
  publish('running');log({phase:'round_started',maximumCalls:14,concurrency:3});
  await runPool(m.rows,{concurrency:3},async t=>{
   const e=read(t.entryFile);checkTarget(e,t,m);
   const readCurrent=async()=>{const [[c],children,[q]]=await Promise.all([storage.rows('bank_catalog','revision_id=eq.'+e.revisionId),storage.rows('bank_revisions','parent_id=eq.'+e.revisionId+'&committed=eq.true&select=id'),storage.rows('bank_questions','id=eq.'+e.questionId+'&select=id,archived')]);if(!c||q?.archived!==false||children.length||I.hash(c)!==e.catalogHash)throw Error('source_or_review_changed:'+e.questionId);return {revisionId:e.revisionId,contentHash:e.input.contentHash};};
   let lastStage,lastResult;
   const out=await F.attempt(e,observe=>Run.evaluateEntry(e,{readCurrent,runStage:async(entry,n,stage)=>{
    checkTarget(entry,t,m);
    if(n<t.startingStage){const saved=R.read(path.join(root,t.oldStage1));assert.equal(R.digest(path.join(root,t.oldStage1)),m.protectedFiles[t.oldStage1]);const result=R.revalidate(saved,e);assert(result,'saved stage1 evidence missing');result.validation={valid:false,solution_validated:false,reason:'approved_intent_requires_new_route'};result.computed={status:'failed',score:null,problem_tier:null,reason:'approved_intent_requires_new_route'};result.localReview={originalFile:t.oldStage1,interpretation:t.interpretation};counts.reusedStages++;write('stage-reuse/'+e.questionId+'-1.json',result);return result;}
    if(counts.dispatched>=m.maximumCalls)throw Error('approved_call_budget_exhausted');
    const key=I.hash({inputVersion:e.input.inputVersion,evaluationVersion:Sub.profile(P.id,stage.id).evaluationVersion,identity:P.inputIdentity(e)});
    fs.writeFileSync(path.join(round,'calls',key+'.reservation.json'),JSON.stringify({roundId,questionId:e.questionId,stage:n,key,at:new Date().toISOString()}),{flag:'wx'});
    counts.dispatched++;active.set(e.questionId,{questionId:e.questionId,stage:n,model:stage.model,startedAt:new Date().toISOString()});publish('running');log({phase:'stage_started',questionId:e.questionId,stage:n,model:stage.model,effort:stage.effort,key,dispatched:counts.dispatched});
    return Sub.runOne(e,{executable,outputRoot:path.join(round,'calls'),scoringProfile:P.id,executionProfile:stage.id});
   },saveStage:async(entry,n,r)=>{lastStage=n;lastResult=r;observe(n,r);active.delete(e.questionId);log({phase:'stage_saved',questionId:e.questionId,stage:n,validation:r.validation,errors:r.evidence?.errors});publish('running');}}),async failure=>write('failures/'+e.questionId+'.json',failure));
   active.delete(e.questionId);
   if(out.failure)counts.unresolved++;
   else{write('results/'+e.questionId+'.json',{...out.result,evaluation_run_id:roundId,prompt_hash:P.promptHash,profile_version:P.version,input_identity:P.inputIdentity(e),localIntentReview:e.localIntentReview,notForAutomaticImport:true,completed_at:new Date().toISOString()});if(out.result.final_status==='complete')counts.completed++;else{counts.failed++;write('failures/'+e.questionId+'.json',{...F.failureRecord(e,out.result.failure_reason,{stage:lastStage,result:lastResult,status:'failed'}),profileVersion:P.version,inputIdentity:P.inputIdentity(e),validation:lastResult?.validation,errorMessage:[out.result.failure_reason,lastResult?.validation?.detail].filter(Boolean).join(': ')});}}
   publish('running');log({phase:'item_saved',questionId:e.questionId,...counts});
  });
  R.checkProtected(root,m);assert.equal(counts.completed+counts.failed+counts.unresolved,7);publish('finished',{originalFilesUnchanged:true,productionWrites:0});log({phase:'finished',...counts,originalFilesUnchanged:true});
 }catch(err){if(started){publish('blocked',{reason:F.redact(err.message)});log({phase:'blocked',reason:F.redact(err.message)});}else console.error(F.redact(err.message));process.exitCode=1;}finally{if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(path.join(round,'runner.lock'));}app.exit(process.exitCode||0);}});
}
