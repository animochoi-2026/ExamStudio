'use strict';
const Source=require('./source.cjs');
function audit(raw,context){
 const m=context.source_registry;Source.verify(m);
 if(raw.source_manifest_hash!==m.source_manifest_hash||context.source_manifest_hash!==m.source_manifest_hash)throw Error('source manifest hash mismatch');
 const entries=new Map(m.entries.map(e=>[e.id,e]));
 function get(id,namespace,route){
  const e=entries.get(id);if(!e||e.namespace!==namespace)throw Error('unknown/wrong source ID '+namespace);
  if(route&&e.approved_route_id&&e.approved_route_id!==route)throw Error('source route mismatch');
  return e;
 }
 for(const r of raw.viable_routes){
  get(r.approved_route_id,'approved_route_id');
  const targets=new Set();
  for(const t of r.targets){
   if(targets.has(t.target_statement_id))throw Error('duplicate target');targets.add(t.target_statement_id);
   const e=get(t.target_statement_id,'target_statement_id');
   if(e.source_span_id!==t.source_span_id||!e.approved_route_ids.includes(r.approved_route_id))throw Error('target source identity mismatch');
  }
  for(const d of r.critical_discoveries){
   if(d.premise_source_id!==null){
    const origin=r.critical_discoveries.find(n=>n.id===d.premise_source_id);
    const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
    if(!origin||origin.role!=='shared_premise'||d.role!=='shared_premise'||
     !same(origin.shared_premise_ids,d.shared_premise_ids)||!same(origin.basis_step_ids,d.basis_step_ids))
     throw Error('premise alias source identity mismatch');
   }
   const target=get(d.target_statement_id,'target_statement_id');
   if(!targets.has(target.id)&&d.role!=='shared_premise'&&d.role!=='answer_aggregation'&&d.role!=='optional_illustration')throw Error('unrepresented target');
   if(!d.basis_step_ids.length||!d.source_span_ids.length)throw Error('mandatory source ID missing');
   if(new Set(d.basis_step_ids).size!==d.basis_step_ids.length||new Set(d.source_span_ids).size!==d.source_span_ids.length)throw Error('duplicate source reference');
   const basis=d.basis_step_ids.map(id=>get(id,'basis_step_id',r.approved_route_id));
   for(const b of basis){
    if(!b.allowed_roles.includes(d.role)||!b.allowed_target_ids.includes(target.id))throw Error('source role/target mismatch');
    if(!d.source_span_ids.includes(b.source_span_id))throw Error('source span missing');
   }
   for(const id of d.source_span_ids){get(id,'source_span_id',r.approved_route_id);if(!basis.some(b=>b.source_span_id===id))throw Error('unlinked source span');}
   for(const [field,ns,role]of [['shared_premise_ids','shared_premise_id','shared_premise'],['optional_explanation_ids','optional_explanation_id','optional_illustration'],['answer_aggregation_ids','answer_aggregation_id','answer_aggregation']]){
    if(d.role===role&&!d[field].length)throw Error('role source ID missing');
    for(const id of d[field]){
     const e=get(id,ns,r.approved_route_id);
     if(d.role!==role||!basis.some(b=>b.id===e.basis_step_id))throw Error('role source identity mismatch');
    }
   }
  }
  const ex=r.execution_audit;
  for(const id of ex.compression_basis_step_ids)get(id,'basis_step_id',r.approved_route_id);
  if(ex.compression_is_approved_in_basis&&!ex.compression_basis_step_ids.length)throw Error('compression source missing');
 }
 return true;
}
module.exports={audit};
