'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Shared=require('../app/difficulty-v122/legacy-shared-targets.cjs'),Projection=require('../app/difficulty-v122/projection.cjs');
function fixture(){
 const work={choice_check_count:0,required_case_count:1,calculation_steps:1,calculation_depends_on:[]};
 const node=(id,target,role,deps=[])=>({id,target_statement_id:target,role,depends_on:deps,premise_source_id:null,
  step_kind:'relation_transfer',work:{...work,calculation_depends_on:[...deps]}});
 const route={approved_route_id:'route',critical_discoveries:[
  node('s','main','shared_premise'),node('a','A','required_judgment',['s']),
  node('b','B','required_judgment',['s']),node('c','C','required_judgment')],
  targets:['A','B','C'].map((id,i)=>({target_statement_id:id,conclusion_ids:[['a','b','c'][i]],source_quote:id})),
  excluded_explanation_ids:[]};
 const registry={targets:['A','B','C'].map(id=>({id,approved_route_ids:['route']}))};
 const basis={id:'basis',allowed_roles:['shared_premise'],allowed_target_ids:['A','B','C']};
 return {route,registry,basis,node:route.critical_discoveries[0]};
}
test('shared main links only actual consumers and does not mutate the graph',()=>{
 const f=fixture(),before=JSON.stringify(f),r=Shared.resolve(f.route,f.node,f.registry,f.basis);
 assert.deepEqual(r.provenance.consumer_target_ids,['A','B']);
 assert.equal(r.target.id,'A');assert.equal(r.provenance.node_copies_created,0);
 assert.equal(JSON.stringify(f),before);
});
test('shared premise workloads and branch subgraphs are counted exactly as before',()=>{
 const f=fixture(),before=Projection.project(f.route);
 f.node.target_statement_id=Shared.resolve(f.route,f.node,f.registry,f.basis).target.id;
 const after=Projection.project(f.route);
 assert.deepEqual(after.work,before.work);
 assert.equal(after.work.required_case_count,4);
 assert.equal(after.work.required_sequential_calculation_steps,2);
 assert.deepEqual(after.retained_node_ids,before.retained_node_ids);
 assert.deepEqual(after.groups.map(g=>g.ds.map(d=>d.id)),before.groups.map(g=>g.ds.map(d=>d.id)));
 assert.equal(after.retained_node_ids.filter(id=>id==='s').length,1);
});
test('representative does not depend on target enumeration order',()=>{
 const f=fixture(),a=Shared.resolve(f.route,f.node,f.registry,f.basis);
 f.route.targets.reverse();const b=Shared.resolve(f.route,f.node,f.registry,f.basis);
 assert.deepEqual(a,b);
});
test('premise alias consumers retain the original node and zero additional work',()=>{
 const f=fixture();f.route.critical_discoveries.splice(1,0,{...structuredClone(f.node),id:'alias',premise_source_id:'s',
  work:{choice_check_count:0,required_case_count:0,calculation_steps:0,calculation_depends_on:[]}});
 f.route.critical_discoveries.find(d=>d.id==='b').depends_on=['alias'];
 f.route.critical_discoveries.find(d=>d.id==='b').work.calculation_depends_on=['alias'];
 assert.deepEqual(Shared.resolve(f.route,f.node,f.registry,f.basis).provenance.consumer_target_ids,['A','B']);
 const projection=Projection.project(f.route);
 assert.equal(projection.work.required_case_count,4);assert(!projection.retained_node_ids.includes('alias'));
});
test('ordinary main nodes are not silently remapped',()=>{
 const f=fixture();f.node.role='required_derivation';
 assert.throws(()=>Shared.resolve(f.route,f.node,f.registry,f.basis),/legacy shared main reference required/);
});
test('missing and cyclic dependencies fail closed',()=>{
 const f=fixture();f.route.critical_discoveries[1].depends_on=['missing'];
 assert.throws(()=>Shared.resolve(f.route,f.node,f.registry,f.basis),/missing shared premise dependency/);
 const g=fixture();g.node.depends_on=['a'];
 assert.throws(()=>Shared.resolve(g.route,g.node,g.registry,g.basis),/cyclic shared premise dependency/);
});
test('unapproved consumer scope and source roles are rejected',()=>{
 const f=fixture();f.basis.allowed_target_ids=['A'];
 assert.throws(()=>Shared.resolve(f.route,f.node,f.registry,f.basis),/consumer source mismatch/);
 const g=fixture();g.basis.allowed_roles=['optional_illustration'];
 assert.throws(()=>Shared.resolve(g.route,g.node,g.registry,g.basis),/source role mismatch/);
});
test('orphan shared premise cannot be assigned to arbitrary choices',()=>{
 const f=fixture();for(const d of f.route.critical_discoveries)d.depends_on=[];
 assert.throws(()=>Shared.resolve(f.route,f.node,f.registry,f.basis),/no target consumer/);
});
