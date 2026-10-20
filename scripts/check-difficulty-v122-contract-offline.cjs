'use strict';
// Saved data only. This script cannot launch a provider or use the network.
const guard=require('../tests/offline-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'artifacts/difficulty-v122-contract-offline');
const C=require('../app/difficulty-v122/canonical.cjs'),I=require('../app/difficulty-v122/input.cjs');
const V=require('../app/difficulty-v122/validate.cjs'),S=require('../app/difficulty-v122/schema.cjs');
const W=require('../app/difficulty-v122/wire-contract.cjs');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),sha=f=>C.bytesHash(fs.readFileSync(f));
function inputs(){
 const dir=path.join(base,'inputs'),manifest=read(path.join(dir,'manifest.json'));
 assert.equal(manifest.parent_commit,'5f8a58356de25329036c6cd73060f5561dd64e59');
 assert.equal(manifest.parent_bundle_hash,'b03f9709b4a6350e5c6d7eee04f5be069529861c6e328c0c3c7a2a557711327a');
 assert.equal(manifest.parent_criteria_payload_hash,'dee40ef2a609f22cea13c835deb40ff620bd024f6c87365703737bcd8bc1198b');
 assert.equal(manifest.cases.length,4);
 const parentRoot=path.resolve(path.dirname(manifest.cases[0].files.source.original),'../../..');
 const cases=manifest.cases.map(item=>{
  const data={};
  for(const [kind,file]of Object.entries(item.files)){
   const local=path.resolve(dir,file.file);
   assert(local.startsWith(dir+path.sep));
   assert.equal(sha(local),file.sha256);
   assert.equal(sha(file.original),file.sha256,'original evidence changed: '+kind);
   data[kind]=kind==='prompt'?fs.readFileSync(local,'utf8'):read(local);
  }
  assert.equal(C.hash(data.raw),item.raw_response_hash);
  return {item,...data,prepared:I.prepare(data.source)};
 });
 return {manifest,parentRoot,cases};
}
function inspect(x,parentRoot){
 const p=x.prepared,rawHash=C.hash(x.raw),binding=x.call.envelope.system_fields;
 const parentI=require(path.join(parentRoot,'app/difficulty-v122/input.cjs'));
 const parentV=require(path.join(parentRoot,'app/difficulty-v122/validate.cjs'));
 const parentS=require(path.join(parentRoot,'app/difficulty-v122/schema.cjs'));
 const parentPrompt=require(path.join(parentRoot,'app/difficulty-v122/prompt.cjs'));
 const originalPrepared=parentI.prepare(x.source);
 assert.equal(C.hash(p),C.hash(originalPrepared),'input semantics changed');
 assert.equal(C.hash(parentS.forRegistry(p.registry)),C.hash(x.schema),'saved generation schema changed');
 assert.equal(parentPrompt.render(p).text,x.prompt,'saved rendered prompt changed');
 assert.equal(C.hash(S.forRegistry(p.registry,{withSystemRoles:true})),C.hash(parentS.forRegistry(p.registry,{withSystemRoles:true})),'internal acceptance schema changed');
 const original=V.evaluateResponse(x.raw,p.payload,binding,x.item.request_id);
 assert.deepEqual(original.validation,x.call.envelope.validation);
 assert.deepEqual(original,parentV.evaluateResponse(x.raw,p.payload,binding,x.item.request_id));
 assert.equal(original.validation.valid,false);
 const relations=p.payload.evidence_relations.relations,byId=new Map(relations.map(r=>[r.evidence_relation_id,r]));
 const mismatches=[],missingRoles=[],missingClues=[];
 let selections=0;
 for(const route of x.raw.viable_routes)for(const d of route.critical_discoveries){
  for(const id of d.evidence_relation_ids){
   selections++;const r=byId.get(id);
   const flags=r?{basis:!d.basis_step_ids.includes(r.basis_step_id),role:r.role!==d.role,route:r.route_id!==route.approved_route_id,target:!r.allowed_branch_ids.includes(d.target_statement_id)}:{unknown:true};
   const fields=Object.keys(flags).filter(k=>flags[k]);
   if(fields.length)mismatches.push({discovery_id:d.id,relation_id:id,fields});
  }
  for(const basis of d.basis_step_ids){
   if(!relations.some(r=>r.basis_step_id===basis&&r.role===d.role&&r.route_id===route.approved_route_id&&r.allowed_branch_ids.includes(d.target_statement_id)))
    missingRoles.push({discovery_id:d.id,requested_role:d.role,basis:p.registry.basis_steps.find(b=>b.id===basis)});
  }
  for(const [name,audit]of Object.entries(d.structure_audit))
   if(!audit.applies&&!audit.direct_clue_quote.trim())missingClues.push({discovery_id:d.id,audit:name,non_trigger_reason:audit.non_trigger_reason});
 }
 // Counterfactual wire-format test, NEVER a production response repair. Keep
 // all judgments, basis IDs, roles, dependencies, work and audit fields exact.
 assert.equal(W.selectionPolicy(p.registry).explicit_relation_ids.length,0);
 const diagnostic=structuredClone(x.raw);
 for(const r of diagnostic.viable_routes)for(const d of r.critical_discoveries)d.evidence_relation_ids=[];
 const result=V.evaluateResponse(diagnostic,p.payload,binding,x.item.request_id);
 const originalResult=parentV.evaluateResponse(diagnostic,p.payload,binding,x.item.request_id);
 assert.deepEqual(result,originalResult,'candidate changed acceptance or scoring');
 assert.equal(C.hash(x.raw),rawHash);
 return {
  summary:{label:x.item.label,question_id:x.item.question_id,revision_id:x.item.revision_id,request_id:x.item.request_id,
   original_raw_sha256:x.item.files.raw.sha256,original_raw_canonical_hash:rawHash,original_validation:original.validation,
   relation_selections:selections,relation_mismatches:mismatches,missing_roles:missingRoles,missing_clues:missingClues,
   diagnostic_only:{transformation:'evidence_relation_ids=[]; all other response fields unchanged',registered_result:false,
    validation:result.validation,parent_result_identical:true,computed_hash:C.hash(result.computed)}},
  diagnostic,schema:S.forRegistry(p.registry)
 };
}
function preservation(parentRoot){
 const frozen=read(path.join(parentRoot,'release/difficulty-v122-successor-overlay-20261021/release-candidate-frozen.json'));
 assert.equal(C.hash(frozen.code),'b03f9709b4a6350e5c6d7eee04f5be069529861c6e328c0c3c7a2a557711327a');
 for(const [file,hash]of Object.entries(frozen.code))assert.equal(sha(path.join(parentRoot,file)),hash);
 const protectedFiles=['prompt.json','schema.json','policy.cjs','scorer.cjs','projection.cjs','validate.cjs','evidence.cjs','source.cjs','source-review.cjs','source-reference-reviews.json','references.cjs','response-contract.cjs','input.cjs','projection-role-overlay.cjs','projection-role-overlays.json','phase-batch.cjs','router.cjs','subscription.cjs'];
 const protectedHashes=Object.fromEntries(protectedFiles.map(file=>{
  const relative='app/difficulty-v122/'+file,hash=sha(path.join(parentRoot,relative));
  assert.equal(sha(path.join(root,relative)),hash,'protected file changed: '+file);
  return [relative,hash];
 }));
 const release='release/difficulty-v122-successor-overlay-20261021';
 for(const file of fs.readdirSync(path.join(parentRoot,release),{withFileTypes:true}).filter(e=>e.isFile()))
  assert.equal(sha(path.join(root,release,file.name)),sha(path.join(parentRoot,release,file.name)));
 const staging=path.join(parentRoot,'artifacts/full-rollout-staging-20261021');
 const state=Object.fromEntries(['target-snapshot.json','batch/checkpoint.json','final-report.json','execution-events.jsonl'].map(f=>[f,sha(path.join(staging,f))]));
 assert.equal(state['target-snapshot.json'],'07c3ba57224612af5490044b577348fbada99ed18bf13daaa66c968f17e7ac0d');
 assert.equal(state['batch/checkpoint.json'],'9761ed73b9d72ebb78b36d744b26dcebc9abc6292a16c4ae6213774d9727c98e');
 return {parent_frozen_files_verified:Object.keys(frozen.code).length,protected_files:protectedHashes,original_staging_state:state};
}
function main(){
 const {manifest,parentRoot,cases}=inputs(),before=preservation(parentRoot),rows=cases.map(x=>inspect(x,parentRoot));
 const expected=[false,true,true,false];
 rows.forEach((r,i)=>assert.equal(r.summary.diagnostic_only.validation.valid,expected[i]));
 const diagnosticDir=path.join(base,'diagnostic-only');fs.mkdirSync(diagnosticDir,{recursive:true});
 for(const [i,r]of rows.entries())fs.writeFileSync(path.join(diagnosticDir,cases[i].item.request_id+'.json'),C.json({diagnostic_only:true,not_a_model_response:true,not_an_evaluation_result:true,raw:r.diagnostic}));
 const schemaCases=rows.map((r,i)=>({label:r.summary.label,schema:r.schema,original:cases[i].raw,diagnostic:r.diagnostic,
  expected_original_valid:false,expected_diagnostic_valid:!r.summary.missing_clues.length}));
 fs.writeFileSync(path.join(base,'schema-cases.json'),C.json(schemaCases));
 assert.deepEqual(preservation(parentRoot),before);inputs();
 assert.equal(guard.blocked.length,0);
 const result={status:'offline_regression_complete_rollout_blocked',parent_commit:manifest.parent_commit,parent_bundle_hash:manifest.parent_bundle_hash,
  parent_criteria_payload_hash:manifest.parent_criteria_payload_hash,original_responses:4,original_failures_preserved:4,diagnostic_only_passes:2,
  source_role_review_status:'pending_not_applied',actualAICalls:0,productionWrites:0,deployments:0,computerUse:0,browserAutomation:0,pdfGeneration:0,
  network_or_subprocess_attempts:guard.blocked.length,approved_for_full_rollout:false,RC_READY_FOR_FULL_ROLLOUT:false,
  existing_staging_run_resumed:false,new_candidate_evaluation_started:false,preservation:before,cases:rows.map(r=>r.summary)};
 fs.writeFileSync(path.join(base,'offline-regression.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({original_responses:4,original_failures_preserved:4,diagnostic_only_passes:2,network_or_subprocess_attempts:guard.blocked.length,report:path.join(base,'offline-regression.json')}));
}
if(require.main===module)main();
module.exports={inputs,inspect,preservation,base};
