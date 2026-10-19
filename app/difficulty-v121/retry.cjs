'use strict';
// One explicitly authorized follow-up. Original calls/results are read-only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const I=require('../difficulty-v12/input.cjs'),P=require('./profile.cjs'),Policy=require('./policy.cjs'),Sub=require('../difficulty-v12/subscription.cjs');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function keyFor(entry,n){return I.hash({inputVersion:entry.input.inputVersion,evaluationVersion:Sub.profile(P.id,Policy.stages[n-1].id).evaluationVersion,identity:P.inputIdentity(entry)});}
function checkTarget(entry,target,successIds){
 if(successIds.includes(entry.questionId))throw Error('integrity_success_recall_forbidden');
 if(entry.questionId!==target.questionId||entry.revisionId!==target.revisionId||P.inputIdentity(entry)!==target.identity)throw Error('retry_target_integrity_mismatch');
}
function revalidate(result,entry){
 if(!result?.raw||!result.evidence?.completed||result.evidence.failed||result.evidence.exitCode!==0)return null;
 return {...result,...P.evaluate(structuredClone(result.raw),entry.validationContext)};
}
function planStage(original,entry,n,terminalStage){
 const evaluated=revalidate(original,entry);
 // Earlier completed stages retain the original escalation path. Only the failed
 // terminal stage (or an unconfirmed execution) needs a replacement response.
 if(evaluated&&(n<terminalStage||Policy.decide(3,evaluated).status==='complete'))return {action:'reuse',result:evaluated};
 return {action:'call'};
}
function checkProtected(root,manifest){
 for(const [file,hash] of Object.entries(manifest.protectedFiles))if(digest(path.join(root,file))!==hash)throw Error('first_pass_integrity_changed:'+file);
}
function buildManifest(root,{roundId,processCheck}){
 if(!processCheck?.clear||!processCheck.checkedAt)throw Error('original_process_check_required');
 if(fs.existsSync(path.join(root,'runner.lock')))throw Error('original_runner_lock_present');
 const status=read(path.join(root,'run-status.json')),targets=read(path.join(root,'targets.json')).rows;
 if(!['staging_complete','staging_incomplete'].includes(status.status)||status.completed+status.failed+status.unresolved!==targets.length)throw Error('first_pass_not_finished');
 const protectedFiles={},successIds=[],rows=[],reasons={};
 for(const file of ['run-status.json','job.json','execution-approval.json','targets.json','snapshot-manifest.json','progress.jsonl'])protectedFiles[file]=digest(path.join(root,file));
 let completed=0,failed=0,unresolved=0;
 for(const t of targets){
  const id=t.question_id,rf='results/'+id+'.json',ff='failures/'+id+'.json';
  const result=fs.existsSync(path.join(root,rf))?read(path.join(root,rf)):null;
  if(result)protectedFiles[rf]=digest(path.join(root,rf));
  if(result?.final_status==='complete'){completed++;successIds.push(id);continue;}
  if(!fs.existsSync(path.join(root,ff)))throw Error('unaccounted_first_pass_item:'+id);
  protectedFiles[ff]=digest(path.join(root,ff));
  const failure=read(path.join(root,ff)),entry=read(path.join(root,'entries',id+'.json'));
  if(entry.revisionId!==t.revision_id||failure.inputIdentity!==P.inputIdentity(entry)||failure.profileVersion!==P.version)throw Error('retry_input_integrity_mismatch');
  if(result)failed++;else unresolved++;
  const stage=result?.final_stage||failure.stage||[1,2,3].find(n=>keyFor(entry,n)===failure.cacheKey);
  if(![1,2,3].includes(stage))throw Error('failure_stage_unknown:'+id);
  const row={questionId:id,revisionId:entry.revisionId,identity:P.inputIdentity(entry),entryHash:digest(path.join(root,'entries',id+'.json')),terminalStage:stage,originalStatus:result?'failed':'unresolved',reason:failure.reason,source:entry.source,stages:[]};
  for(let n=1;n<=3;n++){
   const key=keyFor(entry,n),file='calls/'+key+'/result.json',intent='calls/'+key+'/intent.json';
   const saved=fs.existsSync(path.join(root,file))?read(path.join(root,file)):null;
   if(saved)protectedFiles[file]=digest(path.join(root,file));
   if(fs.existsSync(path.join(root,intent)))protectedFiles[intent]=digest(path.join(root,intent));
   const plan=planStage(saved,entry,n,stage);
   row.stages.push({stage:n,key,file:saved?file:null,action:plan.action,originalReason:saved?.validation?.reason||saved?.computed?.reason||null,errors:saved?.evidence?.errors||[],diagnostic:saved?.evidence?.diagnostic||null,threadId:saved?.evidence?.threadId||null,evidence:saved?{completed:saved.evidence?.completed,exitCode:saved.evidence?.exitCode}:null});
  }
  reasons[row.reason]=(reasons[row.reason]||0)+1;rows.push(row);
 }
 if(completed!==status.completed||failed!==status.failed||unresolved!==status.unresolved)throw Error('first_pass_count_integrity_mismatch');
 return {schema:1,roundId,createdAt:new Date().toISOString(),originalJob:read(path.join(root,'job.json')).id,firstPass:{completed,failed,unresolved,total:targets.length},profileVersion:P.version,promptHash:P.promptHash,schemaHash:P.schemaHash,stages:Policy.stages,concurrency:3,maximumCalls:rows.length*3,automaticRetries:0,authorization:'다 끝나면 실패한 문제랑 결과 미확인 문제만 모아서 원인 확인하고 다시 처리해줘. 성공한 문제는 다시 호출하지 말고.',processCheck,successIds,protectedFiles,reasons,rows};
}
module.exports={read,digest,keyFor,checkTarget,revalidate,planStage,checkProtected,buildManifest};
