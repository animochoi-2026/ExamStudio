const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID:id}=require('crypto'),{replacementFixture}=require('./replacement-stages-fixture.cjs'),R=require('../web-bank/replacement-model.cjs'),E=require('../web-bank/mock-round-edit.cjs');
test('manual cross-chapter and difficulty replacement survives ordinary and mock save/reopen',async t=>{
 const x=await replacementFixture();t.after(()=>x.close());const {questions:q,db,A,S,rpc}=x;
 await db.exec('reset role');q[3].metadata.classification.primaryUnit.id='m2-6.1';await db.query('update bank_catalog set metadata=$1,confirmed=$2 where revision_id=$3',[q[3].metadata,{difficulty:10},q[3].r]);
 const rules={...x.rules,units:['m2-8.7','m2-8.6','m2-6.1'],count:2,types:{선택형:2},scopeDistribution:true,profile:{low:100,middle:0,high:0,targetAverage:1},scopeAllocation:{groups:[{id:'m2-8',count:2},{id:'m2-6',count:0}]}};
 const candidate=(await x.get({rules,candidate:q[3].q})).items[0];assert(candidate);assert.equal(candidate.summaryDifficulty.score,10);
 const current={questionId:q[0].q,revisionId:q[0].r,responseType:'선택형',points:7,workspaceMm:18,scoreSnapshot:1},other={questionId:q[1].q,revisionId:q[1].r,responseType:'선택형',points:3};
 const paper={id:id(),version:0,title:'합성 수동 교체',rules,items:[current,other]};
 const items=R.createSession().replace(paper.items,0,candidate,rules);assert.equal(items[0].points,7);assert.equal(items[0].scoreSnapshot,10);assert.deepEqual(items[1],other);assert.deepEqual(paper.items,[current,other]);
 await rpc(A,'bank_exam_save',{s:S,e:paper.id,expected:0,doc:{...paper,items}});const saved=await rpc(A,'bank_exam_get',{s:S,e:paper.id});assert.equal(saved.document.items[0].questionId,q[3].q);assert.deepEqual(saved.document.rules.profile,rules.profile);
 const round={schema:1,id:id(),version:0,title:'합성 배분 이탈',variants:[{id:id(),kind:'A',label:'A1',paper}]};
 const changed=E.replace(round,current.questionId,candidate);assert.equal(changed.document.variants[0].paper.items[0].questionId,q[3].q);assert.equal(changed.document.variants[0].paper.items[0].points,7);
 await rpc(A,'bank_mock_save',{s:S,e:round.id,expected:0,doc:changed.document});const reopened=await rpc(A,'bank_mock_get',{s:S,e:round.id});assert.equal(reopened.document.variants[0].paper.items[0].questionId,q[3].q);assert.deepEqual(reopened.document.variants[0].paper.rules.profile,rules.profile);
 const shared={...round,variants:[round.variants[0],{...structuredClone(round.variants[0]),id:id(),label:'A2'}]};const both=E.replace(shared,current.questionId,candidate);assert.equal(both.affectedIds.length,2);assert(both.document.variants.every(v=>v.paper.items[0].questionId===q[3].q));
});
