'use strict';
require('../tests/offline-guard.cjs');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const C=require('../app/difficulty-v122/canonical.cjs'),I=require('../app/difficulty-v122/input.cjs'),V=require('../app/difficulty-v122/validate.cjs'),R=require('../app/difficulty-v122/response-contract.cjs'),Router=require('../app/difficulty-v122/router.cjs');
const Gate=require('./difficulty-v122-replay-gate.cjs'),Scorer=require('../app/difficulty-v122/scorer.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'artifacts/difficulty-v122-overlay-replay-final-20261021'),previous=path.join(root,'artifacts/difficulty-v122-evidence-rc'),read=f=>JSON.parse(fs.readFileSync(f)),sources=read(previous+'/inputs/sources.json'),results=[];
for(const [i,number]of [[0,11],[1,13],[2,9]]){
 const p=I.prepare(sources[i]),file=i?previous+'/inputs/raw-'+number+'.json':path.join(root,'artifacts/difficulty-v122-simple-contract/latest-11.json'),raw=read(file),hash=C.bytesHash(fs.readFileSync(file)),id='role-overlay-replay-'+number;
 const binding=R.bind(p,id),r=V.evaluateResponse(raw,p.payload,binding,id),next=Router.next(1,{status:r.computed.status,...r},{smoke:true});
 const result={number,question_id:p.identities.question_id,identity:p.identities,replay_system_envelope:binding,raw_file:file,raw_sha256:hash,validation:r.validation,score:r.computed.score,tier:r.computed.problem_tier,assembly:r.computed.assembly_mode,promotions:r.computed.promotions,next_stage:next,stage1_final:r.computed.status==='complete'&&next===null,stage2_candidates:next===2?1:0,system_overlay:r.system_projection_role_overlay||null,projection:r.computed.projection,moves:r.computed.moves,actualAIcalls:0};
 try{
  assert(r.validation.valid,JSON.stringify(r.validation));assert.equal(r.computed.assembly_triggered,false);
  if(number===11){
   const g=r.system_projection_role_overlay,plan=read(previous+'/single-luna-smoke/approved-plan.json');
   const transportDir=previous+'/single-luna-smoke/transport/'+plan.request_id,transport=read(transportDir+'/transport-result.json');
   const checks=[];function check(name,fn){fn();checks.push({name,passed:true});}
   check('question revision content image basis source and replay input identity',()=>{
    for(const k of ['question_id','revision_id','question_content_hash','image_asset_hash','difficulty_basis_hash','source_manifest_hash'])
     assert.equal(p.identities[k],plan.identity[k],k);
    assert(R.verify(binding,p.payload,id));assert.equal(binding.input_hash,C.hash(p.payload));
   });
   check('actual API raw preserved and final Schema passed',()=>{
    assert.equal(transport.status,'complete');assert(transport.evidence.completed);assert.equal(transport.evidence.exitCode,0);
    assert.equal(transport.model,'gpt-6-luna');assert.equal(transport.effort,'medium');
    assert.equal(hash,C.bytesHash(fs.readFileSync(transportDir+'/raw-response.json')));assert.deepEqual(raw,transport.raw);
    assert(r.validation.valid);
   });
   check('approved immutable overlay applied',()=>assert.equal(g.overlay_hash,p.payload.projection_role_overlay.overlay_hash));
   check('one shared premise system connection',()=>assert.equal(g.shared_premise_count,1));
   check('no shared premise duplicate',()=>assert.equal(g.shared_premise_duplicates,0));
   check('aggregation excluded from discovery assembly execution',()=>{
    assert.equal(g.system_nodes.filter(n=>n.scoring_role==='excluded_aggregation'&&!n.counted).length,1);
    for(const k of ['system_discovery_count','system_assembly_count','system_execution_count'])assert.equal(g[k],0);
   });
   check('required discoveries retained by official scorer',()=>{
    assert.equal(g.required_nodes.length,5);
    assert.deepEqual(g.required_nodes.map(n=>n.discovery_id).sort(),r.computed.projection.retained_node_ids.slice().sort());
   });
   check('no non-obvious M2 plus',()=>assert(r.computed.branch_results.every(b=>b.moves.every(m=>Number(m.move_class.slice(1))<2))));
   check('no assembly',()=>assert.equal(r.computed.assembly_triggered,false));
   check('no literacy promotion',()=>{assert.equal(r.computed.literacy_high,false);assert(!r.computed.promotions.includes('literacy'));});
   check('no execution promotion',()=>{assert.equal(r.computed.execution_audit.extreme,false);assert(!r.computed.promotions.includes('execution'));});
   check('score computed by unchanged deterministic scorer',()=>{
    assert.equal(r.computed.score,Scorer.decimal(0,r.computed.dominant_s,raw.viable_routes[0].execution_load));
   });
   check('final tier T0',()=>assert.equal(r.computed.problem_tier,'T0'));
   check('T0 score within band',()=>assert(r.computed.score>=1&&r.computed.score<=2));
   check('current saved raw deterministic observation',()=>assert.equal(r.computed.score,1.2));
   check('Stage 1 final',()=>{Gate.semanticGate(r.computed,next);assert(result.stage1_final);});
   check('zero Stage 2 candidates',()=>assert.equal(result.stage2_candidates,0));
   result.acceptance_checks=checks;result.historical_comparison=Gate.historicalComparison(r.computed);
   result.source_response={was_actual_luna:true,api_passed:true,schema_passed:true,
    schema_passed_scope:'preserved raw validated under final replay contract',
    original_request_id:transport.request_id,original_model:transport.model,original_effort:transport.effort,
    original_request_envelope:plan.request_envelope,original_criteria_payload_hash:plan.versions.criteria_payload_hash,
    transport_result_sha256:C.bytesHash(fs.readFileSync(transportDir+'/transport-result.json'))};
  }else{
   const plan=read(previous+'/inputs/approved-run-plan.json'),preserved=read(previous+'/predecessor-preservation.json'),old=read(path.join(preserved.old_root,'artifacts/difficulty-v122-rc1/post-freeze-luna-contract-smoke-20261020T150005Z/batch/calls',plan.requests[i].request_id+'.json'));
   assert.equal(C.hash(r.computed),C.hash(old.envelope.computed));result.computed_identical=true;
   assert(!r.system_projection_role_overlay);
   if(number===13){assert.equal(result.score,4.7);assert.equal(result.tier,'T2');assert(r.computed.moves.some(m=>m.move_class==='M2'));assert.equal(next,null);}
   else {assert.equal(result.score,6.7);assert.equal(result.tier,'T3');assert.equal(next,2);}
  }
  result.passed=true;
 }catch(e){result.passed=false;result.error=e.message;}
 assert.equal(C.bytesHash(fs.readFileSync(file)),hash);results.push(result);
}
const report={at:new Date().toISOString(),verification_mode:'actual_luna_response_replay',passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results,actualAIcalls:0,new_ai_calls:0,live_smoke_authorized_to_start:false,successor_freeze_eligible:results.every(r=>r.passed)};
fs.writeFileSync(base+'/saved-replay.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:report.passed,failed:report.failed,results:results.map(r=>({number:r.number,passed:r.passed,score:r.score,tier:r.tier,error:r.error})),successor_freeze_eligible:report.successor_freeze_eligible}));if(report.failed)process.exitCode=1;
