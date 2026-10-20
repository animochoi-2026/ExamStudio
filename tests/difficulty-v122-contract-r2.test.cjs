'use strict';
require('./offline-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../scripts/check-difficulty-v122-contract-r2.cjs');
const C=require('../app/difficulty-v122/canonical.cjs'),S=require('../app/difficulty-v122/schema.cjs');
const I=require('../app/difficulty-v122/input.cjs'),E=require('../app/difficulty-v122/evidence.cjs');
const V=require('../app/difficulty-v122/validate.cjs'),R=require('../app/difficulty-v122/response-contract.cjs');
const {wireFixture}=require('./difficulty-v122-entrypoints.test.cjs');
test('frozen RC, math, source building, reviewed roles and strict internal schema preserved',()=>{assert.equal(F.preserve().frozen_files,93);});
for(const x of F.cases())test('unchanged saved response '+x.call.identity.question_id,()=>{
 const old=require(F.previous+'/app/difficulty-v122/validate.cjs'),hash=C.hash(x.call.call.raw);
 const args=[x.call.call.raw,x.p.payload,x.call.envelope.system_fields,x.call.request_id];
 assert.deepEqual(V.evaluateResponse(...args),old.evaluateResponse(...args));assert.equal(C.hash(x.call.call.raw),hash);
 const gen=S.forRegistry(x.p.registry),rs=gen.properties.viable_routes.items;
 if(!x.p.payload.projection_role_overlay)for(const route of rs.anyOf||[rs])for(const d of route.properties.critical_discoveries.items.anyOf){
  assert.equal(d.properties.evidence_relation_ids.maxItems,0);
  for(const step of d.properties.basis_step_ids.items.enum)assert(x.p.payload.evidence_relations.relations.some(e=>
   e.basis_step_id===step&&e.role===d.properties.role.enum[0]&&e.route_id===route.properties.approved_route_id.enum[0]&&
   e.allowed_branch_ids.includes(d.properties.target_statement_id.enum[0])));
 }
});
test('exact target scoping is equivalent to valid explicit multi-branch bindings; wrong IDs remain rejected',()=>{
 const text='1. Required relation\nThe given relation determines the result.';
 const p=I.prepare({question_id:'r2',revision_id:'r',question:{body:'옳은 것을 고르시오.',choices:['① 첫 성질','② 둘째 성질']},
  scope:{grade:'중2'},difficulty_basis:text,approved_routes:[{route_id:'main',source:'confirmed_solution',solution_excerpt:text}],images:[]});
 const raw=wireFixture(p),binding=R.bind(p,'test'),old=V.evaluateResponse(raw,p.payload,binding,'test');
 const trial=structuredClone(raw);for(const r of trial.viable_routes)for(const d of r.critical_discoveries)d.evidence_relation_ids=[];
 const actual=V.evaluateResponse(trial,p.payload,binding,'test');assert(old.validation.valid);assert(actual.validation.valid);
 assert.deepEqual(actual.computed,old.computed);
 for(const r of trial.viable_routes)for(const d of r.critical_discoveries){
  const n=R.normalize(trial,p.payload,binding,'test'),node=n.viable_routes.find(a=>a.route_id===r.route_id).critical_discoveries.find(a=>a.id===d.id);
  const other=p.payload.evidence_relations.relations.find(e=>e.role===d.role&&!e.allowed_branch_ids.includes(d.target_statement_id));
  node.evidence_relation_ids=[other.evidence_relation_id];assert.throws(()=>E.normalize(n,p.payload),/mismatch/);
 }
});
test('generation ID grammar excludes saved undeclared d5a; runtime still rejects forward/missing references',()=>{
 const x=F.cases().find(x=>x.call.identity.question_id==='031da0a8-bd4e-4b7f-ab3f-0d83c3568870');
 const d=S.forRegistry(x.p.registry).properties.viable_routes.items.properties.critical_discoveries.items.anyOf[0];
 assert(!new RegExp(d.properties.depends_on.items.pattern).test('d5a'));
 assert.match(V.evaluateResponse(x.call.call.raw,x.p.payload,x.call.envelope.system_fields,x.call.request_id).validation.detail,/dependency/);
});
test('reviewed projection keeps identical generation schema and prompt',()=>{
 const sources=require('../artifacts/difficulty-v122-evidence-rc/inputs/sources.json'),oldS=require(F.parent+'/app/difficulty-v122/schema.cjs'),oldP=require(F.parent+'/app/difficulty-v122/prompt.cjs'),P=require('../app/difficulty-v122/prompt.cjs');
 for(const p of sources.map(I.prepare).filter(p=>p.payload.projection_role_overlay)){
  assert.deepEqual(S.forRegistry(p.registry),oldS.forRegistry(p.registry));assert.deepEqual(P.render(p),oldP.render(p));
 }
});
