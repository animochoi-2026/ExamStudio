'use strict';
require('../tests/offline-guard.cjs');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const C=require('../app/difficulty-v122/canonical.cjs'),I=require('../app/difficulty-v122/input.cjs'),V=require('../app/difficulty-v122/validate.cjs'),R=require('../app/difficulty-v122/response-contract.cjs'),Router=require('../app/difficulty-v122/router.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'artifacts/difficulty-v122-role-overlay'),previous=path.join(root,'artifacts/difficulty-v122-evidence-rc'),read=f=>JSON.parse(fs.readFileSync(f)),sources=read(previous+'/inputs/sources.json'),results=[];
for(const [i,number]of [[0,11],[1,13],[2,9]]){
 const p=I.prepare(sources[i]),file=i?previous+'/inputs/raw-'+number+'.json':path.join(root,'artifacts/difficulty-v122-simple-contract/latest-11.json'),raw=read(file),hash=C.bytesHash(fs.readFileSync(file)),id='role-overlay-replay-'+number;
 const r=V.evaluateResponse(raw,p.payload,R.bind(p,id),id),next=Router.next(1,{status:r.computed.status,...r},{smoke:true});
 const result={number,question_id:p.identities.question_id,raw_file:file,raw_sha256:hash,validation:r.validation,score:r.computed.score,tier:r.computed.problem_tier,assembly:r.computed.assembly_mode,next_stage:next,stage1_final:r.computed.status==='complete'&&next===null,stage2_candidates:next===2?1:0,system_overlay:r.system_projection_role_overlay||null,projection:r.computed.projection,moves:r.computed.moves,actualAIcalls:0};
 try{
  assert(r.validation.valid,JSON.stringify(r.validation));assert.equal(r.computed.assembly_triggered,false);
  if(number===11){
   assert.equal(r.system_projection_role_overlay.shared_premise_count,1);assert.equal(r.system_projection_role_overlay.shared_premise_duplicates,0);assert.equal(r.system_projection_role_overlay.system_discovery_count,0);assert.equal(r.computed.problem_tier,'T0');assert.equal(next,null);
   assert.equal(r.computed.score,1.4,'requested latest saved-response score must be reproduced without modifying axes/scorer');
  }else{
   const plan=read(previous+'/inputs/approved-run-plan.json'),preserved=read(previous+'/predecessor-preservation.json'),old=read(path.join(preserved.old_root,'artifacts/difficulty-v122-rc1/post-freeze-luna-contract-smoke-20261020T150005Z/batch/calls',plan.requests[i].request_id+'.json'));
   assert.equal(C.hash(r.computed),C.hash(old.envelope.computed));result.computed_identical=true;
   assert(!r.system_projection_role_overlay);
   if(number===13){assert.equal(result.score,4.7);assert.equal(result.tier,'T2');assert(r.computed.moves.some(m=>m.move_class==='M2'));assert.equal(next,null);}
   else {assert.equal(result.score,6.7);assert.equal(result.tier,'T3');assert.equal(next,2);}
  }
  result.passed=true;
 }catch(e){result.passed=false;result.error=e.message;}
 assert.equal(C.bytesHash(fs.readFileSync(file)),hash);results.push(result);
}
const report={at:new Date().toISOString(),passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results,actualAIcalls:0,live_smoke_authorized_to_start:results.every(r=>r.passed)};
fs.writeFileSync(base+'/saved-replay.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed,results:results.map(r=>({number:r.number,passed:r.passed,score:r.score,tier:r.tier,error:r.error})),live_smoke_authorized_to_start:report.live_smoke_authorized_to_start}));if(report.failed)process.exitCode=1;
