'use strict';
// A legacy answer collection may cover several completed targets. Recover its
// contributors from the saved DAG, not from text similarity or answer correctness.
function resolve(route,node,registry,basis){
 if(node.role!=='answer_aggregation'||node.target_statement_id!=='main'||!basis.allowed_roles.includes('answer_aggregation'))
  throw Error('legacy aggregation source role mismatch');
 const nodes=new Map(route.critical_discoveries.map(d=>[d.id,d])),anc=new Set(),active=new Set();
 function visit(id){
  if(active.has(id))throw Error('cyclic aggregation dependency');
  if(anc.has(id))return;
  const d=nodes.get(id);if(!d)throw Error('missing aggregation dependency');
  active.add(id);for(const dep of d.depends_on)visit(dep);active.delete(id);anc.add(id);
 }
 for(const dep of node.depends_on)visit(dep);
 const contributors=route.targets.filter(t=>t.conclusion_ids.length&&t.conclusion_ids.every(id=>anc.has(id))).map(t=>{
  const target=registry.targets.find(e=>e.id===t.target_statement_id);
  if(!target||!basis.allowed_target_ids.includes(target.id))throw Error('aggregation contributor source mismatch');
  return target;
 });
 if(!contributors.length)throw Error('aggregation has no completed target');
 for(const dep of node.depends_on)if(!contributors.some(t=>route.targets.find(r=>r.target_statement_id===t.id).conclusion_ids.includes(dep)))
  throw Error('aggregation direct dependency is not a completed target');
 contributors.sort((a,b)=>a.source_order-b.source_order);
 return {target:contributors[0],provenance:{analysis_node_id:node.id,legacy_target:'main',basis_step_id:basis.id,
  contributor_target_ids:contributors.map(t=>t.id),mapping_method:'existing_completed_target_dependencies',
  node_copies_created:0,scoring_excluded:true}};
}
module.exports={resolve};
