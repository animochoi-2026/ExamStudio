'use strict';
// Legacy-only identity migration. Never clone a premise or change its graph/work.
// The singular field is a representative source reference; the existing DAG
// determines all consumers and the scorer's shared-premise deduplication.
function resolve(route,node,registry,basis){
 if(node.role!=='shared_premise'||node.target_statement_id!=='main')
  throw Error('legacy shared main reference required');
 if(!basis.allowed_roles.includes('shared_premise'))throw Error('shared premise source role mismatch');
 const nodes=new Map(route.critical_discoveries.map(d=>[d.id,d]));
 if(nodes.size!==route.critical_discoveries.length)throw Error('duplicate analysis node');
 const memo=new Map(),active=new Set();
 function ancestors(id){
  if(memo.has(id))return memo.get(id);
  const d=nodes.get(id);
  if(!d)throw Error('missing shared premise dependency');
  if(active.has(id))throw Error('cyclic shared premise dependency');
  active.add(id);const found=new Set([id]);
  for(const dep of [...d.depends_on,...(d.premise_source_id?[d.premise_source_id]:[])])
   for(const a of ancestors(dep))found.add(a);
  active.delete(id);memo.set(id,found);return found;
 }
 const consumers=[];
 for(const target of route.targets){
  if(target.conclusion_ids.includes(node.id))throw Error('shared main cannot replace a target conclusion');
  if(!target.conclusion_ids.some(id=>ancestors(id).has(node.id)))continue;
  const entry=registry.targets.find(t=>t.id===target.target_statement_id);
  if(!entry||!entry.approved_route_ids.includes(route.approved_route_id)||
   !basis.allowed_target_ids.includes(entry.id))throw Error('shared premise consumer source mismatch');
  consumers.push(entry);
 }
 if(!consumers.length)throw Error('shared premise has no target consumer');
 consumers.sort((a,b)=>a.id.localeCompare(b.id));
 return {target:consumers[0],provenance:{analysis_node_id:node.id,legacy_target:'main',
  approved_route_id:route.approved_route_id,basis_step_id:basis.id,
  representative_target_id:consumers[0].id,consumer_target_ids:[...new Set(consumers.map(t=>t.id))],
  mapping_method:'existing_dependency_graph',node_copies_created:0}};
}
module.exports={resolve};
