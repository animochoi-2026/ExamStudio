'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../app/difficulty-v12/scoring-profiles.cjs'),R=require('../app/difficulty-v12/subscription.cjs'),I=require('../app/difficulty-v12/input.cjs'),F=require('./fixtures/difficulty-v12-values.cjs');
const old=P.get(),current=P.get(P.literacyOneId);
test('literacy +1 is explicit; previous +2 results and prompt hash remain stable',()=>{
 const raw={...F.raw(F.route([F.d('d',1,1,1,1)])),literacy_high:true,literacy_evidence:'three necessary conditions'};
 assert.equal(old.evaluate(raw).computed.problem_tier,'T2');assert.equal(current.evaluate(raw).computed.problem_tier,'T1');
 assert.equal(old.promptHash,'f0adc444494abed5d9418ffc07927b2751c02745b2c66a4523a8d7aa43e22169');
 assert.equal(R.evaluationVersion,'91de6cea570f8a437b128a85814bc6591e5773759612fdb03a44501fffb43ec6');
 assert.equal(current.instructions,old.instructions.replace('문해력+2','문해력+1').replace('문해력 +2','문해력 +1'));
 assert.notEqual(current.promptHash,old.promptHash);assert.notEqual(R.profile(P.literacyOneId).evaluationVersion,R.evaluationVersion);assert.throws(()=>P.get('typo'));
});
test('all three gates stack and cap at T5, no literacy leaves scores unchanged',()=>{
 const ds=[F.d('a'),F.d('b',2,2,1,2,['a']),F.d('c',2,2,1,2,['b'])];
 const raw={...F.raw(F.route(ds,{execution_extreme:true,execution_evidence:'load'})),literacy_high:true,literacy_evidence:'memory'};
 const v=current.evaluate(raw).computed;assert.equal(v.base_tier,'T2');assert.equal(v.problem_tier,'T5');assert.deepEqual(v.promotions,['assembly','literacy','execution']);
 const n=F.raw(F.route([F.d('a')]));const a=old.evaluate(n).computed,b=current.evaluate(n).computed;assert.deepEqual({...a,scorer_version:null},{...b,scorer_version:null});
 assert.equal(current.evaluate({}).computed.score,null);
});
test('new policy reevaluates route choice rather than subtracting from the old winner',()=>{
 const a=F.route([F.d('a',2,2,2,2)],{route_id:'a',execution_extreme:true,execution_evidence:'load'}),b=F.route([F.d('b',3,2,1,2)],{route_id:'b'});
 const raw={...F.raw(a),viable_routes:[b,a],literacy_high:true,literacy_evidence:'memory'};
 assert.equal(current.evaluate(raw).computed.problem_tier,'T4');assert.equal(current.evaluate(raw).computed.selected_route_id,'b');
 assert.equal(old.evaluate(raw).computed.problem_tier,'T5');assert.equal(old.evaluate(raw).computed.selected_route_id,'a');
 const hashes=[R.profile(),R.profile(P.literacyOneId)].map(p=>I.hash({inputVersion:'same',evaluationVersion:p.evaluationVersion}));assert.notEqual(...hashes);
});
