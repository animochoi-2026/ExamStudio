'use strict';
// Verify locally produced evidence before sending it to private server staging.
// No model invocation or production score mutation is performed here.
const I=require('../difficulty-v12/input.cjs'),P=require('./profile.cjs'),V=require('./schema.cjs'),Policy=require('./policy.cjs'),Run=require('./run.cjs');
function packet(entry,snapshot,result){
 if(result.question_id!==entry.questionId||result.question_revision_id!==entry.revisionId||result.profile_version!==P.version||result.input_identity!==P.inputIdentity(entry)||I.hash(snapshot.catalog)!==entry.catalogHash)throw Error('staging_identity_mismatch');
 if(!Number.isInteger(result.final_stage)||result.final_stage<1||result.final_stage>3)throw Error('staging_stage_invalid');
 const stages=[];
 for(let n=1;n<=result.final_stage;n++){
  const raw=result['stage'+n+'_raw_json'];
  let evaluated;
  if(raw)evaluated=V.evaluate(raw,entry.validationContext);
  else{
   const reason=result['stage'+n+'_failure_reason'];
   if(!['invalid_response','subscription_execution_failed'].includes(reason)||result['stage'+n+'_validation_result']!==null||result['stage'+n+'_calculated_score']!==null||result['stage'+n+'_calculated_tier']!==null)throw Error('staging_raw_evidence_missing');
   evaluated={raw:null,computed:{status:'failed',score:null,reason}};
  }
  stages.push(evaluated);
  if(n<result.final_stage&&!Policy.decide(n,evaluated).next)throw Error('staging_unnecessary_stage');
 }
 const recomputed=Run.finalRecord(entry,stages);
 for(const key of Object.keys(recomputed))if(I.hash(result[key])!==I.hash(recomputed[key]))throw Error('staging_evidence_mismatch:'+key);
 return {questionId:entry.questionId,revisionId:entry.revisionId,reviewVersion:snapshot.revision.review_version,snapshot:snapshot.catalog,result};
}
module.exports={packet};
