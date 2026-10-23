'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID:id}=require('node:crypto'),{groupFixture}=require('./group-operations-fixture.cjs'),aliases=require('../web-bank/school-alias-rpc.cjs');
test('local SQL preserves numeric-target settings and source IDs; alias expansion reads both schools without editing data',async t=>{
 const x=await groupFixture();t.after(()=>x.close());const {db,rpc,A,S}=x,rows=[];await db.exec('reset role');const versions=(await db.query('select versions from bank_v121.release_policy where id')).rows[0].versions;const failure={...versions,final_status:'failed',final_stage:3,final_model:'gpt-6.1-sol',final_reasoning_effort:'high',final_score:null,final_tier:null};
 for(const school of ['신동중','신동중학교']){
  await db.exec('reset role');const q=id(),r=id(),f=id();
  await db.query("insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,'fixture@example.test')",[q,S,A]);
  await db.query("insert into bank_revisions(id,question_id,actor_id,committed,visibility) values($1,$2,$3,true,'approved')",[r,q,A]);
  await db.query("insert into bank_entries(id,space_id,name,kind,owner_id) values($1,$2,'fixture','file',$3)",[f,S,A]);
  // A synthetic failed-assessment fixture supplies no score. The current
  // policy guard remains enabled; this test only verifies persistence.
  await db.query("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,confirmed,content,files) values($1,$2,$3,$4,$5,'{}','{}','[]')",[r,S,q,f,{difficulty:{v121Latest:{record:failure}},source:{kind:'학교기출',school,region:'서초구',grade:'중2'},content:{responseType:'선택형'},classification:{primaryUnit:{id:'m2-8.7'}}}]);rows.push({questionId:q,revisionId:r,school});
 }
 const args=aliases.request('bank_mock_auto_candidates',{s:S,current_exam:null,schools:['신동중'],units:['m2-8.7']});
 const raw=await rpc(A,'bank_mock_auto_candidates',args),mapped=aliases.response('bank_mock_auto_candidates',raw);assert.equal(raw.candidates.length,2);assert.deepEqual(new Set(raw.candidates.map(c=>c.metadata.source.school)),new Set(['신동중','신동중학교']));assert(mapped.candidates.every(c=>c.metadata.source.school==='신동중'));
 const profile={low:0,middle:33,high:67,targetAverage:7,driver:'target'},document={schema:1,id:id(),title:'평균 설정 저장 검사',schools:['신동중'],profile,variants:[{id:id(),kind:'A',label:'A1',units:['m2-8.7'],paper:{rules:{count:2,profile},items:rows.map(({questionId,revisionId})=>({questionId,revisionId})),autoComposition:{policy:'unique-auto-fill-v1',planned:{total:2,types:{선택형:2,서술형:0},difficulty:{low:0,middle:1,high:1}}}}}]};
 await rpc(A,'bank_mock_save',{s:S,e:document.id,expected:0,doc:document});const saved=await rpc(A,'bank_mock_get',{s:S,e:document.id});assert.deepEqual(saved.document.profile,profile);assert.deepEqual(saved.document.variants[0].paper.rules.profile,profile);assert.deepEqual(saved.document.variants[0].paper.items.map(i=>i.questionId),rows.map(r=>r.questionId));
 await db.exec('reset role');const stored=await db.query("select metadata->'source'->>'school' school from bank_catalog where revision_id=any($1::uuid[])",[rows.map(r=>r.revisionId)]);assert.deepEqual(new Set(stored.rows.map(r=>r.school)),new Set(['신동중','신동중학교']));
});
