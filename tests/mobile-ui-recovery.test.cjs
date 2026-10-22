'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHomeCache}=require('../web-bank/home-cache.cjs'),{readRequest,errorText}=require('../web-bank/request-errors.cjs'),{needsUploadReview}=require('../web-bank/source-review.cjs'),{recover}=require('../web-bank/shortage-recovery.cjs'),B=require('../app/bank-exam-model.cjs'),sets=require('../app/question-sets.cjs');
const row=(id,score,unit='m2-8.7',school='지정중',type='선택형')=>({question_id:id,revision_id:'r-'+id,metadata:{source:{school,grade:'중2'},content:{responseType:type},classification:{primaryUnit:{id:unit}}},confirmed:{difficulty:score}});
const rules={count:6,types:{선택형:5,서술형:1},profile:{low:50,middle:50,high:0,targetAverage:4},units:['m2-8.7','m2-7.1'],schools:['지정중','둘째중'],schoolMode:'equal',scopeDistribution:true};
test('home killer count uses current stored tier mapping, including high scores in T4',async()=>{
 const {homeDifficultySummary}=await import('../web-bank/home-view.js');
 const items=[['T1',3.7,'low'],['T4',9.2,'high'],['T5',9.7,'killer']].map(([tier,score,band],i)=>({question_id:'q'+i,summaryDifficulty:{score,finalTier:tier,compositionBand:band,displayMappingVersion:'tier-display-v123-1'}}));
 const result=homeDifficultySummary(items);assert.equal(result.counts.low,1);assert.equal(result.counts.high,2);assert.equal(result.killerCount,1);
});
test('home reuses confirmed values, deduplicates refresh and retains stale data on failure; context changes discard responses',async()=>{
 let now=0,calls=0;const cache=createHomeCache({now:()=>now,ttl:100});cache.setScope({user:'a',grade:'m2'});const load=async()=>({n:++calls});assert.equal((await cache.get(load)).n,1);assert.equal((await cache.get(load)).n,1);now=101;await assert.rejects(cache.get(()=>{throw Error('offline');}));assert.deepEqual(cache.peek(),{n:1});assert.equal((await cache.get(load)).n,2);
 let resolve;const pending=cache.get(()=>new Promise(r=>resolve=r),{force:true});await Promise.resolve();cache.setScope({user:'a',grade:'m3'});resolve({n:3});await assert.rejects(pending,/범위/);assert.equal(cache.peek(),null);
 const p=cache.get(load),q=cache.get(load);await Promise.all([p,q]);assert.equal(calls,3);cache.clear();assert.equal(cache.peek(),null);
});
test('transport read failure retries once; writes and database errors never retry',async()=>{
 let calls=0;const run=async()=>++calls===1?{error:{message:'TypeError: Failed to fetch'}}:{data:1};assert.equal((await readRequest('bank_home_summary',run)).data,1);assert.equal(calls,2);calls=0;await readRequest('bank_review_save',run);assert.equal(calls,1);calls=0;await readRequest('bank_home_summary',async()=>{calls++;return {error:{message:'statement timeout'}};});assert.equal(calls,1);assert.match(errorText('TypeError: Failed to fetch'),/연결/);
});
test('review prioritizes unresolved upload issues, not all pending or ignored/confirmed warnings',()=>{
 const r={visibility:'shared_pending',metadata:{reviews:{recognition:{confirmed:false,uncertainties:[]}}}};assert.equal(needsUploadReview(r),false);r.metadata.reviews.recognition.uncertainties=[{id:'u',text:'원문 숫자 확인'}];assert.equal(needsUploadReview(r),true);r.metadata.reviews.recognition.ignoredUncertainties=['u'];assert.equal(needsUploadReview(r),false);r.metadata.reviews.diagram={status:'partial',errors:[],geometry:{ok:true}};assert.equal(needsUploadReview(r),false);r.metadata.reviews.diagram.errors=['그림 조건 불일치'];assert.equal(needsUploadReview(r),true);r.visibility='approved';assert.equal(needsUploadReview(r),false);
});
test('school recovery fills impossible quotas but preserves count, format, scope, exclusions and original data',()=>{
 const pool=[row('a',2),...Array.from({length:7},(_,i)=>row('b'+i,5)),row('w',8,'m2-7.1','지정중','서술형'),row('outside',2,'m2-6.1'),row('foreign',2,'m2-8.7','타학교')],before=JSON.stringify(pool),r={...rules,excludeIds:['b0']};assert.equal(B.selectQuestions(pool,r).complete,false);const result=recover(pool,r,{mode:'school'});assert(result.complete);assert.equal(result.items.length,6);assert.equal(result.items.filter(x=>B.responseType(x.metadata)==='서술형').length,1);assert(!result.items.some(x=>['outside','foreign','b0'].includes(x.question_id)));assert.equal(JSON.stringify(pool),before);assert.equal(JSON.stringify(result.rules),JSON.stringify(r));
});
test('balanced recovery improves feasible distribution and keeps required other-school sets together',()=>{
 const pool=[...Array.from({length:8},(_,i)=>row('a'+i,5)),row('low',2),row('w',8,'m2-7.1','지정중','서술형'),row('x',2,'m2-7.1','타학교'),row('y',2,'m2-7.1','타학교')];const pair={id:'pair',complete:true,original_numbers:['1','2'],members:[{questionId:'x'},{questionId:'y'}]};pool.at(-1).questionSet=pair;pool.at(-2).questionSet=pair;
 const result=recover(pool,{...rules,supplementIds:['x','y']},{mode:'balanced',requiredIds:['x']});assert(result.complete);assert(sets.complete(result.items));assert(result.items.some(x=>x.question_id==='x')&&result.items.some(x=>x.question_id==='y'));assert.equal(result.items.length,6);assert(result.recovery.actual.low>=2);assert(result.recovery.approximate);
 assert.throws(()=>recover(pool,{...rules,supplementIds:['x','y'],excludeIds:['y']},{requiredIds:['x']}),/세트|조건/);
});
test('true format shortage leaves no partial paper; a fully selected paper is validated',()=>{
 const pool=Array.from({length:8},(_,i)=>row('a'+i,5));assert.equal(recover(pool,rules).complete,false);const small={...rules,count:2,types:{선택형:2,서술형:0}};const r=recover(pool,small,{requiredIds:['a0','a1']});assert(r.complete);assert.deepEqual(r.items.map(x=>x.question_id),['a0','a1']);
});
