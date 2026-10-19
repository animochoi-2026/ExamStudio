'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Upload=require('../app/difficulty-v121/upload.cjs'),D=require('../app/difficulty-assessment.cjs');
test('desktop dedicated stages, content cache, failure-null and protected metadata',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v121-desktop-test-'));
 const q={id:'local-q',body:'삼각형의 넓이를 구하시오.',answer:'54',choices:[]},p={id:'p',original:q,variants:[],cropPaths:[]};
 const project={id:'project',scope:{grade:'중2'},problems:[p]},store={get:()=>project};
 const item={id:'bank-q',baseRevisionId:null,metadata:{processing:{displayCorrection:{keep:true}},classification:{primaryUnit:'area'},difficulty:{userScore:9,aiScore:8},analysis:{}}};
 const bank={dir,state:{auto:false},ensure:()=>item,save:()=>{}};let calls=[];
 const ok={validation:{valid:true,solution_validated:true},computed:{status:'complete',score:4.6,problem_tier:'T2',base_tier:'T2',promotions:[]}};
 const options={bank,store,projectId:'project',questionId:q.id,runStage:async(e,n,stage)=>{calls.push(stage.id);assert.equal(e.input.payload.question.answer,undefined);return ok;}};
 const a=await Upload.evaluate(options);assert.equal(a.status,'complete');assert.deepEqual(calls,['luna-medium']);assert.equal(D.effective({metadata:item.metadata}).number,4.6);assert.equal(item.metadata.difficulty.userScore,null);assert.deepEqual(item.metadata.processing,{displayCorrection:{keep:true}});
 assert.equal((await Upload.evaluate(options)).reused,true);assert.equal(calls.length,1);
 item.baseRevisionId='server-r';
 const Profile=require('../app/difficulty-v121/desktop-policy.cjs').profile,entry=await Upload.capture(options),identity=Profile.inputIdentity(entry);
 const remote={question_id:item.id,confirmed:{difficulty:6.2},metadata:{difficulty:{v121Active:{...item.metadata.difficulty.v121Latest.record,input_identity:identity,profile_version:Profile.version,question_revision_id:'server-r'}}}};
 bank.storage={kind:'shared',rows:async()=>[remote]};item.metadata.difficulty={};
 assert.equal((await Upload.evaluate({...options,savedOnly:true})).reused,true);assert.equal(calls.length,1);assert.equal(D.effective({metadata:item.metadata}).number,6.2);
 q.body='새 삼각형의 넓이를 구하시오.';await assert.rejects(Upload.evaluate({...options,savedOnly:true}),/저장 결과/);assert.equal(calls.length,1);
 await Upload.evaluate({...options,runStage:async(e,n,stage)=>{calls.push(stage.id);return {computed:{status:'failed',reason:'answer_mismatch'},validation:{valid:false,reason:'answer_mismatch'}};}});
 assert.deepEqual(calls.slice(1),['luna-medium','sol-medium','sol-high']);assert.equal(D.effective({metadata:item.metadata}).number,null);assert.equal(item.metadata.difficulty.v121Latest.record.final_status,'failed');
 // Only remove named files/directories created by this test.
 for(const folder of ['calls','recovery','results']){const target=path.join(dir,'difficulty-v121',folder);for(const file of fs.readdirSync(target))fs.unlinkSync(path.join(target,file));fs.rmdirSync(target);}fs.rmdirSync(path.join(dir,'difficulty-v121'));fs.rmdirSync(dir);
});
