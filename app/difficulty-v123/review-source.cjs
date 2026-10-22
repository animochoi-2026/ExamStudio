'use strict';
const C=require('../difficulty-v122/canonical.cjs'),R=require('./evaluation-review.cjs');
const clean=q=>({body:C.text(q.body),choices:(q.choices||[]).map(C.text),statementBox:q.statementBox||[],diagram:q.diagram||q.observedDiagram||null});
function resolve(catalog,approved,images,localQuestion){
 if(!approved)return null;
 if(localQuestion&&C.hash(clean(localQuestion))!==C.hash(clean(approved.question)))throw Error('local_source_review_changed');
 const ordered=approved.image_sha256.map(h=>images.find(i=>i.sha256===h));
 if(ordered.some(x=>!x)||ordered.length!==images.length)throw Error('review_image_identity_mismatch');
 return R.resolve({question:approved.question,scope:approved.scope,images:ordered,question_id:catalog.question_id,revision_id:catalog.revision_id,catalog,review_envelope:approved.review_envelope});
}
module.exports={resolve};

