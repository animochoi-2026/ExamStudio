'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadSourceReview,orderReviewGroups}=require('../web-bank/source-review.cjs');
const row=(n,i=n)=>({question_id:'q'+i,revision_id:'r'+i,metadata:{source:{originalNumber:String(n),position:{page:100-Number(i)||1}}}});
test('exam review sorts all fetch pages by printed number and supplies the same previous/next sequence',async()=>{
 const rows=Array.from({length:62},(_,i)=>row(62-i));rows.push(row('[서답형2]','w2'),row('서답형1','w1'));
 const before=JSON.stringify(rows),calls=[];
 const sorted=await loadSourceReview(async(name,args)=>{assert.equal(name,'bank_source_questions');calls.push(args.start_at);return rows.slice(args.start_at,args.start_at+50);},'space','exam');
 assert.deepEqual(calls,[0,50]);assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(sorted.map(x=>x.question_id),[...Array.from({length:62},(_,i)=>'q'+(i+1)),'qw1','qw2']);
 const navigation=await import('../web-bank/question-navigation.js');navigation.setQuestionSequence(sorted);
 const neighbors=await navigation.questionNeighbors('r8');assert.equal(neighbors.previous.question_id,'q7');assert.equal(neighbors.next.question_id,'q9');assert.equal(neighbors.count,64);
});
test('source navigation cancellation and retrieval failures never publish a partial exam',async()=>{
 assert.equal(await loadSourceReview(async()=>[row(1)],'space','exam',()=>false),null);
 await assert.rejects(loadSourceReview(async()=>{throw Error('offline');},'space','exam'),/offline/);
});
test('filtered review and search retain exam groups and sort their printed numbers before pagination',()=>{
 const entries=[['a',14],['b',8],['a',1],['b',1],['a',8]].map(([exam,n])=>{const r=row(n,exam+n);r.metadata.source.documentId=exam;return r;});
 assert.deepEqual(orderReviewGroups(entries).map(x=>x.question_id),['qa1','qa8','qa14','qb1','qb8']);
});
