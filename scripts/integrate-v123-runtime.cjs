'use strict';
// Apply the common runtime only AFTER the saved maximum-recovery successor exists.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),C=require('../app/difficulty-v122/canonical.cjs'),dir=path.resolve('artifacts/max-recovery-v123-20261022'),read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>C.bytesHash(fs.readFileSync(f));
assert.equal(read(dir+'/control/checkpoint.json').status,'evaluation_finished');assert(!fs.existsSync(dir+'/control/runner.lock'));const integrated=read(dir+'/integration-result.json');assert.equal(sha(integrated.path+'/candidate-manifest.json'),integrated.manifest_sha256);
const execution=read(dir+'/call-plan.json');for(const[f,h]of Object.entries(execution.code)){assert.equal(sha(f),h,'live execution changed');const dest=dir+'/frozen-execution/'+f;fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(f,dest,fs.constants.COPYFILE_EXCL);}
const edits=[];function put(f,s){assert(!fs.existsSync(f),f+' exists');fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);edits.push(f);}function replace(f,a,b){const s=fs.readFileSync(f,'utf8');assert(s.includes(a),'missing integration anchor '+f+' '+a);fs.writeFileSync(f,s.replace(a,b));edits.push(f);}
put('app/difficulty-v123/profiles.cjs',`'use strict';
const C=require('../difficulty-v122/canonical.cjs'),Compact=require('../difficulty-v122/compact.cjs'),Explicit=require('../difficulty-v122/explicit.cjs');
function select(context){
 const m=Explicit.manifest(context),groups=new Map();
 for(const r of m.relations){const key=r.route_id+'|'+r.basis_step_id;const tuple=C.hash({role:r.role,target:r.target_statement_id,branch:r.target_statement_id,source:r.source_span_ids});const xs=groups.get(key)||new Set();xs.add(tuple);groups.set(key,xs);}
 if(!m.relations.length)return 'semantic-review-required';
 return m.relations.some(r=>r.role==='shared_premise')||[...groups.values()].some(s=>s.size!==1)?'explicit-relations':'compact-unambiguous';
}
function codec(context){const name=select(context);if(name==='semantic-review-required')throw Error('semantic_review_required');return name==='explicit-relations'?Explicit:Compact;}
function evaluateResponse(raw,context,binding,id){
 try{const profile=select(context);if(profile==='semantic-review-required')throw Error('semantic_review_required');if(profile==='compact-unambiguous')return {...require('../difficulty-v122/response-adapter.cjs').evaluateResponse(raw,context,binding,id),contract_profile:profile};
 const result=require('../difficulty-v122/explicit-adapter.cjs').evaluateResponse(raw,context,binding,id);if(!result.validation.valid)return result;
 const normalized=result.system_evidence_relations.raw,m=Explicit.manifest(context),byId=new Map(m.relations.map(r=>[r.alias,r]));
 result.system_evidence_relations.resolved=Object.entries(raw.routes).flatMap(([slot,r])=>r.discoveries.map(n=>({route_id:normalized.viable_routes.find(x=>x.route_id===slot).approved_route_id,discovery_id:n.id,evidence_relation_ids:[byId.get(n.evidence_relation_id).evidence_relation_id],binding:'explicit_source_bound'})));
 if(context.projection_role_overlay)result.system_projection_role_overlay=require('../difficulty-v122/projection-role-overlay.cjs').graph(normalized,context);
 return result;
 }catch(e){return {validation:{valid:false,reason:'difficulty_structure_invalid',detail:e.message},computed:{status:'failed',score:null,problem_tier:null,reason:'difficulty_structure_invalid'}};}
}
module.exports={version:'difficulty-wire-r4',select,codec,schema:c=>codec(c).schema(c),manifest:c=>codec(c).manifest(c),encode:(r,c)=>codec(c).encode(r,c),render:p=>({...codec(p.payload).render(p),contract_profile:select(p.payload)}),evaluateResponse};
`);
const frozen=read(dir+'/phase1-plan.json').frozen,old=require('../app/difficulty-v122/candidate-versions.json').versions;
const metadata={spec_revision:'difficulty-v1.2.3-rc1',mathematical_criteria_version:'difficulty-v1.2.2-frozen',mathematical_criteria_hash:frozen.mathematical_criteria_hash,scorer_version:require('../app/difficulty-v122/scorer.cjs').version,scorer_hash:frozen.scorer_hash,projection_semantics_version:require('../app/difficulty-v122/projection.cjs').version,projection_semantics_hash:frozen.projection_hash,wire_contract_version:'difficulty-wire-r4',source_relation_contract_version:'difficulty-evidence-relation-r3',validator_version:'source-bound-dag-v123-r1',routing_policy_version:'luna-medium-sol-medium-structural-high-r4',output_budget_policy_version:require('../app/difficulty-output-policy.cjs').version,persistence_policy_version:'failure-envelope-v3',recovery_policy_version:'reviewed-provenance-v2',stage_authority_policy_version:'earliest-valid-or-fresh-rescue-r2',normalizer_version:'explicit-alias-source-bound-r1'};
put('app/difficulty-v123/versions.json',C.json(metadata));
put('app/difficulty-v123/versions.cjs',`'use strict';
const C=require('../difficulty-v122/canonical.cjs'),base=require('../difficulty-v122/candidate-versions.json').versions,contract=require('./versions.json');
const transport={contract,profiles:['compact-unambiguous','explicit-relations','semantic-review-required'],compact:require('../difficulty-v122/compact.cjs').version,explicit:require('../difficulty-v122/explicit.cjs').version,reviewed_relations_hash:C.hash(require('../difficulty-v122/compact-reviewed-relations.json')),alias_registry_hash:C.hash(require('./alias-registry.json'))};
const manifest_hash=C.hash(transport);
function assertVersions(v){if(v?.contract_versions?.manifest_hash!==manifest_hash)throw Error('difficulty_contract_upgrade_required');}
module.exports={contract,manifest_hash,transport,assertVersions,versions:{...base,criteria_payload_hash:C.hash({mathematical_criteria_hash:contract.mathematical_criteria_hash,scorer_hash:contract.scorer_hash,projection_hash:contract.projection_semantics_hash,transport}),prompt_hash:C.hash({original:base.prompt_hash,transport}),schema_hash:C.hash({original:base.schema_hash,transport}),validator_hash:C.hash({original:base.validator_hash,transport}),contract_versions:{...contract,manifest_hash}}};
`);
put('app/difficulty-v123/authority.cjs',`'use strict';
const V=require('../difficulty-v122/validate.cjs'),O=require('../difficulty-output-policy.cjs'),C=require('../difficulty-v122/canonical.cjs');
function next(stage,r,{smoke=false}={}){if(O.outputLimit(r)||r.status==='unresolved'||r.systemicFailure)return null;if(stage===2&&r.status==='complete')return null;const n=V.nextStage(stage,r);return smoke&&n===3?null:n;}
function circuit(){let stopped=false,last=null,consecutive=0,count=0;const seen=new Map();return {observe(q,r){count++;if(r.systemicFailure)stopped=true;const key=r.validation?.reason==='difficulty_structure_invalid'?C.hash({reason:r.validation.reason,detail:r.validation.detail}):null;if(key){consecutive=key===last?consecutive+1:1;const xs=seen.get(key)||new Set();xs.add(q);seen.set(key,xs);if(consecutive>=3||count<=10&&xs.size>=3)stopped=true;}else consecutive=0;last=key;return stopped;},get stopped(){return stopped;}};}
module.exports={next,circuit};
`);
put('app/difficulty-v123/recovery.cjs',`'use strict';
const C=require('../difficulty-v122/canonical.cjs');
const fields=['question_id','revision_id','question_content_hash','image_asset_hash','difficulty_basis_hash','approved_route_manifest_hash','source_manifest_hash','curriculum_scope_hash','scorer_hash','projection_hash'];
function compatible(a,b,mathematics){return fields.every(k=>typeof a[k]==='string'&&a[k]===b[k])&&mathematics.old_hash===mathematics.current_hash;}
function alias(raw,identity,rawHash,entry){if(!require('./alias-registry.json').entries.some(e=>C.hash(e)===C.hash(entry)))throw Error('unregistered_alias_entry');if(!entry.adopted||!compatible(identity,entry.input_identity,{old_hash:entry.input_identity.scorer_hash,current_hash:identity.scorer_hash})||entry.raw_hash!==rawHash||C.hash(raw)!==entry.before_normalized_hash)throw Error('unapproved_alias_identity');const out=JSON.parse(JSON.stringify(raw));for(const c of entry.changes){const n=out.viable_routes.find(r=>r.route_id===c.route_id)?.critical_discoveries.find(n=>n.id===c.node_id);if(!n||n.premise_source_id!==c.before||c.after!==null)throw Error('unapproved_alias_change');n.premise_source_id=c.after;}if(C.hash(out)!==entry.after_normalized_hash)throw Error('alias_after_hash_mismatch');return out;}
function replacement(e){return e.storage_sweep_complete===true&&e.lease_expired===true&&e.call_saved===false&&e.raw_present===false&&e.provider_completed===false&&e.currently_running===false&&e.abandoned_outcome_unknown_recorded===true;}
module.exports={compatible,alias,replacement};
`);
const phase=read(dir+'/phase1-plan.json'),aliasEntries=read(dir+'/alias-review-registry.json').filter(r=>r.adopted);
for(const e of read(phase.baseline+'/index.json').filter(e=>e.category==='adopted_offline_recovery')){const r=read(phase.baseline+'/'+e.record),before=structuredClone(r.normalized);for(const c of r.review.changes)before.viable_routes.find(x=>x.route_id===c.route_id).critical_discoveries.find(n=>n.id===c.node_id).premise_source_id=c.before;aliasEntries.push({question_id:e.question_id,revision_id:e.revision_id,input_identity:r.input_identity,request_id:r.request_id,raw_hash:r.raw_response_hash,before_normalized_hash:C.hash(before),after_normalized_hash:C.hash(r.normalized),changes:r.review.changes,adopted:true,origin:'preserved_29_review',record:phase.baseline+'/'+e.record});}
assert.equal(aliasEntries.length,41);put('app/difficulty-v123/alias-registry.json',C.json({entries:aliasEntries}));
let subscription=fs.readFileSync('app/difficulty-v122/explicit-subscription.cjs','utf8').replace("Prompt=require('./explicit.cjs')","Prompt=require('../difficulty-v123/profiles.cjs')").replaceAll("require('./test-boundary.cjs')","require('../difficulty-v122/test-boundary.cjs')").replaceAll("require('./response-contract.cjs')","require('../difficulty-v122/response-contract.cjs')").replaceAll("require('./validate.cjs')","require('../difficulty-v122/validate.cjs')").replace("C=require('./canonical.cjs')","C=require('../difficulty-v122/canonical.cjs')").replace("contract_profile:'explicit-relations'","contract_profile:rendered.contract_profile");
put('app/difficulty-v123/subscription.cjs',subscription);
for(const f of ['app/difficulty-v122/evaluator.cjs','app/difficulty-v122/phase-batch.cjs']){replace(f,"require('./compact.cjs')","require('../difficulty-v123/profiles.cjs')");replace(f,"require('./response-adapter.cjs')","require('../difficulty-v123/profiles.cjs')");replace(f,"require('./router.cjs')","require('../difficulty-v123/authority.cjs')");}
{
const f='app/difficulty-v122/phase-batch.cjs';let text=fs.readFileSync(f,'utf8');text=text.replace("event('stage_started',{stage});save();","const stageCircuit=R.circuit();event('stage_started',{stage});save();");const a=text.indexOf("    if(result.validation?.reason==='difficulty_structure_invalid'){"),b=text.indexOf('    const next=R.next',a);assert(a>=0&&b>a);text=text.slice(0,a)+"    if(stageCircuit.observe(identity.question_id,result)){stopped=true;state.stopped='repeated_common_structure_error';}\n"+text.slice(b);fs.writeFileSync(f,text);edits.push(f);
}
replace('app/difficulty-v122/evaluator.cjs',' Policy.assertPolicy(policyVersion);'," require('../difficulty-v123/versions.cjs').assertVersions(versions);Policy.assertPolicy(policyVersion);");
replace('app/difficulty-v122/phase-batch.cjs',' P.assertPolicy(runtime.policyVersion);'," require('../difficulty-v123/versions.cjs').assertVersions(runtime.versions);P.assertPolicy(runtime.policyVersion);");
replace('app/difficulty-v122/runtime.cjs',"require('./subscription.cjs')","require('../difficulty-v123/subscription.cjs')");
replace('app/difficulty-v122/edge-runtime.cjs',"Prompt=require('./compact.cjs')","Prompt=require('../difficulty-v123/profiles.cjs')");
replace('app/difficulty-v122/transport-versions.cjs',fs.readFileSync('app/difficulty-v122/transport-versions.cjs','utf8'),"'use strict';\nmodule.exports=require('../difficulty-v123/versions.cjs');\n");
replace('app/difficulty-v122/contracts.cjs','const value={...require',"const value={...(versions.contract_versions?{evaluation_contract:versions.contract_versions,contract_profile:evaluated.contract_profile||null}:{}),...require");
for(const f of ['app/difficulty-v122/adapters.cjs','app/difficulty-v122/server.cjs','app/difficulty-v122/edge-server.cjs'])replace(f,"...require('../difficulty-output-policy.cjs').metadata","...require('../difficulty-output-policy.cjs').metadata,...require('../difficulty-v123/versions.cjs').contract,evaluation_manifest_hash:require('../difficulty-v123/versions.cjs').manifest_hash");
replace('app/exam-queue-main.cjs',"require('./difficulty-v122/candidate-versions.json').versions.criteria_payload_hash","require('./difficulty-v122/transport-versions.cjs').versions.criteria_payload_hash");
// Old staged jobs cannot silently acquire the new wire contract.
replace('app/difficulty-v122/edge-server.cjs',"if(action==='policy')", "if(action!=='policy'&&job?.policy?.evaluation_manifest_hash!==require('../difficulty-v123/versions.cjs').manifest_hash)return reply(200,{status:'evaluation_pending',reason:'difficulty_contract_upgrade_required'});\n   if(action==='policy')");
fs.writeFileSync(dir+'/runtime-integration.json',C.json({at:new Date().toISOString(),after_integrated_manifest:integrated.manifest_sha256,edits:[...new Set(edits)],contract:metadata,scope:'local code only',productionWrites:0,deployments:0}),{flag:'wx'});console.log(JSON.stringify({edits:[...new Set(edits)],metadata}));
