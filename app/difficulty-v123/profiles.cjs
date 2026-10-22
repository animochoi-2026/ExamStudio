'use strict';
const C=require('../difficulty-v122/canonical.cjs'),Compact=require('../difficulty-v122/compact.cjs'),Explicit=require('../difficulty-v122/explicit.cjs');
function select(context){
 const m=Explicit.manifest(context),groups=new Map();
 for(const r of m.relations){const key=r.route_id+'|'+r.basis_step_id;const tuple=C.hash({role:r.role,target:r.target_statement_id,branch:r.target_statement_id,source:r.source_span_ids});const xs=groups.get(key)||new Set();xs.add(tuple);groups.set(key,xs);}
 if(!m.relations.length)return 'semantic-review-required';
 return m.relations.some(r=>r.role==='shared_premise')||[...groups.values()].some(s=>s.size!==1)?'explicit-relations':'compact-unambiguous';
}
function codec(context){const name=select(context);if(name==='semantic-review-required')throw Error('semantic_review_required');return name==='explicit-relations'?Explicit:Compact;}
function evaluateResponse(raw,context,binding,id){
 try{const profile=select(context);if(profile==='semantic-review-required')throw Error('semantic_review_required');if(profile==='compact-unambiguous')return {...require('../difficulty-v122/response-adapter.cjs').evaluateResponse(raw,context,binding,id),contract_profile:profile};
 const result=require('../difficulty-v122/explicit-adapter.cjs').evaluateResponse(raw,context,binding,id);if(!result.validation.valid)return result;
 const normalized=result.system_evidence_relations.raw,m=Explicit.manifest(context),byId=new Map(m.relations.map(r=>[r.alias,r]));
 result.system_evidence_relations.resolved=Object.entries(raw.routes).flatMap(([slot,r])=>r.discoveries.map(n=>({route_id:normalized.viable_routes.find(x=>x.route_id===slot).approved_route_id,discovery_id:n.id,evidence_relation_ids:[byId.get(n.evidence_relation_id).evidence_relation_id],binding:'explicit_source_bound'})));
 if(context.projection_role_overlay)result.system_projection_role_overlay=require('../difficulty-v122/projection-role-overlay.cjs').graph(normalized,context);
 return result;
 }catch(e){return {validation:{valid:false,reason:'difficulty_structure_invalid',detail:e.message},computed:{status:'failed',score:null,problem_tier:null,reason:'difficulty_structure_invalid'}};}
}
module.exports={version:'difficulty-wire-r4',select,codec,schema:c=>codec(c).schema(c),manifest:c=>codec(c).manifest(c),encode:(r,c)=>codec(c).encode(r,c),render:p=>({...codec(p.payload).render(p),contract_profile:select(p.payload)}),evaluateResponse};
