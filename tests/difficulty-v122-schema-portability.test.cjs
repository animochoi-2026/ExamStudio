'use strict';
require('./offline-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../app/difficulty-v122/schema.cjs');
const registry=require('../app/difficulty-v122/input.cjs').prepare({question_id:'portability-q',revision_id:'r',question:{body:'Find the angle.',choices:[]},scope:{grade:'중2'},difficulty_basis:'Use the given angle.',approved_routes:[{route_id:'r',source:'confirmed_solution',solution_excerpt:'Use the given angle.',reviewed_spans:[{origin:'approved_routes.r',start:0,end:'Use the given angle.'.length,text:'Use the given angle.',allowed_roles:['required_derivation'],allowed_target_labels:['main']}]}]}).registry;
test('empty optional ID namespaces use maxItems zero without lookaround',()=>{
 const schema=S.forRegistry(registry),d=schema.properties.viable_routes.items.properties.critical_discoveries.items.properties;
 for(const key of ['shared_premise_ids','optional_explanation_ids','answer_aggregation_ids']){
  assert.equal(d[key].maxItems,0);assert.equal(d[key].minItems,0);
  assert(!Object.hasOwn(d[key].items,'pattern'));
 }
 assert(!JSON.stringify(schema).includes('(?'));
});
test('nonempty source namespace keeps exact ID enum and rejects invented references by contract',()=>{
 const schema=S.forRegistry(registry),r=schema.properties.viable_routes.items.properties;
 assert.deepEqual(r.approved_route_id.enum,registry.approved_routes.map(x=>x.id));
 assert.deepEqual(r.critical_discoveries.items.properties.basis_step_ids.items.enum,registry.basis_steps.map(x=>x.id));
 assert.equal(r.critical_discoveries.items.properties.basis_step_ids.minItems,1);
 assert(!r.critical_discoveries.items.properties.basis_step_ids.items.enum.includes('invented'));
});
test('missing mandatory namespaces fail closed',()=>{
 assert.throws(()=>S.forRegistry({entries:[]}),/Required source namespace is empty/);
 assert.throws(()=>S.forRegistry({entries:registry.entries.filter(x=>x.namespace!=='basis_step_id')}),/Required source namespace is empty/);
});
