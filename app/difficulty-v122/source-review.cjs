'use strict';
// Previously approved source annotations, bound to exact inputs. No model output,
// scores, item numbers, inferred roles, or approximate matching are consulted.
const C=require('./canonical.cjs'),records=require('./source-reference-reviews.json').reviews;
function apply(input){
 const matches=records.filter(r=>r.question_id===input.question_id&&r.revision_id===input.revision_id&&r.difficulty_basis_hash===input.difficulty_basis_hash);
 if(!matches.length)return input;
 if(matches.length!==1)throw Error('ambiguous source review');
 const review=matches[0];
 if(C.hash(input.question)!==review.question_hash)throw Error('source review question hash mismatch');
 const approved_routes=input.approved_routes.map(route=>{
  const prior=review.routes.filter(r=>r.route_id===route.route_id);
  if(prior.length!==1)throw Error('source review route mismatch');
  const approved=prior[0];
  if(C.bytesHash(Buffer.from(route.solution_excerpt))!==approved.solution_sha256)throw Error('source review basis text hash mismatch');
  const reviewed_spans=approved.spans.map(s=>{
   const text=route.solution_excerpt.slice(s.start,s.end);
   if(C.bytesHash(Buffer.from(text))!==s.text_sha256)throw Error('source review span hash mismatch');
   return {origin:'approved_routes.'+route.route_id,start:s.start,end:s.end,text,
    allowed_roles:[...s.allowed_roles],allowed_target_labels:[...s.allowed_target_labels]};
  });
  if(route.reviewed_spans&&C.hash(route.reviewed_spans)!==C.hash(reviewed_spans))throw Error('conflicting source review');
  return {...route,reviewed_spans};
 });
 return {...input,approved_routes};
}
module.exports={apply};
