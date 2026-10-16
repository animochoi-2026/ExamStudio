'use strict';
const {AsyncLocalStorage}=require('node:async_hooks'),fs=require('node:fs'),path=require('node:path');
const Failure=require('./operation-failure.cjs'),context=new AsyncLocalStorage();
const TRANSIENT=new Set([408,429,502,503,504]);
function retryable(e){if(e.status)return TRANSIENT.has(e.status);return e.code==='network'||e.code==='timeout'||/^(ECONN|ETIMEDOUT|UND_ERR)/.test(e.code||'')||['TimeoutError','AbortError'].includes(e.name);}
function network(error){return Object.assign(Error('서버 통신이 중단되었습니다. 서버 상태를 확인한 뒤 미완료 단계부터 다시 시도합니다.'),{code:'network',service:'supabase',retryable:true,originalName:error?.name,originalCause:Failure.message(error?.cause||error),causeCode:error?.cause?.code||error?.code,timeout:['TimeoutError','AbortError'].includes(error?.name)||/TIMEOUT|TIMEDOUT/.test(error?.cause?.code||'')});}
function responseInfo(r){const after=r.headers.get('retry-after');return {status:r.status,requestId:r.headers.get('sb-request-id')||r.headers.get('x-request-id')||r.headers.get('cf-ray')||null,sbErrorCode:r.headers.get('sb-error-code')||null,r2Code:r.headers.get('x-amz-error-code')||null,...(after?{retryAfterMs:Math.max(0,Number.isFinite(Number(after))?Number(after)*1000:Date.parse(after)-Date.now())}:{})};}
function stage(stage,extra={}){const c=context.getStore();if(!c)return;c.job.uploadState=stage;Object.assign(c.job.uploadCheckpoint||={},extra);if(extra.entryId){c.job.uploadStages||={};c.job.uploadStages[extra.entryId]={...c.job.uploadStages[extra.entryId],...extra,stage};}c.save();}
function record(data){const c=context.getStore();if(!c)return;const event={at:new Date().toISOString(),school:c.school,originalNumber:c.number,questionId:c.job.questionId,jobId:c.job.id,stage:c.job.uploadState,attempt:c.attempt,...data};c.job.lastDiagnostic=event;c.save();try{const file=path.join(c.directory,'upload-diagnostics.jsonl');if(fs.existsSync(file)&&fs.statSync(file).size>4*1024*1024)fs.renameSync(file,file+'.previous');fs.appendFileSync(file,JSON.stringify(event)+'\n');}catch{/* Diagnostics must not cause another upload. */}}
async function request(api,work){const start=Date.now();try{const r=await work();record({api,elapsedMs:Date.now()-start,...responseInfo(r),automaticRetry:false});return r;}catch(cause){const e=network(cause);Object.assign(e,{api,elapsedMs:Date.now()-start,requestId:null});record({...Failure.details(e),requestId:null,api,automaticRetry:false});throw e;}}
async function bytes(response){try{return Buffer.from(await response.arrayBuffer());}catch(cause){throw Object.assign(network(cause),{requestId:responseInfo(response).requestId});}}
async function run(bank,job,work,{ensure=()=>{},sleep=ms=>new Promise(r=>setTimeout(r,ms)),random=Math.random}={}){
 const source=bank.state.items[job.questionId]?.metadata?.source||{};
 const ctx={job,save:()=>bank.save(),directory:bank.dir,school:source.school,number:source.originalNumber,attempt:1};
 return context.run(ctx,async()=>{for(let attempt=0;;attempt++){
  ctx.attempt=attempt+1;ensure();job.reconcileUploads=attempt>0||Object.keys(job.remote||{}).length>0;job.recoveryAttempts=attempt;stage('결과 확인 중');
  try{const heads=await bank.remoteHeads(job.questionId);if(heads.some(h=>h.revisionId===job.revisionId)){job.committed=true;job.status='complete';stage('완료');return;}await require('./bank-protected-metadata.cjs').rebuild(bank,job);const result=await work();if(job.committed)stage('완료');return result;}
  catch(error){const canRetry=retryable(error)&&attempt<3;job.failure=Failure.details(error,'supabase');job.uploadState=retryable(error)?'재시도 대기':'데이터 수정 필요';job.requiresPayloadRebuild=error.code==='protected_metadata_missing'||job.requiresPayloadRebuild;
   const delay=Number.isFinite(error.retryAfterMs)?error.retryAfterMs:1000*2**attempt+Math.floor(random()*250);
   job.nextAt=canRetry?Date.now()+delay:0;record({...job.failure,automaticRetry:canRetry,nextRetryAt:canRetry?new Date(job.nextAt).toISOString():null});
   if(!canRetry){error.uploadLocal=error.status!==401&&error.code!=='auth';
    if(retryable(error)){bank.uploadFailures||=new Map();bank.uploadFailures.set(job.questionId,Date.now());for(const [id,at]of bank.uploadFailures)if(Date.now()-at>60000)bank.uploadFailures.delete(id);
     if(bank.uploadFailures.size>=3){try{await bank.auth.membership();}catch(probe){if(retryable(probe)||probe.status===401||probe.code==='auth'){error.uploadGlobal=true;error.uploadLocal=false;}}}
    }throw error;}await sleep(delay);
  }
 }});
}
module.exports={context,retryable,network,responseInfo,request,bytes,record,stage,run};
