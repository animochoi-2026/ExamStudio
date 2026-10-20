'use strict';
const E=require('./evaluator.cjs'),C=require('./canonical.cjs'),Policy=require('./policy.cjs');
function fromConfirmed({questionId,revisionId,question,scope,images=[],confirmation,approvedRoutes,reviewedBasis}){
 if(!confirmation)throw Error('confirmed difficulty basis required');
 const solution=reviewedBasis?.solution||question.intendedSolution?.solution||question.solution;
 if(!solution?.trim())throw Error('difficulty basis missing');
 return {question_id:questionId,revision_id:revisionId,question,scope,images,difficulty_basis:solution,
  difficulty_basis_hash:reviewedBasis?.difficulty_basis_hash,
  difficulty_basis_source:reviewedBasis?'approved_review_envelope':'confirmed_solution',
  approved_routes:approvedRoutes||[{route_id:'approved-main',source:'confirmed_solution',solution_excerpt:solution.split('[서술형 채점기준')[0].trim()}],
  source_warning:reviewedBasis?.source_warning||[],
  approved_interpretation:question.intendedSolution?.interpretation||''};
}
// Each adapter deliberately accepts ONLY the difficulty runtime. Solution-model
// settings are not forwarded, persisted, or modified.
function options(source,runtime){
 return {source,policyVersion:runtime.policyVersion,versions:runtime.versions,instructions:runtime.instructions,
  store:runtime.store,runStage:runtime.runStage,readCurrent:runtime.readCurrent,circuit:runtime.circuit,
  smoke:!!runtime.smoke,savedOnly:!!runtime.savedOnly};
}
const desktop=(source,runtime)=>E.evaluate(options(source,runtime));
const server=(source,runtime)=>E.evaluate(options(source,runtime));
async function batch(sources,runtime){
 return require('./phase-batch.cjs').run(sources,runtime);
}
function policyRequest(version){Policy.assertPolicy(version);return {...Policy,criteria_payload_hash:null};}
module.exports={fromConfirmed,desktop,server,batch,policyRequest};
