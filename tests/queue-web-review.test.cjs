'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{approve}=require('../app/queue-web-review.cjs');
test('lost review acknowledgement is reconciled without repeating write or upload',async()=>{
 let writes=0,saves=0,row={question_id:'q',committed:true,visibility:'shared_pending',review_version:0};const job={questionId:'q',revisionId:'r'},bank={save(){saves++;},storage:{kind:'shared',rows:async()=>[row],rpc:async()=>{writes++;row={...row,visibility:'approved',review_version:1};throw Error('reply lost');}}};
 await approve(bank,job);await approve(bank,job);assert.equal(writes,1);assert.equal(job.queueWebReviewed.version,1);assert.equal(saves,2);
});
test('permission/conflict failure does not claim a completed review',async()=>{
 let calls=0;const job={questionId:'q',revisionId:'r'},bank={save:()=>assert.fail('failure must not be saved as reviewed'),storage:{kind:'shared',rows:async()=>[{question_id:'q',committed:true,visibility:'shared_pending',review_version:2}],rpc:async()=>{calls++;throw Object.assign(Error('conflict'),{status:409});}}};await assert.rejects(approve(bank,job),/conflict/);assert.equal(calls,1);assert.equal(job.queueWebReviewed,undefined);
});
