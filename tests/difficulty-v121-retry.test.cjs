'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const R=require('../app/difficulty-v121/retry.cjs'),P=require('../app/difficulty-v121/profile.cjs'),Run=require('../app/difficulty-v121/run.cjs');
const F=require('./fixtures/difficulty-v12-values.cjs');
const entry={questionId:'failed',revisionId:'r',input:{inputVersion:'v',contentHash:'c',images:[],payload:{curriculum_scope:'중2'}},validationContext:{scope:'중2',storedAnswer:'54',choices:[]}};
function saved(answer='54'){return {evidence:{completed:true,failed:false,exitCode:0},raw:{...F.raw(F.route([F.d('a')])),spec_revision:'1.2.1',derived_answer:answer,answer_type:'numeric',solution_summary:'높이 6, 밑변 18, 넓이는 54',solution_validated:false,answer_confidence:.9,literacy_evidence_type:'',image_evidence_status:'not_required',assessment_uncertainty:[]}};}
test('successful targets and changed identities are rejected at dispatch boundary',()=>{
 const target={questionId:'failed',revisionId:'r',identity:P.inputIdentity(entry)};
 assert.throws(()=>R.checkTarget(entry,target,['failed']),/success_recall_forbidden/);
 assert.throws(()=>R.checkTarget({...entry,revisionId:'changed'},target,[]),/integrity/);
 R.checkTarget(entry,target,[]);
});
test('completed earlier stages replay; only failed terminal stage requests a new response',async()=>{
 const bad=saved('55'),before=JSON.stringify(bad),calls=[];
 const result=await Run.evaluateEntry(entry,{runStage:async(e,n)=>{
  const plan=R.planStage(bad,e,n,3);
  if(plan.action==='reuse')return plan.result;
  calls.push(n);return R.revalidate(saved(),e);
 }});
 assert.deepEqual(calls,[3]);assert.equal(result.final_status,'complete');assert.equal(JSON.stringify(bad),before);
});
test('valid stored responses recover locally, unknown executions cannot be reused',()=>{
 assert.equal(R.planStage(saved(),entry,3,3).action,'reuse');
 for(const evidence of [{completed:false},{completed:true,failed:true,exitCode:1}])assert.equal(R.planStage({...saved(),evidence},entry,1,3).action,'call');
 assert.equal(R.planStage(saved('55'),entry,3,3).action,'call');
});
test('original successful artifacts are byte protected',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'retry-guard-')),file=path.join(root,'result.json');
 try{fs.writeFileSync(file,'original');const m={protectedFiles:{'result.json':R.digest(file)}};R.checkProtected(root,m);fs.writeFileSync(file,'changed');assert.throws(()=>R.checkProtected(root,m),/integrity_changed/);}finally{fs.unlinkSync(file);fs.rmdirSync(root);}
});
