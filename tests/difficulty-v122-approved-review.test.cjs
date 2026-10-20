'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=require('../app/difficulty-v122/approved-review.cjs'),C=require('../app/difficulty-v122/canonical.cjs');
const Native=require('../app/difficulty-v122/native-source.cjs'),I=require('../app/difficulty-v122/input.cjs');
const base=path.resolve(__dirname,'../artifacts/difficulty-v122-rc1');
const rows=fs.readdirSync(path.join(base,'corpus-snapshot')).filter(n=>/^page-\d+\.json$/.test(n))
 .flatMap(n=>JSON.parse(fs.readFileSync(path.join(base,'corpus-snapshot',n))));
const approvals=JSON.parse(fs.readFileSync(path.join(base,'approved-review-snapshot.json'))).rows;
const sourceRoot='C:/Users/reals/.codex/worktrees/registration-ui-20261017/문제생성기/artifacts/difficulty-v121';
function fixture(index=0){
 const a=approvals[index],catalog=structuredClone(rows.find(x=>x.question_id===a.question_id));
 catalog.metadata.difficulty.v121Active=structuredClone(a.active);return catalog;
}
test('existing approved artifact matches the referenced preserved file',()=>{
 for(const a of approvals){
  const e=a.active.production_review_envelope,bytes=fs.readFileSync(path.join(sourceRoot,e.reference.file));
  assert.equal(C.bytesHash(bytes),e.reference.sha256);
  assert.equal(C.hash(JSON.parse(bytes)),C.hash(e.approved_result));
 }
});
test('existing source review supplies only approved correction and basis without mutation',()=>{
 const c=fixture(),before=C.hash(c),r=R.resolve(c,{body:c.content.body,choices:c.content.choices});
 assert.equal(C.hash(c),before);
 assert.equal(r.reviewedBasis.solution,c.metadata.difficulty.v121Active.production_review_envelope.approved_result.reviewedResponse.solution_summary);
 assert.equal(r.provenance.source_content_hash,C.hash(c.content));
 assert.notEqual(r.provenance.source_content_hash,r.provenance.reviewed_evaluation_input_hash);
 assert.equal(r.approvedRoutes[0].source,'approved_review_envelope');
});
test('authorization label without actual envelope cannot confirm a basis',()=>{
 const c=fixture();delete c.metadata.difficulty.v121Active;
 assert.equal(R.resolve(c,{}),null);
});
test('wrong authorization is rejected',()=>{
 const c=fixture();c.metadata.difficulty.v121Active.production_review_envelope.authorization='unapproved';
 assert.throws(()=>R.resolve(c,{}),/approved_review_mismatch:authorization/);
});
test('foreign revision is rejected',()=>{
 const c=fixture();c.metadata.difficulty.v121Active.question_revision_id='other';
 assert.throws(()=>R.resolve(c,{}),/approved_review_mismatch:identity/);
});
test('changed production body is rejected',()=>{
 const c=fixture();c.content.body+=' changed';
 assert.throws(()=>R.resolve(c,{}),/approved_review_mismatch:source_content/);
});
test('changed image manifest is rejected',()=>{
 const c=fixture();c.files[0].sha256='0'.repeat(64);
 assert.throws(()=>R.resolve(c,{}),/approved_review_mismatch:source_images/);
});
test('foreign approval identity is rejected',()=>{
 const c=fixture();c.metadata.difficulty.v121Active.production_review_envelope.approved_result.questionId='other';
 assert.throws(()=>R.resolve(c,{}),/approved_review_mismatch:approved_identity/);
});
test('existing intended-answer review reuses its hash-verified source solution',()=>{
 const c=fixture(1),r=R.resolve(c,{body:c.content.body});
 assert.equal(r.reviewedBasis.solution,c.metadata.difficulty.v121Active.production_review_envelope.approved_result.sourceSolution);
 c.metadata.difficulty.v121Active.production_review_envelope.approved_result.sourceSolution+=' changed';
 assert.throws(()=>R.resolve(c,{}),/approved_review_mismatch:source_solution_hash/);
});
test('actual native conversion preserves source evidence and excludes historical ratings',async()=>{
 const cache=require('../scripts/difficulty-v122-cache.cjs').createCache();
 for(let index=0;index<approvals.length;index++){
  const c=fixture(index),before=C.hash(c),bundle=JSON.parse(cache.read(c.files.find(f=>f.role==='data')));
  const source=await Native.fromNative(c,bundle,cache.read),prepared=I.prepare(source);
  assert.equal(C.hash(c),before);
  assert.equal(prepared.payload.difficulty_basis_source,'approved_review_envelope');
  assert.deepEqual(prepared.source_provenance,source.source_provenance);
  assert(!/"(?:final_score|final_tier|computed|reviewedResponse|derived_answer|solution_validated|answer_confidence)"\s*:/.test(JSON.stringify(prepared.payload)));
 }
});
