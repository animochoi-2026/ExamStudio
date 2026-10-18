'use strict';
const I=require('../difficulty-v12/input.cjs'),P=require('./profile.cjs'),C=require('./policy.cjs');
function manifest(entries){
 if(!entries.length||new Set(entries.map(e=>e.questionId)).size!==entries.length)throw Error('empty/duplicate targets');
 return I.hash(C.ordered(entries).map(e=>({id:e.questionId,revision:e.revisionId,identity:P.inputIdentity(e)})));
}
function verifyApproval(entries,a){
 if(a?.granted!==true||a.promptHash!==P.promptHash||a.schemaHash!==P.schemaHash||a.profileVersion!==P.version||a.manifestHash!==manifest(entries)||a.maximumCalls!==entries.length*3||a.automaticRetries!==0||a.strictCalibration!==false||I.hash(a.stages)!==I.hash(C.stages))throw Error('frozen prompt, targets and bounded subscription execution approval required');
}
function finalRecord(entry,stages){
 const last=stages[stages.length-1],d=C.decide(stages.length,last),success=d.status==='complete';
 const record={question_id:entry.questionId,question_revision_id:entry.revisionId,question_content_hash:entry.input.contentHash,
  image_asset_hash:I.hash(entry.input.images.map(i=>i.sha256).sort()),spec_version:'1.2',spec_revision:'1.2.1',model_policy_version:C.policy.version,
  prompt_hash:P.promptHash,json_schema_hash:P.schemaHash,scorer_code_hash:P.scorerCodeHash,normalizer_version:P.normalizerVersion,
  anchor_set_version:P.anchorSetVersion,curriculum_scope:entry.input.payload.curriculum_scope,
  calibration_status:/^고/.test(entry.input.payload.curriculum_scope)?'provisional_no_high_school_anchor':'middle_anchor_defined',
  final_stage:stages.length,final_model:C.stages[stages.length-1].model,final_reasoning_effort:C.stages[stages.length-1].effort,
  final_score:success?last.computed.score:null,final_tier:success?last.computed.problem_tier:null,final_status:success?'complete':'failed',
  failure_reason:success?null:d.reason,computed:success?last.computed:{status:'failed',score:null,problem_tier:null,reason:d.reason}};
 for(let i=1;i<=3;i++){const r=stages[i-1];Object.assign(record,{['stage'+i+'_model']:r?C.stages[i-1].model:null,['stage'+i+'_reasoning_effort']:r?C.stages[i-1].effort:null,['stage'+i+'_raw_json']:r?.raw??null,['stage'+i+'_calculated_tier']:r?.computed?.problem_tier??null,['stage'+i+'_calculated_score']:r?.computed?.score??null,['stage'+i+'_validation_result']:r?.validation??null,['stage'+i+'_failure_reason']:r&&C.decide(i,r).reason!=='validated'?C.decide(i,r).reason:null});}
 return record;
}
async function evaluateEntry(entry,{runStage,saveStage=async()=>{},readCurrent=async()=>({revisionId:entry.revisionId,contentHash:entry.input.contentHash})}){
 const stages=[];
 for(let n=1;n<=3;n++){
  const current=await readCurrent(entry);if(current.revisionId!==entry.revisionId||current.contentHash!==entry.input.contentHash)throw Object.assign(Error('question_changed'),{code:'question_changed'});
  const r=await runStage(entry,n,C.stages[n-1]);stages.push(r);await saveStage(entry,n,r);
  // Unknown execution outcomes are retained, never silently replayed/escalated.
  if(r.evidence&&!r.evidence.completed)throw Object.assign(Error('subscription_outcome_unconfirmed'),{code:'subscription_outcome_unconfirmed'});
  if(!C.decide(n,r).next)break;
 }
 const current=await readCurrent(entry);if(current.revisionId!==entry.revisionId||current.contentHash!==entry.input.contentHash)throw Object.assign(Error('question_changed'),{code:'question_changed'});
 return finalRecord(entry,stages);
}
module.exports={manifest,verifyApproval,finalRecord,evaluateEntry};
