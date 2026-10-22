'use strict';
const C=require('./canonical.cjs'),Policy=require('./policy.cjs');
const required=['question_id','revision_id','question_content_hash','image_asset_hash','curriculum_scope_hash','difficulty_basis_hash','approved_route_manifest_hash',
 'source_id_contract_version','source_manifest_hash','prompt_hash','schema_hash','projection_hash','validator_hash','scorer_hash','criteria_payload_hash','model_policy_version','model_policy_hash'];
function identity(prepared,versions){
 const value={...prepared.identities,...versions,model_policy_version:Policy.model_policy_version,model_policy_hash:Policy.model_policy_hash};
 for(const k of required)if(typeof value[k]!=='string'||!value[k])throw Error('result identity field missing '+k);
 return Object.fromEntries(required.map(k=>[k,value[k]]));
}
const evaluationKey=i=>C.hash(i),stageKey=(key,stage)=>C.hash({evaluation_key:key,...Policy.stages[stage-1]});
function envelope(prepared,versions,stage,call,evaluated,requestEnvelope){
 const i=identity(prepared,versions),key=evaluationKey(i),s=Policy.stages[stage-1];
 require('./response-contract.cjs').verify(requestEnvelope,prepared.payload,stageKey(key,stage));
 const value={common_evaluation_manifest_hash:require('../difficulty-v123/deployment.cjs').manifest_hash,...(versions.contract_versions?{evaluation_contract:versions.contract_versions,contract_profile:evaluated.contract_profile||null}:{}),...require('../difficulty-output-policy.cjs').metadata,finish_reason:call.finish_reason||'not_reported',usage_status:call.usage?'reported':'not_reported',response_bytes:call.response_bytes??null,truncated:call.truncated??null,system_fields:requestEnvelope,
  ...(evaluated.system_projection_role_overlay?{system_projection_role_overlay:evaluated.system_projection_role_overlay}:{}),
  ...(evaluated.system_evidence_relations?{system_evidence_relations:{manifest_hash:evaluated.system_evidence_relations.manifest_hash,resolved:evaluated.system_evidence_relations.resolved}}:{}),
  ...i,evaluation_key:key,stage,...s,stage_request_id:stageKey(key,stage),request_id:call.request_id||stageKey(key,stage),
  idempotency_key:stageKey(key,stage),raw_response_hash:call.raw==null?null:C.hash(call.raw),
  validation:evaluated.validation||{valid:false,reason:call.reason||'result_unknown'},
  failure_reason:evaluated.computed?.reason||call.reason||null,
  selected_route:evaluated.computed?.selected_route_id||null,selected_branch:evaluated.computed?.branch_id||null,
  base_tier:evaluated.computed?.base_tier||null,promotions:evaluated.computed?.promotions||[],
  final_tier:evaluated.computed?.problem_tier||null,score:evaluated.computed?.score??null,
  created_at:call.started_at,completed_at:call.completed_at,status:call.status==='unresolved'?'unresolved':evaluated.computed?.status||'failed',
  computed:evaluated.computed||null,evidence:call.evidence||null,usage:call.usage||null,latency_ms:call.latency_ms??null,
  ...(prepared.source_provenance?{source_provenance:prepared.source_provenance}:{})};
 verifyEnvelope(value);return value;
}
function verifyEnvelope(v){
 for(const k of [...required,'request_id','stage_request_id','idempotency_key','evaluation_key','created_at','completed_at'])if(typeof v[k]!=='string'||!v[k])throw Error('result envelope missing '+k);
 if(v.evaluation_key!==evaluationKey(Object.fromEntries(required.map(k=>[k,v[k]]))))throw Error('result evaluator key mismatch');
 if(stageKey(v.evaluation_key,v.stage)!==v.stage_request_id||v.idempotency_key!==v.stage_request_id)throw Error('stage identity mismatch');
 const binding=Policy.stages[v.stage-1];
 if(!binding||binding.model!==v.model||binding.effort!==v.effort)throw Error('model binding mismatch');
 if(v.system_fields){
  const {envelope_hash,...rest}=v.system_fields;
  if(C.hash(rest)!==envelope_hash||v.system_fields.request_id!==v.stage_request_id)throw Error('system request binding mismatch');
  for(const k of ['question_id','revision_id','difficulty_basis_hash','source_manifest_hash'])if(v[k]!==v.system_fields[k])throw Error('system source identity mismatch');
  if(v.system_evidence_relations&&v.system_evidence_relations.manifest_hash!==v.system_fields.evidence_manifest_hash)throw Error('system evidence identity mismatch');
  if(v.system_projection_role_overlay?.overlay_hash!==v.system_fields.projection_role_overlay_hash)throw Error('system projection role identity mismatch');
  if(v.status==='complete'&&v.system_fields.evidence_manifest_hash&&!v.system_evidence_relations?.resolved?.length)throw Error('system evidence bindings missing');
 }else throw Error('system request binding missing');
 if(v.status==='complete'&&(!v.validation?.valid||!v.raw_response_hash||!Number.isFinite(v.score)||!/^T[0-5]$/.test(v.final_tier)))throw Error('incomplete success envelope');
 return true;
}
module.exports={required,identity,evaluationKey,stageKey,envelope,verifyEnvelope};
