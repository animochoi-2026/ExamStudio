'use strict';
const I=require('../difficulty-v12/input.cjs'),P=require('./profile.cjs');
// An explicit resume decision may defer an unknown call; it never validates it,
// consumes another model call, or creates a final result for the question.
function verifyDeferred(entry,decision,result){
 if(decision.action!=='defer_without_recall'||decision.questionId!==entry.questionId||decision.profileVersion!==P.version||decision.inputIdentity!==P.inputIdentity(entry)||decision.resultHash!==I.hash(result)||!decision.authorization)throw Error('resume_decision_mismatch');
 if(result.id!==entry.id||result.key!==decision.cacheKey||result.promptHash!==P.promptHash||result.inputVersion!==entry.input.inputVersion||result.evidence?.completed!==false||result.raw!==null||!['outcome_unknown_timeout','subscription_outcome_unconfirmed'].includes(result.computed?.reason))throw Error('resume_requires_unchanged_unknown_result');
 return {questionId:entry.questionId,cacheKey:decision.cacheKey,reason:'subscription_outcome_unconfirmed'};
}
module.exports={verifyDeferred};
