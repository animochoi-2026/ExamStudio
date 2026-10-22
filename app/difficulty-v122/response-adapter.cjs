'use strict';
const V=require('./validate.cjs'),Codec=require('./compact.cjs'),C=require('./canonical.cjs');
function evaluateResponse(raw,context,binding,requestId){
 try{
  require('./response-contract.cjs').verify(binding,context,requestId);
  const normalized=Codec.decode(raw,context),checked=V.evaluate(normalized,context);
  const manifest=Codec.manifest(context),byId=new Map(manifest.relations.map(r=>[r.alias,r]));
  const resolved=Object.entries(raw.routes).flatMap(([slot,r])=>r.discoveries.map(d=>({route_id:normalized.viable_routes.find(r=>r.route_id===slot).approved_route_id,discovery_id:d.id,evidence_relation_ids:[d.evidence_relation_id,...d.additional_evidence_relation_ids].map(id=>byId.get(id).evidence_relation_id),binding:'compact_source_bound'})));
  return {...checked,system_fields:binding,system_evidence_relations:{raw:normalized,resolved,manifest_hash:context.evidence_relations.evidence_manifest_hash},compact_manifest_hash:manifest.hash,
   ...(context.projection_role_overlay?{system_projection_role_overlay:require('./projection-role-overlay.cjs').graph(normalized,context)}:{})};
 }catch(e){return {validation:{valid:false,reason:'difficulty_structure_invalid',detail:e.message},computed:{status:'failed',reason:'difficulty_structure_invalid',detail:e.message,score:null,problem_tier:null}};}
}
module.exports={...V,evaluateResponse};
