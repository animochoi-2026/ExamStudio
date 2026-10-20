'use strict';
const Adapter=require('./adapters.cjs'),Policy=require('./policy.cjs');
// Authentication, ownership and source retrieval stay at the existing API
// boundary. This dispatcher never accepts caller-supplied authoritative basis.
async function dispatch({body,loadConfirmedSource,runtime}){
 if(body.model_policy_version!==Policy.model_policy_version)
  return {status:'evaluation_pending',reason:'difficulty_policy_upgrade_required'};
 if(body.action==='policy')return {policy:Policy,criteria_payload_hash:runtime?.versions?.criteria_payload_hash||null};
 if(!runtime)return {status:'evaluation_pending',reason:'canonical_runtime_not_configured'};
 if(body.action!=='evaluate')return {status:'evaluation_pending',reason:'canonical_action_required'};
 const source=await loadConfirmedSource(body.questionId,body.revisionId);
 return Adapter.server(source,runtime);
}
module.exports={dispatch};
