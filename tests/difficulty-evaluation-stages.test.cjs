'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../app/difficulty-evaluation-stages.cjs'),R=require('../app/difficulty-reassessment.cjs'),D=require('../app/difficulty-assessment.cjs');
const source=()=>({catalog:{question_id:'q',revision_id:'r',metadata:{analysis:{basis:'basis',status:'complete'},difficulty:{aiScore:'5.0',criteriaVersion:'old'}},confirmed:{}},question:{body:'Find the length.',answer:'3',solution:'Use the given relation.'},scope:require('../app/curriculum.js').build(['m2-8.3','m2-9.1'])});
const selection={model:'gpt-6.1-sol',effort:'medium'};
function setup(){const item=source(),plan=R.plan([item],selection),job=S.prepare(plan,{...selection,baseline:{version:'v4-test',instructions:'Original rubric'}});// The v2 rubric does not inject teacher examples. Exercise persistence on an explicit synthetic comparison job.
 assert.equal(job.comparisons.length,0);job.comparisons=Array.from({length:4},(_,i)=>({key:'test-'+i,status:'pending',criteriaVersion:i%2?D.version:'v4-test',instructions:D.instructions,text:JSON.stringify({question:{body:'Synthetic comparison '+i},scope:item.scope})}));job.maximumCalls=5;return {item,job,authorization:{granted:true,jobId:job.jobId,...selection,stages:['comparisons','existing'],maxCalls:5}};}
const result=()=>({result:{assessment:require('./fixtures/access-assessment.cjs').accessAssessment('S2')},...selection,tokens:{inputTokens:100,outputTokens:30,totalTokens:130}});
function memory(job){let saved=structuredClone(job);return {read:()=>saved,checkpoint:async(next,{expectedVersion})=>{assert.equal(expectedVersion,saved.version);saved=structuredClone(next);}};}
test('explicit matching authorization and completed comparison review are required before any call',async()=>{
 const {job,authorization}=setup();let calls=0;const bridge={run:async()=>{calls++;return result();}},checkpoint=memory(job).checkpoint;
 await assert.rejects(S.runStage(job,{stage:'comparisons',bridge,checkpoint}));
 await assert.rejects(S.runStage(job,{stage:'comparisons',authorization:{...authorization,model:'different'},bridge,checkpoint}));
 await assert.rejects(S.runStage(job,{stage:'existing',authorization,comparisonReview:{reviewed:true},bridge,checkpoint,readCurrentItem:async()=>source()}));assert.equal(calls,0);
});
test('four comparisons persist before each call, record actual usage and never retry completed entries',async()=>{
 const {job,authorization}=setup(),disk=memory(job);let calls=0;
 const bridge={run:async req=>{calls++;assert.equal(disk.read().comparisons.filter(x=>x.status==='in_progress').length,1);assert.equal(disk.read().aiCalls,calls);assert.equal(req.model,selection.model);assert.equal(req.effort,'medium');assert.doesNotMatch(req.text,/userTarget/);return result();}};
 const done=await S.runStage(job,{stage:'comparisons',authorization,bridge,checkpoint:disk.checkpoint});assert.equal(calls,4);assert.equal(done.comparisons[0].result.assessment.criteriaVersion,'v4-test');assert.equal(done.comparisons[1].result.assessment.criteriaVersion,D.version);assert.equal(done.comparisons[0].usage.tokens.totalTokens,130);assert.equal(done.existing[0].status,'pending');
 await S.runStage(done,{stage:'comparisons',authorization,bridge,checkpoint:disk.checkpoint});assert.equal(calls,4);assert.equal(job.aiCalls,0);
});
test('provider failure stops remaining work, and restart does not retry the failed request',async()=>{
 const {job,authorization}=setup(),disk=memory(job);let calls=0;const bridge={run:async()=>{calls++;throw Error('quota unavailable');}};
 const stopped=await S.runStage(job,{stage:'comparisons',authorization,bridge,checkpoint:disk.checkpoint});assert.equal(calls,1);assert.equal(stopped.comparisons[0].status,'failed');assert.equal(stopped.comparisons[1].status,'pending');assert.equal(stopped.aiCalls,1);
 await assert.rejects(S.runStage(stopped,{stage:'comparisons',authorization,bridge,checkpoint:disk.checkpoint}));assert.equal(calls,1);
});
test('completed comparisons permit separate recorded-only results, while changed teacher fields prevent calls',async()=>{
 const {job,authorization,item}=setup(),disk=memory(job);let calls=0;const bridge={run:async()=>{calls++;return result();}};
 const done=await S.runStage(job,{stage:'comparisons',authorization,bridge,checkpoint:disk.checkpoint}),review={jobId:job.jobId,criteriaVersion:D.version,reviewed:true};
 const completed=await S.runStage(done,{stage:'existing',authorization,comparisonReview:review,bridge,readCurrentItem:async()=>item,checkpoint:disk.checkpoint});assert.equal(calls,5);assert.equal(completed.existing[0].result.score,'5.5');assert.equal(completed.existing[0].result.oldRawScore,undefined);assert.equal(item.catalog.metadata.difficulty.rubricAssessments,undefined);
 const teacherDisk=memory(done);item.catalog.confirmed.difficulty='7.0';const protectedJob=await S.runStage(done,{stage:'existing',authorization,comparisonReview:review,bridge,readCurrentItem:async()=>item,checkpoint:teacherDisk.checkpoint});assert.equal(protectedJob.existing[0].status,'teacher_protected');assert.equal(calls,5);
});
