'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const I=require('../app/difficulty-v12/input.cjs'),P=require('../app/difficulty-v121/profile.cjs'),R=require('../app/difficulty-v121/resume.cjs');
test('explicit resume defers unchanged unknown evidence without accepting or repeating it',()=>{
 const e={id:'q',questionId:'q',revisionId:'r',input:{inputVersion:'v',contentHash:'c',images:[]},validationContext:{storedAnswer:'2'}};
 const result={id:'q',key:'k',promptHash:P.promptHash,inputVersion:'v',evidence:{completed:false},raw:null,computed:{reason:'outcome_unknown_timeout'}};
 const decision={action:'defer_without_recall',questionId:'q',profileVersion:P.version,inputIdentity:P.inputIdentity(e),resultHash:I.hash(result),cacheKey:'k',authorization:'User requested resume; preserve unresolved call.'};
 assert.equal(R.verifyDeferred(e,decision,result).reason,'subscription_outcome_unconfirmed');
 assert.throws(()=>R.verifyDeferred({...e,revisionId:'other'},decision,result),/mismatch/);
 assert.throws(()=>R.verifyDeferred(e,decision,{...result,evidence:{completed:true}}),/mismatch/);
 const confirmed={...result,evidence:{completed:true}};assert.throws(()=>R.verifyDeferred(e,{...decision,resultHash:I.hash(confirmed)},confirmed),/unknown_result/);
 assert.throws(()=>R.verifyDeferred(e,{...decision,authorization:''},result),/mismatch/);
 assert.equal(result.evidence.completed,false);assert.equal(result.raw,null);
});
