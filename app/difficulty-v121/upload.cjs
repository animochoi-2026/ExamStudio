'use strict';
const fs=require('node:fs'),path=require('node:path');
const I=require('../difficulty-v12/input.cjs'),Policy=require('./desktop-policy.cjs'),P=Policy.profile,Run=require('./run.cjs'),Sub=require('../difficulty-v12/subscription.cjs');
const Cache=require('../assessment-cache.cjs'),{prepared}=require('../difficulty-v12/upload.cjs');
const flights=new Map();
function preserve(bank,item){
 const difficulty=structuredClone(item.metadata.difficulty||{}),dir=path.join(bank.dir,'difficulty-v121','recovery'),file=path.join(dir,I.hash({questionId:item.id,priorDifficulty:difficulty})+'.json');
 fs.mkdirSync(dir,{recursive:true});if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({questionId:item.id,at:new Date().toISOString(),difficulty}),{flag:'wx'});
}
function bind(record,entry,identity){
 if(record.question_id===entry.questionId&&record.question_revision_id===entry.revisionId&&record.input_identity===identity)return structuredClone(record);
 return {...structuredClone(record),question_id:entry.questionId,question_revision_id:entry.revisionId,input_identity:identity,
  reuse_provenance:record.reuse_provenance||{evaluation_id:record.evaluation_id,question_id:record.question_id,question_revision_id:record.question_revision_id,input_identity:record.input_identity}};
}
function locate(store,projectId,questionId){const project=store.get(projectId),p=project.problems.find(p=>[p.original,...p.variants||[]].some(q=>q?.id===questionId)),q=[p?.original,...p?.variants||[]].find(q=>q?.id===questionId);if(!q)throw Error('평가 대상 문항이 없습니다.');return {project,p,q};}
async function capture({bank,store,projectId,questionId}){
 const {project,p,q}=locate(store,projectId,questionId),input=await prepared(q,p,project.scope),item=bank.ensure(project,p,q);
 return {id:questionId,questionId:item.id,revisionId:item.baseRevisionId||'local:'+input.contentHash,input,
  validationContext:{scope:input.payload.curriculum_scope,storedAnswer:q.answer,choices:q.choices||[],requiresImage:!!(q.diagram||q.observedDiagram||q.sourceFigure?.path||q.sourceFigures?.length),imageCount:input.images.length}};
}
async function evaluate(options){
 const {bank,store,projectId,questionId,savedOnly=false,runStage}=options;
 const entry=await capture(options),identity=P.inputIdentity(entry),reuseKey=Policy.reuseIdentity(entry),current=locate(store,projectId,questionId),item=bank.ensure(current.project,current.p,current.q);
 const cacheDir=path.join(bank.dir,'difficulty-v121','results'),cacheFile=path.join(cacheDir,reuseKey+'.json');
 let prior=item.metadata.difficulty?.v121Latest;
 if(prior?.profileVersion===P.version&&prior.record?.reuse_key===reuseKey){preserve(bank,item);prior.record=bind(prior.record,entry,identity);prior.identity=identity;}
 if(prior?.identity!==identity&&fs.existsSync(cacheFile)){
  const cached=JSON.parse(fs.readFileSync(cacheFile,'utf8'));
  if(cached.reuse_key===reuseKey&&cached.profile_version===P.version&&['complete','failed'].includes(cached.final_status)){
   preserve(bank,item);const record=bind(cached,entry,identity);
   item.metadata.difficulty={scope:structuredClone(current.project.scope),isReference:!!item.metadata.difficulty?.isReference,criteriaVersion:'insight-bottleneck-v1.2.1',reassessmentRequired:false,auto_score:record.final_score,auto_tier:record.final_tier,auto_evaluation_id:record.evaluation_id,effective_score:record.final_score,effective_score_source:'auto',userScore:null,teacherBand:null,teacher_override_active:false,teacher_override_score:null,
    v121Latest:{identity,profileVersion:P.version,record}};prior=item.metadata.difficulty.v121Latest;
  }
 }
 if(item.baseRevisionId&&bank.storage?.kind==='shared'&&bank.storage.rows){
  const rows=await bank.storage.rows('bank_catalog','revision_id=eq.'+item.baseRevisionId);
  if(rows.length!==1||rows[0].question_id!==entry.questionId)throw Error('기존 문항의 난이도 평가 상태를 확인하지 못했습니다.');
  const remote=rows[0],d=remote.metadata?.difficulty||{},record=d.v121Active||d.v121Latest?.record;
  const remoteIdentity=record?.input_identity||d.v121Latest?.identity;
  if((remoteIdentity===identity||record?.reuse_key===reuseKey)&&(record?.profile_version||d.v121Latest?.profileVersion)===P.version&&['complete','failed'].includes(record?.final_status)&&!d.reassessmentRequired){
   const basis=Cache.basis(current.q,current.p,current.project.scope);
   preserve(bank,item);item.metadata.difficulty={...structuredClone(d),v121Active:null,v121Latest:{identity,profileVersion:P.version,inputVersion:entry.input.inputVersion,inputBasis:basis,record:bind(record,entry,identity)}};
   // A teacher adjustment made AFTER cutover remains valid on the same input.
   if(remote.confirmed?.difficulty!=null)item.metadata.difficulty.userScore=remote.confirmed.difficulty;
   prior=item.metadata.difficulty.v121Latest;
  }
 }
 if(prior?.identity===identity&&['complete','failed'].includes(prior.record?.final_status)){
  const basis=Cache.basis(current.q,current.p,current.project.scope);
  prior.inputBasis=basis;item.metadata.analysis={...item.metadata.analysis,status:'complete',basis,criteriaVersion:'insight-bottleneck-v1.2.1',error:null};item.metadata.difficulty.reassessmentRequired=false;item.hasLocalChanges=true;item.status='local';bank.save();if(bank.state?.auto)bank.markDirty(projectId,questionId);
  bank.onEvent?.({type:'difficulty-stage',taskKind:'difficulty_evaluation',questionId,reused:true,finalStage:prior.record.final_stage,evaluationVersion:P.version,model:prior.record.final_model,reasoningEffort:prior.record.final_reasoning_effort});
  return {reused:true,status:prior.record.final_status};
 }
 if(savedOnly)throw Error('동일 원문·그림·평가 버전의 저장 결과가 없습니다.');
 const key=path.resolve(bank.dir)+':'+reuseKey;
 if(!flights.has(key)){
  const promise=(async()=>{
   const outputRoot=path.join(bank.dir,'difficulty-v121','calls');fs.mkdirSync(outputRoot,{recursive:true});
   let executable;if(!runStage){executable=require('../codex.cjs').findCodex();Sub.assertSubscription(executable);}
   return Run.evaluateEntry(entry,{profile:P,runStage:runStage||((e,n,stage)=>Sub.runOne(e,{executable,outputRoot,scoringProfile:P.id,executionProfile:stage.id})),
    readCurrent:async()=>{const now=await capture(options);if(P.inputIdentity(now)!==identity)throw Error('평가 중 원문·그림·정답이 변경되었습니다.');return {revisionId:now.revisionId,contentHash:now.input.contentHash};},
    saveStage:async(e,n,r)=>bank.onEvent?.({type:'difficulty-stage',taskKind:'difficulty_evaluation',questionId,stage:n,model:Policy.stages[n-1].model,reasoningEffort:Policy.stages[n-1].effort,evaluationVersion:P.version,reused:false,status:r.status,reason:r.validation?.reason||r.computed?.reason})});
  })();flights.set(key,promise);promise.then(()=>flights.delete(key),()=>flights.delete(key));
 }
 const result=await flights.get(key),record={...result,...Policy.versions,question_id:entry.questionId,question_revision_id:entry.revisionId,
  input_identity:identity,reuse_key:reuseKey,evaluation_id:require('node:crypto').randomUUID(),completed_at:new Date().toISOString()},fresh=locate(store,projectId,questionId),target=bank.ensure(fresh.project,fresh.p,fresh.q),basis=Cache.basis(fresh.q,fresh.p,fresh.project.scope);
 if(P.inputIdentity(await capture(options))!==identity)throw Error('평가 저장 전 문항이 변경되었습니다.');
 const recovery=path.join(bank.dir,'difficulty-v121','recovery');fs.mkdirSync(recovery,{recursive:true});
 const priorDifficulty=structuredClone(target.metadata.difficulty||{}),backup=path.join(recovery,I.hash({questionId:target.id,priorDifficulty})+'.json');
 if(!fs.existsSync(backup))fs.writeFileSync(backup,JSON.stringify({questionId:target.id,at:new Date().toISOString(),difficulty:priorDifficulty}),{flag:'wx'});
 target.metadata.difficulty={scope:structuredClone(fresh.project.scope),isReference:!!priorDifficulty.isReference,
  criteriaVersion:'insight-bottleneck-v1.2.1',assessmentStatus:record.final_status,reassessmentRequired:false,
  auto_score:record.final_score,auto_tier:record.final_tier,auto_evaluation_id:record.evaluation_id,effective_score:record.final_score,effective_score_source:'auto',
  userScore:null,teacherBand:null,teacher_override_active:false,teacher_override_score:null,
  v121Latest:{identity,profileVersion:P.version,inputVersion:entry.input.inputVersion,inputBasis:basis,record}};
 target.metadata.analysis={...target.metadata.analysis,status:'complete',basis,criteriaVersion:'insight-bottleneck-v1.2.1',error:null};
 fs.mkdirSync(cacheDir,{recursive:true});if(!fs.existsSync(cacheFile))fs.writeFileSync(cacheFile,JSON.stringify(record),{flag:'wx'});
 bank.onEvent?.({type:'difficulty-stage',taskKind:'difficulty_evaluation',questionId,finalStage:record.final_stage,model:record.final_model,reasoningEffort:record.final_reasoning_effort,evaluationVersion:P.version,reused:false,status:record.final_status,reason:record.failure_reason});
 target.hasLocalChanges=true;target.status='local';bank.save();if(bank.state?.auto)bank.markDirty(projectId,questionId);
 return {reused:false,status:record.final_status,score:record.final_score};
}
async function afterAnalysis(options){
 const result={analyzed:0,reused:0,errors:[],waiting:false};
 for(const [index,questionId]of options.questionIds.entries()){
  try{const r=await evaluate({...options,questionId});result[r.reused?'reused':'analyzed']++;}
  catch(e){result.errors.push({questionId,code:e.code||'difficulty_v121',message:e.message});
   if(e.code==='subscription_outcome_unconfirmed'||/구독 로그인|approved_call_budget|usage limit|rate limit/i.test(e.message)){result.waiting=true;result.waitingIds=options.questionIds.slice(index);break;}}
 }
 return result;
}
module.exports={capture,evaluate,afterAnalysis};
