'use strict';
// Explicit user approval, 2026-10-19: only the three source-reviewed AI-needed items.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const I=require('../app/difficulty-v12/input.cjs'),P=require('../app/difficulty-v121/profile.cjs'),R=require('../app/difficulty-v121/retry.cjs');
const Sub=require('../app/difficulty-v12/subscription.cjs'),Policy=require('../app/difficulty-v121/policy.cjs'),Run=require('../app/difficulty-v121/run.cjs'),F=require('../app/difficulty-v121/failures.cjs');
const {runPool}=require('../app/difficulty-v121/pool.cjs');
const root=path.resolve(__dirname,'../artifacts/difficulty-v121'),roundId='reviewed-three-20261019-1',round=path.join(root,roundId);
const ids=['63582f1b-fbf2-466a-8f4d-4f6f3660b44a','9b049a06-b2ba-4b7b-a909-5ef7dd7d46ef','f2ff56dd-dda1-467d-b496-91ea56dbbb5f'];
const read=f=>R.read(path.join(round,f));
const write=(f,v)=>{const p=path.join(round,f);fs.writeFileSync(p+'.tmp',JSON.stringify(v,null,2));fs.renameSync(p+'.tmp',p);};
function processesClear(){const s=execFileSync('powershell.exe',['-NoProfile','-Command',"@(Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'electron.exe' -and $_.CommandLine -match 'run-difficulty-v121' -and $_.ProcessId -ne "+process.pid+") -or ($_.Name -eq 'codex.exe' -and $_.CommandLine -match 'examstudio-v12-') } | Select-Object ProcessId,Name) | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true});const p=JSON.parse(s||'[]');if((Array.isArray(p)?p:[p]).length)throw Error('existing_evaluation_process_present');}
if(process.argv.includes('--prepare')){
 processesClear();for(const p of ['runner.lock','retry-20261019-1/runner.lock'])assert(!fs.existsSync(path.join(root,p)),'old lock present');
 const audit=R.read(path.join(root,'source-review-20261019/audit.json')),prior=R.read(path.join(root,'saved-validation-20261019/audit.json'));
 assert.deepEqual(audit.items.filter(x=>x.category==='ai_needed').map(x=>x.questionId),ids);
 const protectedFiles={...audit.protectedFiles};
 const walk=d=>{for(const f of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,f.name);if(f.isDirectory())walk(p);else protectedFiles[path.relative(root,p).replaceAll('\\','/')]=R.digest(p);}};walk(path.join(root,'source-review-20261019'));
 const successIds=R.read(path.join(root,'targets.json')).rows.map(t=>t.question_id).filter(id=>!prior.remaining.some(x=>x.questionId===id)||audit.items.some(x=>x.questionId===id&&x.category==='local_repair'));
 assert.equal(successIds.length,1251);
 const rows=ids.map((id,i)=>{const e=R.read(path.join(root,'entries',id+'.json')),old=prior.remaining.find(x=>x.questionId===id),first=old.provenance.find(x=>x.stage===1);return {questionId:id,revisionId:e.revisionId,entryHash:R.digest(path.join(root,'entries',id+'.json')),identity:P.inputIdentity(e),source:e.source,startingStage:i===2?1:2,stage1File:first?.file??null,review:audit.items.find(x=>x.questionId===id).finding};});
 const manifest={roundId,createdAt:new Date().toISOString(),authorization:'그럼 AI 평가가 필요한 3문항만 기존 방식으로 다시 처리해줘. 성공한 문제는 건드리지 말고, 나머지 12문항은 원문에서 뭘 확인해야 하는지 여기서 보여줘.',rows,successIds,protectedFiles,profileVersion:P.version,promptHash:P.promptHash,schemaHash:P.schemaHash,stages:Policy.stages,maximumCalls:7,concurrency:3,automaticRetries:0,processCheck:{clear:true,checkedAt:new Date().toISOString()}};
 R.checkProtected(root,manifest);fs.mkdirSync(round);
 fs.writeFileSync(path.join(round,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 fs.writeFileSync(path.join(round,'approval.json'),JSON.stringify({granted:true,manifestHash:I.hash(manifest),maximumCalls:7,concurrency:3,automaticRetries:0,authorization:manifest.authorization}),{flag:'wx'});
 write('run-status.json',{status:'prepared',total:3,completed:0,failed:0,unresolved:0,dispatched:0});
 console.log(JSON.stringify({roundId,targets:3,maximumCalls:7,preservedSuccesses:successIds.length}));
}else{
 const {app,safeStorage}=require('electron'),data='C:/Users/reals/Desktop/문제생성기/data/r2-current';
 app.setPath('userData',path.join(data,'desktop'));app.setPath('sessionData',path.join(data,'desktop/session'));
 const counts={total:3,completed:0,failed:0,unresolved:0,dispatched:0,reusedStages:0},active=new Map();let lock,started=false;
 const log=v=>{const s=JSON.stringify({at:new Date().toISOString(),...v});fs.appendFileSync(path.join(round,'progress.jsonl'),s+'\n');try{console.log(s);}catch{}};
 const publish=(status,extra={})=>write('run-status.json',{status,...counts,activeStages:[...active.values()],updatedAt:new Date().toISOString(),...extra});
 app.whenReady().then(async()=>{try{
  const m=read('manifest.json'),a=read('approval.json');
  assert(a.granted&&a.manifestHash===I.hash(m)&&m.profileVersion===P.version&&m.promptHash===P.promptHash&&m.schemaHash===P.schemaHash,'approval integrity mismatch');
  assert.deepEqual(m.rows.map(x=>x.questionId),ids);assert.deepEqual(m.stages,Policy.stages);assert.equal(m.maximumCalls,7);assert.equal(m.concurrency,3);assert.equal(m.automaticRetries,0);
  processesClear();R.checkProtected(root,m);
  lock=fs.openSync(path.join(round,'runner.lock'),'wx');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,roundId,at:new Date().toISOString()}));
  fs.writeFileSync(path.join(round,'started.json'),JSON.stringify({pid:process.pid,manifestHash:a.manifestHash,at:new Date().toISOString()}),{flag:'wx'});started=true;
  for(const d of ['calls','results','failures','stage-reuse'])fs.mkdirSync(path.join(round,d),{recursive:true});
  const executable=require('../app/codex.cjs').findCodex();Sub.assertSubscription(executable);
  const auth=new(require('../app/shared-bank-auth.cjs').SharedBankAuth)({directory:path.join(data,'shared-bank-auth'),safeStorage});
  const storage=new(require('../app/shared-bank-storage.cjs').SharedBankStorage)({auth});
  publish('running');log({phase:'round_started',maximumCalls:7,concurrency:3});
  await runPool(m.rows,{concurrency:3},async t=>{
   const e=R.read(path.join(root,'entries',t.questionId+'.json'));assert.equal(R.digest(path.join(root,'entries',t.questionId+'.json')),t.entryHash);R.checkTarget(e,t,m.successIds);
   const readCurrent=async()=>{const [[c],children,[q]]=await Promise.all([storage.rows('bank_catalog','revision_id=eq.'+e.revisionId),storage.rows('bank_revisions','parent_id=eq.'+e.revisionId+'&committed=eq.true&select=id'),storage.rows('bank_questions','id=eq.'+e.questionId+'&select=id,archived')]);if(!c||q?.archived!==false||children.length||I.hash(c)!==e.catalogHash)throw Error('source_or_review_changed:'+e.questionId);return {revisionId:e.revisionId,contentHash:e.input.contentHash};};
   let lastStage,lastResult;
   const out=await F.attempt(e,observe=>Run.evaluateEntry(e,{readCurrent,runStage:async(entry,n,stage)=>{
    R.checkTarget(entry,t,m.successIds);
    if(n<t.startingStage){
     const saved=R.read(path.join(root,t.stage1File));assert.equal(R.digest(path.join(root,t.stage1File)),m.protectedFiles[t.stage1File]);
     const result=R.revalidate(saved,e);assert(result,'missing stage1 saved evidence');
     // Keep original raw and usage. Local review rejects this route; no hints or
     // stored answers are supplied to the next independent model evaluation.
     result.validation={valid:false,solution_validated:false,reason:'source_review_requires_new_route'};
     result.computed={status:'failed',score:null,problem_tier:null,reason:'source_review_requires_new_route'};
     result.localReview={originalFile:t.stage1File,reason:t.review};counts.reusedStages++;
     write('stage-reuse/'+e.questionId+'-1.json',result);log({phase:'stage_reused',questionId:e.questionId,stage:n});return result;
    }
    if(counts.dispatched>=7)throw Error('approved_call_budget_exhausted');
    const key=R.keyFor(e,n);fs.writeFileSync(path.join(round,'calls',key+'.reservation.json'),JSON.stringify({roundId,questionId:e.questionId,stage:n,key,at:new Date().toISOString()}),{flag:'wx'});
    counts.dispatched++;active.set(e.questionId,{questionId:e.questionId,stage:n,model:stage.model,startedAt:new Date().toISOString()});publish('running');log({phase:'stage_started',questionId:e.questionId,stage:n,model:stage.model,effort:stage.effort,key,dispatched:counts.dispatched});
    return Sub.runOne(e,{executable,outputRoot:path.join(round,'calls'),scoringProfile:P.id,executionProfile:stage.id});
   },saveStage:async(entry,n,r)=>{lastStage=n;lastResult=r;observe(n,r);active.delete(e.questionId);log({phase:'stage_saved',questionId:e.questionId,stage:n,validation:r.validation,errors:r.evidence?.errors});publish('running');}}),async failure=>write('failures/'+e.questionId+'.json',failure));
   active.delete(e.questionId);
   if(out.failure)counts.unresolved++;
   else{write('results/'+e.questionId+'.json',{...out.result,evaluation_run_id:roundId,profile_version:P.version,input_identity:P.inputIdentity(e),completed_at:new Date().toISOString()});if(out.result.final_status==='complete')counts.completed++;else{counts.failed++;write('failures/'+e.questionId+'.json',{...F.failureRecord(e,out.result.failure_reason,{stage:lastStage,result:lastResult,status:'failed'}),validation:lastResult?.validation,errorMessage:[out.result.failure_reason,lastResult?.validation?.detail].filter(Boolean).join(': ')});}}
   publish('running');log({phase:'item_saved',questionId:e.questionId,...counts});
  });
  R.checkProtected(root,m);assert.equal(counts.completed+counts.failed+counts.unresolved,3);
  publish('finished',{originalFilesUnchanged:true,productionWrites:0});log({phase:'finished',...counts,originalFilesUnchanged:true});
 }catch(err){if(started){publish('blocked',{reason:F.redact(err.message)});log({phase:'blocked',reason:F.redact(err.message)});}else console.error(F.redact(err.message));process.exitCode=1;}finally{if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(path.join(round,'runner.lock'));}app.exit(process.exitCode||0);}});
}
