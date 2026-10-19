'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Run=require('../app/difficulty-v121/run.cjs'),P=require('../app/difficulty-v121/desktop-policy.cjs'),Upload=require('../app/difficulty-v121/upload.cjs'),Input=require('../app/difficulty-v12/input.cjs');
const ok=tier=>({raw:{derived_answer:'54'},computed:{status:'complete',score:4.6,problem_tier:tier},validation:{valid:true,solution_validated:true}}),bad={computed:{status:'failed'},validation:{valid:false,reason:'answer_mismatch'}};
test('current desktop routes independent stages and preserves latest versions and solution settings',async()=>{
 const e={questionId:'q',revisionId:'r',input:Input.input({question:{body:'문제'},scope:'중2'}),validationContext:{storedAnswer:'54',choices:[]}};
 for(const [responses,expected]of [[[ok('T2')],[1]],[[ok('T3'),ok('T2')],[1,2]],[[bad,ok('T2')],[1,2]],[[bad,bad,ok('T2')],[1,2,3]],[[bad,bad,bad],[1,2,3]]]){
  const calls=[],settings={model:'user-solution-model',effort:'high'},before=structuredClone(settings);
  const r=await Run.evaluateEntry(e,{profile:P.profile,runStage:async(entry,n,s)=>{calls.push(n);assert.deepEqual(s,P.stages[n-1]);assert.equal(entry.input.payload.question.answer,undefined);return responses[n-1];}});
  assert.deepEqual(calls,expected);assert.deepEqual(settings,before);assert.equal(r.prompt_hash,P.versions.prompt_hash);assert.equal(r.normalizer_version,'v121-normalizer-7');
  if(responses.at(-1)===bad){assert.equal(r.final_score,null);assert.equal(r.final_tier,null);assert.equal(r.final_status,'failed');}
 }
});
test('same-content new ID/revision reuses, changed body/answer/image requires new evaluation',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v121-reuse-'));try{
  const q={id:'q1',body:'문제',answer:'54',choices:[]},p={id:'p',original:q,variants:[],cropPaths:[]},project={scope:{grade:'중2'},problems:[p]};
  let item={id:'b1',metadata:{difficulty:{},analysis:{}}},calls=0;const events=[];
  const bank={dir,ensure:()=>item,save:()=>{},state:{auto:false},onEvent:e=>events.push(e)},options={bank,store:{get:()=>project},projectId:'p',questionId:'q1',runStage:async()=>{calls++;return ok('T2');}};
  await Upload.evaluate(options);assert.equal(calls,1);
  q.id='q2';item={id:'b2',baseRevisionId:'new-revision',metadata:{difficulty:{},analysis:{}}};options.questionId='q2';p.filename='renamed.pdf';
  assert.equal((await Upload.evaluate({...options,savedOnly:true})).reused,true);assert.equal(calls,1);
  const original=await Upload.capture(options),identity=P.reuseIdentity(original);
  assert.notEqual(P.reuseIdentity({...original,validationContext:{...original.validationContext,storedAnswer:'55'}}),identity);
  assert.notEqual(P.reuseIdentity({...original,input:{...original.input,images:[{sha256:'f'.repeat(64)}]}}),identity);
  q.body='다른 문제';await assert.rejects(Upload.evaluate({...options,savedOnly:true}),/저장 결과/);assert.equal(calls,1);
  assert(events.some(e=>e.reused&&e.taskKind==='difficulty_evaluation'&&e.evaluationVersion===P.profile.version));
 }finally{fs.rmSync(dir,{recursive:true});}
});
test('confirmed failed turn escalates but timeout and unknown dispatch never repeat',async()=>{
 const entry={questionId:'q',revisionId:'r',input:Input.input({question:{body:'문제'},scope:'중2'})};
 const failed={...bad,evidence:{completed:false,exitCode:1,errors:[{type:'turn.failed',message:'network rejected'}]}};
 let calls=0;const result=await Run.evaluateEntry(entry,{profile:P.profile,runStage:async()=>++calls===1?failed:ok('T2')});assert.equal(calls,2);assert.equal(result.final_stage,2);
 for(const response of [{...failed,computed:{reason:'outcome_unknown_timeout'}},{...failed,evidence:{completed:false,exitCode:1,errors:[]}}]){
  calls=0;await assert.rejects(Run.evaluateEntry(entry,{runStage:async()=>{calls++;return response;}}),/subscription_outcome_unconfirmed/);assert.equal(calls,1);
 }
});
