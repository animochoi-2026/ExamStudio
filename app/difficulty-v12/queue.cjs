'use strict';
const I=require('./input.cjs'),V=require('./schema.cjs');
const terminal=new Set(['complete','failed','conflict']);
const retryable=e=>[408,429,502,503,504].includes(e.status)&&e.responseReceived===true;
const globalError=e=>[401,403].includes(e.status)||e.code==='model_not_found'||e.code==='invalid_api_key';
function plan(entries,{kind='pilot',id}={}){
 if(!id||!['pilot','full','upload'].includes(kind)||!entries.length||new Set(entries.map(e=>e.id)).size!==entries.length)throw Error('고유 대상·작업 ID 필요');
 const rows=entries.map(e=>({...e,status:'pending',attempts:0,responseId:null,result:null}));
 const manifestHash=I.hash(rows.map(e=>({id:e.id,questionId:e.questionId||null,revisionId:e.revisionId||null,reviewVersion:e.reviewVersion??null,inputVersion:e.input.inputVersion})));
 return {id,kind,manifestHash,evaluationVersion:I.evaluationVersion,promptHash:I.promptHash,model:I.settings.model,effort:'high',strict_calibration:false,status:'prepared',version:0,calls:0,retries:0,entries:rows,approval:null,pilotReview:null};
}
function authorize(job,a){
 if(!a?.granted||a.manifestHash!==job.manifestHash||a.promptHash!==I.promptHash||a.model!==I.settings.model||a.effort!=='high'||!Number.isInteger(a.maxCalls)||a.maxCalls<job.entries.filter(e=>!terminal.has(e.status)).length||!Number.isInteger(a.maxRetries)||a.maxRetries<0||a.maxRetries>3||a.strict_calibration!==false)throw Error('실제 프롬프트·대상·모델·호출 상한 승인 필요');
 if(job.kind==='full'&&(!job.pilotReview?.passed||job.pilotReview.evaluationVersion!==job.evaluationVersion))throw Error('같은 기준의 합격 파일럿 필요');
 return {...structuredClone(job),approval:structuredClone(a),status:'approved'};
}
function summary(job){const counts={};for(const e of job.entries)counts[e.status]=(counts[e.status]||0)+1;const done=job.entries.every(e=>terminal.has(e.status)),failed=(counts.failed||0)+(counts.conflict||0);return {total:job.entries.length,counts,done,failed,failureRate:failed/job.entries.length,calls:job.calls,retries:job.retries};}
// store.save must be a durable compare-and-swap. One lease-holder calls this.
async function step(job,{provider,readCurrent,save,sleep=ms=>new Promise(r=>setTimeout(r,ms)),maxPolls=12}={}){
 const state=structuredClone(job);if(!['approved','running'].includes(state.status)||state.evaluationVersion!==I.evaluationVersion)throw Error('승인된 동일 평가 입력 버전만 실행할 수 있습니다.');authorize(state,state.approval);
 const persist=async()=>{const expected=state.version;state.version++;await save(structuredClone(state),expected);};
 const e=state.entries.find(e=>!terminal.has(e.status));if(!e){state.status='complete';await persist();return state;}
 if(e.status==='unknown'||e.status==='submitting'&&!e.responseId){e.status='failed';e.result={computed:{status:'failed',score:null,problem_tier:null,reason:'outcome_unknown_no_replay'}};await persist();return state;}
 if(e.nextAttemptAt>Date.now())return state;
 const current=await readCurrent(e);if(current.revisionId!==e.revisionId||current.reviewVersion!==e.reviewVersion||current.inputVersion!==e.input.inputVersion){e.status='conflict';e.result={computed:{status:'failed',score:null,problem_tier:null,reason:'content_changed'}};await persist();return state;}
 state.status='running';
 if(!e.responseId){
  if(state.calls>=state.approval.maxCalls){state.status='paused';state.error='approved_call_limit';await persist();return state;}
  // Write the intent before dispatch. Ambiguous POST outcomes never auto-resubmit.
  e.status='submitting';e.attempts++;state.calls++;if(e.attempts>1)state.retries++;await persist();
  try{const response=await provider.create(I.request(e.input));if(!response.id)throw Error('응답 식별자 없음');e.responseId=response.id;e.status='processing';await persist();}
  catch(error){e.error={code:error.code||null,status:error.status||null,requestId:error.requestId||null,retryAfterMs:error.retryAfterMs??null,reason:globalError(error)?'provider_configuration':retryable(error)?'transient_response':'outcome_unknown'};
   if(globalError(error)){e.status='pending';state.status='paused';}
   else if(retryable(error)&&e.attempts<=state.approval.maxRetries){e.status='pending';e.nextAttemptAt=Date.now()+Math.max(0,error.retryAfterMs??(1000*2**(e.attempts-1)+Math.random()*200));}
   else if(error.responseReceived){e.status='failed';e.result={computed:{status:'failed',score:null,problem_tier:null,reason:'provider_error'}};}
   else {e.status='failed';e.result={computed:{status:'failed',score:null,problem_tier:null,reason:'outcome_unknown_no_replay'}};}
   await persist();return state;
  }
 }
 for(let poll=0;poll<maxPolls;poll++){
  let response;try{response=await provider.get(e.responseId);}catch(error){e.error={status:error.status||null,reason:'response_retrieval_failed'};if(globalError(error))state.status='paused';await persist();return state;}
  if(['queued','in_progress'].includes(response.status)){await sleep(1000);continue;}
  e.providerUsage=response.usage||null;e.providerModel=response.model||null;
  if(response.status!=='completed'){e.status='failed';e.result={computed:{status:'failed',score:null,problem_tier:null,confidence:0,reason:response.status||'provider_error'}};}
  else{
   const latest=await readCurrent(e);if(latest.revisionId!==e.revisionId||latest.reviewVersion!==e.reviewVersion||latest.inputVersion!==e.input.inputVersion){e.status='conflict';e.result={computed:{status:'failed',score:null,problem_tier:null,reason:'content_changed'}};}
   else{let raw;try{raw=JSON.parse(response.output.filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join(''));}catch{raw=null;}
    e.result={...V.evaluate(raw),versions:e.input.versions,inputVersion:e.input.inputVersion,contentHash:e.input.contentHash,questionVersion:e.revisionId,model:response.model,usage:response.usage||null};
    if(response.model!==I.settings.model&&!response.model?.startsWith(I.settings.model+'-'))e.result={computed:{status:'failed',score:null,problem_tier:null,reason:'model_mismatch'}};
    e.status=e.result.computed.status==='complete'?'complete':'failed';
   }
  }
  e.finishedAt=new Date().toISOString();state.status=summary(state).done?'complete':'running';await persist();return state;
 }
 await persist();return state;
}
function reusable(entry,input){return entry?.status==='complete'&&entry.result?.computed?.status==='complete'&&entry.result.inputVersion===input.inputVersion&&entry.result.versions?.evaluation_version===I.evaluationVersion;}
function recalculate(entry){if(!entry.result?.raw||entry.result.versions?.evaluation_version!==I.evaluationVersion)throw Error('축·게이트·프롬프트·입력이 동일한 원시 평가만 재계산 가능');const result=V.evaluate(entry.result.raw);const updated={...entry.result,...result,versions:{...entry.result.versions,scorer_version:require('./scorer.cjs').version}};return I.hash(updated)===I.hash(entry.result)?entry:{...entry,status:result.computed.status==='complete'?'complete':'failed',resultHistory:[...(entry.resultHistory||[]),entry.result],result:updated};}
function activationPlan(job,approval,current){
 const s=summary(job);if(job.kind!=='full'||!s.done||s.failureRate>.05||!job.pilotReview?.passed||!approval?.granted||approval.jobId!==job.id||approval.manifestHash!==job.manifestHash||approval.resultHash!==I.hash(job.entries.map(e=>e.result))||!approval.includeManual||!approval.sampleReviewed)throw Error('파일럿 합격·전체 완료·실패율 5% 이하·수동값 포함 전환 및 표본 검토 승인 필요');
 const patches=[];for(const e of job.entries){if(e.status!=='complete')continue;const c=current.find(c=>c.question_id===e.questionId);if(!c||c.revision_id!==e.revisionId||c.review_version!==e.reviewVersion)throw Error('운영 전환 중 문항/수동 검수 버전 충돌');patches.push({questionId:e.questionId,revisionId:e.revisionId,reviewVersion:e.reviewVersion,result:e.result,backup:{difficulty:c.metadata?.difficulty,confirmed:c.confirmed}});}return patches;
}
module.exports={plan,authorize,step,summary,reusable,recalculate,activationPlan,retryable};
