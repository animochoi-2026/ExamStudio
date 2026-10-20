'use strict';
require('./offline-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const W=require('../app/difficulty-v122/wire-contract.cjs'),S=require('../app/difficulty-v122/schema.cjs');
const I=require('../app/difficulty-v122/input.cjs'),C=require('../app/difficulty-v122/canonical.cjs');
const E=require('../app/difficulty-v122/evidence.cjs'),R=require('../app/difficulty-v122/response-contract.cjs');
const V=require('../app/difficulty-v122/validate.cjs'),Prompt=require('../app/difficulty-v122/prompt.cjs');
const F=require('../scripts/check-difficulty-v122-contract-offline.cjs');
const {wireFixture}=require('./difficulty-v122-entrypoints.test.cjs');
const {cases,parentRoot}=F.inputs();
for(const [index,x]of cases.entries()){
 test(x.item.label+': preserve original failure and isolate wire-only counterfactual',()=>{
  const before=C.hash(x.raw),r=F.inspect(x,parentRoot);
  assert.equal(r.summary.relation_mismatches.length,[3,3,5,2][index]);
  assert.equal(r.summary.diagnostic_only.validation.valid,[false,true,true,false][index]);
  assert.equal(C.hash(x.raw),before);
 });
 test(x.item.label+': generation forbids redundant explicit relation selection',()=>{
  const schema=S.forRegistry(x.prepared.registry),d=schema.properties.viable_routes.items.properties.critical_discoveries.items;
  assert.equal(d.properties.evidence_relation_ids.maxItems,0);
  assert.equal(d.properties.basis_step_ids.minItems,1);
  for(const fact of Object.values(d.properties.structure_audit.properties)){
   assert.equal(fact.anyOf.length,2);
   for(const branch of fact.anyOf){
    const yes=branch.properties.applies.enum[0];
    for(const key of yes?['evidence']:['direct_clue_quote','non_trigger_reason'])
     assert.equal(branch.properties[key].pattern,'\\S');
   }
  }
 });
}
function multi(){
 const text='1. Required relation\nThe given relation determines the result.';
 return I.prepare({question_id:'wire-multi',revision_id:'r1',question:{body:'옳은 것을 고르시오.',choices:['① 첫 성질이 성립한다.','② 둘째 성질이 성립한다.']},
  scope:{grade:'중2'},difficulty_basis:text,approved_routes:[{route_id:'main',source:'confirmed_solution',solution_excerpt:text}],images:[]});
}
test('multiple branches retain exact explicit selection, unique shared relation is excluded',()=>{
 const p=multi(),policy=W.selectionPolicy(p.registry),schema=S.forRegistry(p.registry),d=schema.properties.viable_routes.items.properties.critical_discoveries.items;
 assert.equal(policy.explicit_relation_ids.length,4);
 assert.equal(policy.unique_groups,1);
 assert.deepEqual(d.properties.evidence_relation_ids.items.enum,policy.explicit_relation_ids);
 assert(!('maxItems' in d.properties.evidence_relation_ids));
 const raw=wireFixture(p),binding=R.bind(p,'test'),normalized=R.normalize(raw,p.payload,binding,'test');
 assert(E.normalize(normalized,p.payload));
 const wrong=structuredClone(normalized),node=wrong.viable_routes[0].critical_discoveries[0];
 node.evidence_relation_ids=[p.payload.evidence_relations.relations.find(r=>r.role===node.role&&!r.allowed_branch_ids.includes(node.target_statement_id)).evidence_relation_id];
 assert.throws(()=>E.normalize(wrong,p.payload),/route\/branch\/role mismatch/);
 node.evidence_relation_ids=[];
 assert.throws(()=>E.normalize(wrong,p.payload),/explicit evidence relation required/);
});
test('candidate never converts a wrong explicit ID into an empty selection',()=>{
 const x=cases[1],before=C.hash(x.raw);
 assert.equal(V.evaluateResponse(x.raw,x.prepared.payload,x.call.envelope.system_fields,x.item.request_id).validation.valid,false);
 assert.equal(C.hash(x.raw),before);
});
test('missing aggregation role remains missing; no source annotation is inferred',()=>{
 const x=cases[0],r=F.inspect(x,parentRoot),missing=r.summary.missing_roles;
 assert.equal(missing.length,1);assert.equal(missing[0].requested_role,'answer_aggregation');
 assert(!missing[0].basis.allowed_roles.includes('answer_aggregation'));
 assert.match(r.summary.diagnostic_only.validation.detail,/basis evidence unavailable/);
});
test('missing direct clues are not invented, waived, or used to change axes',()=>{
 const x=cases[3],r=F.inspect(x,parentRoot);
 assert.equal(r.summary.missing_clues.length,2);
 assert.match(r.summary.diagnostic_only.validation.detail,/structure direct source clue/);
 for(const [i,route]of x.raw.viable_routes.entries())for(const [j,d]of route.critical_discoveries.entries()){
  const trial=r.diagnostic.viable_routes[i].critical_discoveries[j];
  for(const key of Object.keys(d).filter(k=>k!=='evidence_relation_ids'))assert.deepEqual(trial[key],d[key]);
 }
});
test('source context, internal schema, and legacy schema stay byte-equivalent',()=>{
 const old=require(path.join(parentRoot,'app/difficulty-v122/schema.cjs')),before=C.hash(S.schema);
 assert.equal(before,C.hash(old.schema));
 for(const x of [...cases.map(x=>x.prepared),multi()]){
  S.forRegistry(x.registry);
  assert.equal(C.hash(S.forRegistry(x.registry,{legacy:true})),C.hash(old.forRegistry(x.registry,{legacy:true})));
  assert.equal(C.hash(S.forRegistry(x.registry,{withSystemRoles:true})),C.hash(old.forRegistry(x.registry,{withSystemRoles:true})));
 }
 assert.equal(C.hash(S.schema),before);
});
test('new instructions append only contract guidance to the complete frozen instructions',()=>{
 const x=cases[1],old=require(path.join(parentRoot,'app/difficulty-v122/prompt.cjs')),text=Prompt.render(x.prepared).text;
 assert(text.startsWith(old.instructions));
 assert(text.includes(W.instructions));
 assert.equal(C.hash(Prompt.instructions),C.hash(old.instructions));
});
test('approved role overlay keeps its exact generation schema and rendered prompt',()=>{
 const sources=require('../artifacts/difficulty-v122-evidence-rc/inputs/sources.json');
 const oldS=require(path.join(parentRoot,'app/difficulty-v122/schema.cjs'));
 const oldPrompt=require(path.join(parentRoot,'app/difficulty-v122/prompt.cjs'));
 const overlays=sources.map(I.prepare).filter(p=>p.payload.projection_role_overlay);
 assert(overlays.length>0);
 for(const p of overlays){
  assert.equal(C.hash(S.forRegistry(p.registry)),C.hash(oldS.forRegistry(p.registry)));
  assert.deepEqual(Prompt.render(p),oldPrompt.render(p));
 }
});
test('frozen evaluator, reviewed projections and original staging checkpoint remain intact',()=>{
 const p=F.preservation(parentRoot);assert.equal(p.parent_frozen_files_verified,93);
});
