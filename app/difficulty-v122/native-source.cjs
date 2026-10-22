'use strict';
const C=require('./canonical.cjs'),Adapter=require('./adapters.cjs');
// Asset hydration only; no legacy prompt, scorer or validator is imported.
async function fromNative(catalog,bundle,read,approvedReview=null){
 if(bundle.questionId!==catalog.question_id||bundle.revisionId!==catalog.revision_id)throw Error('source_revision_mismatch');
 const native=bundle.native,project=native?.project;
 const problem=project?.problems?.find(p=>[p.original,...(p.variants||[])].some(q=>q?.id===native.targetQuestionId));
 const question=[problem?.original,...(problem?.variants||[])].find(q=>q?.id===native?.targetQuestionId);
 if(!question)throw Error('native_question_missing');
 const refs=[...(problem.cropPaths||[]),question.sourceFigure?.path,...(question.sourceFigures||[]).map(f=>f.path)].filter(Boolean);
 if(refs.some(v=>!v.startsWith('bank-asset:')))throw Error('unresolved_image_reference');
 const images=[];
 for(const key of new Set(refs.map(v=>v.slice(11)))){
  const f=catalog.files.find(f=>f.role==='asset'&&f.key===key);
  if(!f)throw Error('source_image_missing');
  const bytes=Buffer.from(await read(f));
  if(bytes.length!==f.size||C.bytesHash(bytes)!==f.sha256)throw Error('source_image_hash_mismatch');
  const mime=bytes[0]===137&&bytes.toString('ascii',1,4)==='PNG'?'image/png':
   bytes[0]===255&&bytes[1]===216?'image/jpeg':
   bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
  if(!mime)throw Error('unsupported_source_image');
  images.push({sha256:f.sha256,fileId:f.id,bytes:bytes.length,dataUrl:'data:'+mime+';base64,'+bytes.toString('base64')});
 }
 const approved=require('../difficulty-v123/review-source.cjs').resolve(catalog,approvedReview,images);if(approved)return approved;
 const reviews=catalog.metadata?.reviews||{};
 const confirmed=reviews.solution?.status==='approved'||reviews.answer?.status==='passed';
 const review=confirmed?null:require('./approved-review.cjs').resolve(catalog,question);
 const source=Adapter.fromConfirmed({questionId:catalog.question_id,revisionId:catalog.revision_id,
  question:review?.question||{...question,solution:catalog.content?.solution||question.solution},images,
  scope:project.scope||catalog.metadata?.difficulty?.scope,
  confirmation:confirmed||!!review,reviewedBasis:review?.reviewedBasis,approvedRoutes:review?.approvedRoutes});
 if(review)source.source_provenance=review.provenance;
 return source;
}
module.exports={fromNative};
