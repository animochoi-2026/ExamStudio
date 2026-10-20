'use strict';
const C=require('./canonical.cjs'),Source=require('./source.cjs');
function prepare(source){
 const {question_id,revision_id,question,scope,images=[]}=source;
 if(!question_id||!revision_id)throw Error('question/revision required');
 if(!scope||!Object.keys(scope).length)throw Error('curriculum scope missing');
 if(!question?.body?.trim())throw Error('question body missing');
 if(!source.difficulty_basis?.trim())throw Error('difficulty basis missing');
 for(const im of images)if(!/^[a-f0-9]{64}$/.test(im.sha256))throw Error('image hash missing');
 const approved_routes=source.approved_routes;
 if(!approved_routes?.length)throw Error('approved route missing');
 const cleanQuestion={body:C.text(question.body),choices:(question.choices||[]).map(C.text),statementBox:question.statementBox||[],diagram:question.diagram||question.observedDiagram||null};
 const basisHash=source.difficulty_basis_hash||C.hash({basis:source.difficulty_basis,approved_routes,scope});
 const input=require('./source-review.cjs').apply({question_id,revision_id,difficulty_basis_hash:basisHash,question:cleanQuestion,approved_routes});
 const registry=Source.build(input);Source.verify(registry);
 const mapped=input.approved_routes.map(r=>({...r,route_id:registry.approved_routes.find(e=>e.original_route_id===r.route_id).id}));
 const identities={
  question_id,revision_id,question_content_hash:C.hash(cleanQuestion),image_asset_hash:C.hash(images.map(x=>x.sha256)),
  curriculum_scope_hash:C.hash(scope),difficulty_basis_hash:basisHash,approved_route_manifest_hash:C.hash(mapped),
  source_id_contract_version:Source.version,source_manifest_hash:registry.source_manifest_hash
 };
 const payload={question:cleanQuestion,curriculum_scope:scope.grade||source.curriculum_scope,scope_context:scope,
  solution_restrictions:source.solution_restrictions||[],difficulty_basis_source:source.difficulty_basis_source||'confirmed_solution',
  difficulty_basis:source.difficulty_basis,difficulty_basis_hash:basisHash,approved_route_ids:mapped.map(r=>r.route_id),approved_routes:mapped,
  approved_interpretation:source.approved_interpretation||'',source_warning:source.source_warning||[],
  source_manifest_hash:registry.source_manifest_hash,source_registry:registry,
  target_conclusion_relations:require('./response-contract.cjs').relations(registry),
  evidence_relations:require('./evidence.cjs').build(registry)};
 const roleOverlay=require('./projection-role-overlay.cjs').resolve(identities,registry);
 if(roleOverlay)payload.projection_role_overlay=roleOverlay;
 return {identities,payload,registry,images,rendered_input_hash:C.hash(payload),
  ...(source.source_provenance?{source_provenance:source.source_provenance}:{})};
}
module.exports={prepare};
