'use strict';
const C=require('./canonical.cjs');
// Read existing, committed production review evidence. This grants no new approval
// and never copies historical model ratings into a new difficulty request.
function resolve(catalog,question){
 const active=catalog.metadata?.difficulty?.v121Active;
 const envelope=active?.production_review_envelope;
 if(!envelope)return null;
 const requireMatch=(ok,field)=>{if(!ok)throw Error('approved_review_mismatch:'+field);};
 requireMatch(envelope.version==='production-review-envelope-1'&&
  envelope.authorization==='user-approved-exception-preservation-20261019','authorization');
 requireMatch(active.final_status==='complete'&&active.question_id===catalog.question_id&&
  active.question_revision_id===catalog.revision_id,'identity');
 requireMatch(active.source_hash_method==='sha256(canonical JSON catalog.content/catalog.files)','hash_method');
 requireMatch(C.hash(catalog.content)===active.source_content_hash,'source_content');
 requireMatch(C.hash(catalog.files)===active.source_image_asset_hash,'source_images');
 requireMatch(/^[a-f0-9]{64}$/.test(active.reviewed_evaluation_input_hash||''),'reviewed_input_hash');
 const approved=envelope.approved_result;
 requireMatch(approved?.questionId===catalog.question_id&&
  (approved.originalRevisionId||approved.originalRevision)===catalog.revision_id,'approved_identity');
 let solution,reviewedQuestion={...question};
 if(approved.kind==='local_source_review_derivative'&&approved.status==='locally_validated'){
  requireMatch(approved.correctedQuestion?.body?.trim()&&approved.reviewedResponse?.solution_summary?.trim(),'reviewed_source');
  // Only the source fields already approved in this envelope enter the input.
  for(const field of ['body','choices','diagram','statementBox'])
   if(approved.correctedQuestion[field]!==undefined)reviewedQuestion[field]=structuredClone(approved.correctedQuestion[field]);
  solution=approved.reviewedResponse.solution_summary;
 }else if(approved.review?.policy==='intended-answer-20261019-1'){
  requireMatch(typeof approved.sourceSolution==='string'&&approved.sourceSolution.trim(),'source_solution');
  requireMatch(C.bytesHash(approved.sourceSolution)===approved.review.sourceSolutionHash,'source_solution_hash');
  solution=approved.sourceSolution;
 }else throw Error('approved_review_unsupported');
 const warning=typeof approved.review==='string'?approved.review:approved.review?.rationale;
 const provenance={authorization:envelope.authorization,reference:envelope.reference,
  approved_result_hash:C.hash(approved),source_content_hash:active.source_content_hash,
  source_image_asset_hash:active.source_image_asset_hash,
  reviewed_evaluation_input_hash:active.reviewed_evaluation_input_hash};
 return {question:reviewedQuestion,reviewedBasis:{solution,
  difficulty_basis_hash:C.hash({solution,provenance}),source_warning:warning?[warning]:[]},
  approvedRoutes:[{route_id:'approved-main',source:'approved_review_envelope',solution_excerpt:solution}],
  provenance};
}
module.exports={resolve};
