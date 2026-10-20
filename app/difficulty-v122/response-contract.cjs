'use strict';
// Wire-only identifiers and system metadata. No difficulty judgment lives here.
const C=require('./canonical.cjs'),Source=require('./source.cjs');
const version='request-bound-evidence-relations-r3';
function relations(registry){
 Source.verify(registry);
 return registry.approved_routes.flatMap(r=>registry.targets.filter(t=>t.approved_route_ids.includes(r.id)).map(t=>({
  approved_route_id:r.id,target_statement_id:t.id,
  conclusion_selection:{collection:'critical_discoveries',id_field:'id',
   match_target_statement_id:t.id,match_approved_route_id:r.id,
   excluded_roles:['optional_illustration','answer_aggregation']}
 })));
}
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function bind(prepared,requestId){
 if(typeof requestId!=='string'||!requestId)throw Error('request ID missing');
 Source.verify(prepared.registry);
 const value={version,request_id:requestId,question_id:prepared.identities.question_id,revision_id:prepared.identities.revision_id,
  difficulty_basis_hash:prepared.identities.difficulty_basis_hash,source_manifest_hash:prepared.registry.source_manifest_hash,
  input_hash:C.hash(prepared.payload),evidence_manifest_hash:prepared.payload.evidence_relations.evidence_manifest_hash};
 if(prepared.payload.projection_role_overlay)value.projection_role_overlay_hash=prepared.payload.projection_role_overlay.overlay_hash;
 require('./evidence.cjs').verify(prepared.payload.evidence_relations,prepared.registry);
 for(const k of ['question_id','revision_id','difficulty_basis_hash','source_manifest_hash'])
  if(value[k]!==prepared.registry[k]||value[k]!==prepared.identities[k])throw Error('request source identity mismatch');
 return freeze({...value,envelope_hash:C.hash(value)});
}
function verify(binding,context,requestId){
 if(!binding||binding.version!==version)throw Error('request envelope missing');
 const {envelope_hash,...rest}=binding;
 if(C.hash(rest)!==envelope_hash)throw Error('request envelope tampered');
 if(binding.request_id!==requestId)throw Error('foreign request envelope');
 Source.verify(context.source_registry);
 for(const k of ['question_id','revision_id','difficulty_basis_hash','source_manifest_hash'])
  if(binding[k]!==context.source_registry[k])throw Error('request source identity mismatch: '+k);
 if(binding.source_manifest_hash!==context.source_manifest_hash||binding.difficulty_basis_hash!==context.difficulty_basis_hash||
  binding.input_hash!==C.hash(context))throw Error('request input changed');
 if(C.hash(context.target_conclusion_relations)!==C.hash(relations(context.source_registry)))throw Error('target relation manifest mismatch');
 require('./evidence.cjs').verify(context.evidence_relations,context.source_registry);
 require('./projection-role-overlay.cjs').verify(context);
 if(binding.projection_role_overlay_hash!==context.projection_role_overlay?.overlay_hash)throw Error('request projection role identity mismatch');
 if(binding.evidence_manifest_hash!==context.evidence_relations.evidence_manifest_hash)throw Error('request evidence identity mismatch');
 return true;
}
function normalize(raw,context,binding,requestId){
 verify(binding,context,requestId);
 // Even a correct model-supplied system field is forbidden, never trusted.
 if(Object.hasOwn(raw,'source_manifest_hash')||Object.hasOwn(raw,'system_fields'))throw Error('model supplied system metadata');
 const v=JSON.parse(JSON.stringify(raw)),links=relations(context.source_registry);
 for(const r of v.viable_routes){
  const nodes=new Map();
  for(const d of r.critical_discoveries){if(nodes.has(d.id))throw Error('duplicate discovery ID');nodes.set(d.id,d);}
  for(const t of r.targets){
   const known=context.source_registry.targets.find(x=>x.id===t.target_statement_id);
   if(!known)throw Error('target does not exist');
   const d=nodes.get(t.conclusion_discovery_id);
   if(!d)throw Error('conclusion discovery does not exist in branch');
   if(d.target_statement_id!==t.target_statement_id)throw Error('conclusion belongs to different branch');
   const link=links.find(x=>x.approved_route_id===r.approved_route_id&&x.target_statement_id===t.target_statement_id);
   if(!link||link.conclusion_selection.match_target_statement_id!==d.target_statement_id||
    link.conclusion_selection.match_approved_route_id!==r.approved_route_id||
    link.conclusion_selection.excluded_roles.includes(d.role))throw Error('target conclusion link not allowed');
   t.conclusion_ids=[t.conclusion_discovery_id];delete t.conclusion_discovery_id;
  }
 }
 v.source_manifest_hash=binding.source_manifest_hash;
 return v;
}
module.exports={version,relations,bind,verify,normalize};
