const test=require('node:test'),assert=require('node:assert/strict');
const {createHomeCache}=require('../web-bank/home-cache.cjs'),R=require('../web-bank/source-review.cjs');
test('home sections keep values across time and only explicit refresh or invalidation reloads',async()=>{
 let now=0,calls=0;const c=createHomeCache({now:()=>now}),load=async()=>({dashboard:{questions:++calls},recentSources:[]});
 await c.get(load);now=86400000;await c.get(load);assert.equal(calls,1);assert(c.fresh());await c.get(load,{force:true});assert.equal(calls,2);
 await assert.rejects(c.get(()=>{throw Error('offline');},{force:true}));assert.equal(c.peek().dashboard.questions,2);c.setScope({grade:'m3'});assert.equal(c.peek(),null);
});
test('warning acknowledgement is revision and evidence bound; other warnings and originals survive',()=>{
 const c={revision_id:'r1',visibility:'shared_pending',metadata:{reviews:{recognition:{uncertainties:['번호 확인','그림 확인']}}},confirmed:{}},before=JSON.stringify(c.metadata);
 c.confirmed.uploadReview={revisionId:'r1',evidence:structuredClone(R.reviewEvidence(c)),reasons:['번호 확인']};
 assert.deepEqual(R.uploadReviewReasons(c),['그림 확인']);assert.equal(JSON.stringify(c.metadata),before);
 c.revision_conflict=true;assert(R.uploadReviewReasons(c).includes('수정 버전 충돌'));c.revision_id='r2';assert(R.uploadReviewReasons(c).includes('번호 확인'));c.revision_id='r1';c.metadata.reviews.recognition.uncertainties.push('새 경고');assert(R.uploadReviewReasons(c).includes('번호 확인'));
});
test('full and compact difficulty cards have the same simple label without changing evaluations',async()=>{
 const {score}=await import('../web-bank/presentation.js');
 const c={revision_id:'r1',metadata:{difficulty:{v123Active:{question_revision_id:'r1',final_status:'complete',final_score:9.8,final_tier:'T5',computed:{base_tier:'T4',promotions:['assembly']}}}}},before=JSON.stringify(c);
 assert.equal(score(c),'9.8점 / 상');assert.equal(score({...c,summaryDifficulty:{score:9.8,compositionBand:'killer'}}),'9.8점 / 상');assert.equal(JSON.stringify(c),before);
});
