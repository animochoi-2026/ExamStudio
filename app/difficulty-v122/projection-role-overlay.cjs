'use strict';
// User-approved projection metadata, never a basis-wide role or a difficulty rating.
const C=require('./canonical.cjs'),records=require('./projection-role-overlays.json').overlays;
function checked(o){
 const {overlay_hash,...value}=o;
 if(C.hash(value)!==overlay_hash||!o.user_approved||o.model_generated||o.basis_global_role_mutated)
  throw Error('projection role overlay hash/authorization mismatch');
 return o;
}
function forRegistry(registry){
 const matches=records.filter(o=>o.identity.question_id===registry.question_id&&o.identity.revision_id===registry.revision_id);
 if(!matches.length)return null;
 if(matches.length!==1)throw Error('ambiguous projection role overlay');
 const o=checked(matches[0]);
 for(const k of ['question_id','revision_id','difficulty_basis_hash','source_manifest_hash'])
  if(o.identity[k]!==registry[k])throw Error('projection role overlay identity mismatch: '+k);
 return o;
}
function resolve(identity,registry){
 const o=forRegistry(registry);if(!o)return null;
 for(const [k,v]of Object.entries(o.identity))if(identity[k]!==v)throw Error('projection role overlay input mismatch: '+k);
 return JSON.parse(JSON.stringify(o));
}
function verify(context){
 const known=forRegistry(context.source_registry),o=context.projection_role_overlay;
 if(!known){if(o)throw Error('foreign projection role overlay');return null;}
 if(!o||C.hash(checked(o))!==C.hash(known))throw Error('projection role overlay mismatch');
 if(C.hash(context.question)!==o.identity.question_content_hash)throw Error('projection role overlay content mismatch');
 return o;
}
function prepareRaw(raw,context){
 const o=verify(context);if(!o)return raw;
 const v=JSON.parse(JSON.stringify(raw)),all=context.evidence_relations.relations;
 for(const route of v.viable_routes||[]){
  const removed=new Set();
  route.critical_discoveries=route.critical_discoveries.filter(d=>{
   const system=o.system_nodes.filter(n=>n.scoring_role==='system_context_non_counted'&&
    n.route_id===route.approved_route_id&&C.hash(n.basis_step_ids)===C.hash(d.basis_step_ids));
   if(!system.length)return true;
   if(system.length!==1||d.role&&d.role!==system[0].projection_role)throw Error('system context promoted to required');
   if(route.targets.some(t=>t.conclusion_discovery_id===d.id||t.conclusion_ids?.includes(d.id)))throw Error('system context used as conclusion');
   removed.add(d.id);return false;
  });
  for(const d of route.critical_discoveries){
   const chosen=(d.evidence_relation_ids||[]).map(id=>{
    const r=all.find(x=>x.evidence_relation_id===id);if(!r)throw Error('unknown or foreign evidence relation');
    if(r.route_id!==route.approved_route_id||!r.allowed_branch_ids.includes(d.target_statement_id)||
     !d.basis_step_ids.includes(r.basis_step_id))throw Error('projection relation route/branch/basis mismatch');
    return r;
   });
   // Required subtypes are aliases, not different scoring roles. Excluded roles
   // cannot be used to hide a required node or promote an optional node.
   if(d.role&&!['required_judgment','required_derivation'].includes(d.role))throw Error('required projection role changed');
   const canonical=[];
   for(const basis of d.basis_step_ids){
    const rows=o.required_relations.filter(r=>r.basis_step_id===basis&&r.route_id===route.approved_route_id&&r.allowed_branch_ids.includes(d.target_statement_id));
    if(!rows.length)throw Error('node outside approved required projection');
    for(const r of chosen.filter(x=>x.basis_step_id===basis))
     if(!rows.some(x=>x.evidence_relation_id===r.evidence_relation_id))throw Error('excluded relation promoted to required');
    const preferred=rows.find(r=>r.audit_subtype===r.projection_role);
    if(!preferred)throw Error('approved projection subtype unavailable');
    canonical.push(preferred.evidence_relation_id);
   }
   d.evidence_relation_ids=canonical;
   d.role='required_derivation';d.role_reason='User-approved projection relation: required';
   d.premise_source_id=null;
   d.depends_on=d.depends_on.filter(id=>!removed.has(id));
   d.work.calculation_depends_on=d.work.calculation_depends_on.filter(id=>!removed.has(id));
  }
 }
 return v;
}
function graph(raw,context){
 const o=verify(context);if(!o)return null;
 const required=raw.viable_routes.flatMap(r=>r.critical_discoveries.map(d=>({
  discovery_id:d.id,route_id:r.approved_route_id,target_statement_id:d.target_statement_id,scoring_role:'required'
 })));
 return {overlay_hash:o.overlay_hash,system_nodes:o.system_nodes.map(n=>({...n,counted:false})),
  context_links:o.system_nodes.filter(n=>n.scoring_role==='system_context_non_counted').flatMap(n=>
   required.filter(d=>d.route_id===n.route_id&&n.allowed_target_ids.includes(d.target_statement_id)).map(d=>({
    projection_relation_id:n.projection_relation_id,discovery_id:d.discovery_id,route_id:d.route_id
   }))),required_nodes:required,shared_premise_count:o.system_nodes.filter(n=>n.scoring_role==='system_context_non_counted').length,
  shared_premise_duplicates:0,system_discovery_count:0,system_assembly_count:0,system_execution_count:0};
}
module.exports={resolve,forRegistry,verify,prepareRaw,graph};
