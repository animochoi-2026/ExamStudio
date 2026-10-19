'use strict';
const P=require('./profile.cjs');
function redact(value){return String(value??'').replace(/https?:\/\/\S+/g,'[URL]').replace(/Bearer\s+\S+|(?:sk-|eyJ)[\w.-]+/g,'[REDACTED]').replace(/((?:api[_-]?key|access[_-]?token|authorization)\s*[=:]\s*)[^\s,;]+/gi,'$1[REDACTED]');}
function failureRecord(entry,error,{stage=null,result=null,status='unresolved'}={}){
 const evidence=result?.evidence,source=entry.source||{};
 return {questionId:entry.questionId,revisionId:entry.revisionId,inputIdentity:P.inputIdentity(entry),profileVersion:P.version,
  school:source.school,year:source.academicYear,semester:source.semester,exam:source.exam,originalNumber:source.originalNumber,documentId:source.documentId,
  status,stage,cacheKey:result?.key||null,reason:redact(error?.code||error?.message||error),
  errors:evidence?.errors||[],diagnostic:redact(evidence?.diagnostic||''),
  actualErrorRecorded:Boolean(evidence?.errors?.length),errorMessage:evidence?.errors?.length?evidence.errors.map(e=>e.message).join('\n'):'원문 오류 미기록: '+redact(error?.message||error),
  threadId:evidence?.threadId||null,exitCode:evidence?.exitCode??null,at:result?.finishedAt||new Date().toISOString(),automaticRetry:false};
}
async function attempt(entry,evaluate,saveFailure){
 let stage=null,result=null;
 try{return {result:await evaluate((n,r)=>{stage=n;result=r;})};}
 catch(error){
  if(/approved_call_budget_exhausted|operator_stop_requested|integrity|approval|manifest|staged_result_changed/.test(String(error.message)))throw error;
  const failure=failureRecord(entry,error,{stage,result});await saveFailure(failure);return {failure};
 }
}
function verifySaved(entry,failure){if(failure.questionId!==entry.questionId||failure.inputIdentity!==P.inputIdentity(entry)||failure.profileVersion!==P.version)throw Error('failure_identity_integrity_mismatch');return failure;}
module.exports={redact,failureRecord,attempt,verifySaved};
