'use strict';
require('./offline-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {build}=require('../scripts/prepare-shingu10-approved-rc.cjs'),V=require('../app/difficulty-v122/validate.cjs');
const C=require('../app/difficulty-v122/canonical.cjs'),P=require('../app/difficulty-v122/projection.cjs');
test('approved projection is identity, image, basis and parent-result bound',()=>{
 const e=build();assert.equal(e.question_id,'8c83dbf4-e5c9-44a2-856d-8ba54e4410da');
 assert.equal(e.projection_source,'user_approved_reviewed_projection');assert.equal(e.model_generated,false);
 assert.equal(e.user_approved,true);assert.equal(e.original_raw_preserved,true);assert.equal(e.newAICalls,0);
 assert.equal(C.bytesHash(fs.readFileSync(e.parent_result_file)),e.parent_result_hash);
 assert.equal(e.prepared.images[0].sha256,'543cc1083d55b1591fd7b3e1ff4039e5226c17b9354b205a87bc03230ecf912d');
});
test('real scoped projection validates and deterministically produces 4.8/T2',()=>{
 const e=build(),r=V.evaluate(e.reviewed_projection,e.prepared.payload);
 assert(r.validation.valid);assert.equal(r.computed.score,4.8);assert.equal(r.computed.problem_tier,'T2');
 assert.equal(r.computed.moves.filter(x=>x.move_class==='M2').length,1);
 assert.deepEqual(r.computed.promotions,[]);assert.equal(r.computed.assembly_triggered,false);
});
test('optional example removal preserves score and cannot add calculation workload',()=>{
 const e=build(),raw=structuredClone(e.reviewed_projection),r=raw.viable_routes[0],p=P.project(r);
 assert.deepEqual(p.excluded_explanation_ids,['r1','r2','r3','r4']);assert.equal(p.work.required_sequential_calculation_steps,0);
 r.critical_discoveries=r.critical_discoveries.filter(d=>d.role!=='optional_illustration');r.excluded_explanation_ids=[];
 const after=V.evaluate(raw,e.prepared.payload);assert(after.validation.valid);assert.equal(after.computed.score,4.8);
});
test('six independent targets are max pooled and do not manufacture convergence',()=>{
 const e=build(),c=e.evaluated.computed;
 assert.equal(c.branch_results.length,6);assert.equal(c.score,Math.max(...c.branch_results.map(x=>x.score)));
 assert.equal(c.assembly_triggered,false);assert(!c.execution_audit.strong_signal);
 assert.equal(e.reviewed_projection.viable_routes[0].execution_load,3);
});
test('foreign revision, unknown source ID and wrong role remain rejected',()=>{
 for(const mode of ['revision','source','role']){
  const e=build(),raw=structuredClone(e.reviewed_projection),ctx=structuredClone(e.prepared.payload);
  if(mode==='revision')ctx.source_registry.revision_id='foreign';
  if(mode==='source')raw.viable_routes[0].critical_discoveries[0].basis_step_ids=['unknown'];
  if(mode==='role')raw.viable_routes[0].critical_discoveries.find(d=>d.id==='m2').role='optional_illustration';
  assert.equal(V.evaluate(raw,ctx).validation.valid,false);
 }
});
