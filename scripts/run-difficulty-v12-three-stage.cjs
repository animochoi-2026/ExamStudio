'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const I=require('../app/difficulty-v12/input.cjs'),R=require('../app/difficulty-v12/subscription.cjs'),C=require('../app/difficulty-v12/three-stage.cjs'),P=require('../app/difficulty-v12/three-stage-profile.cjs'),E=require('./run-difficulty-v12-exam-pilot.cjs');
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function main(){
 const [root,mode]=process.argv.slice(2);if(!root)throw Error('Private run directory required');
 const entries=read(path.join(root,'inputs.json')),targets=read(path.join(root,'targets.json')),approval=read(path.join(root,'execution-approval.json'));
 E.validate(entries,targets,{...approval,maximumCalls:entries.length});assert.equal(approval.maximumCalls,entries.length*3);assert.equal(approval.scoringProfile,P.id);assert.deepEqual(approval.policy,C.policy);
 for(const [i,id] of C.stages.entries()){const p=R.profile(P.id,id);assert.deepEqual(approval.stages[i],{id,settings:p.settings,promptHash:p.promptHash,evaluationVersion:p.evaluationVersion});}
 for(const [f,h] of Object.entries(approval.protectedFiles))assert.equal(sha(f),h,'Protected file changed: '+f);
 if(mode!=='--run-approved'){console.log(JSON.stringify({count:entries.length,maxCalls:approval.maximumCalls,stages:approval.stages}));return;}
 R.assertSubscription(process.env.CODEX_EXECUTABLE||'codex');
 const records=entries.map(e=>({id:e.id,number:e.number,runs:[],decisions:[],final:null,finalStatus:null}));let calls=0;
 const save=()=>{const f=path.join(root,'checkpoint.json');fs.writeFileSync(f+'.tmp',JSON.stringify({records,summary:C.aggregate(records)},null,2));fs.renameSync(f+'.tmp',f);};
 for(let stage=1;stage<=3;stage++)for(const [i,e] of entries.entries()){
  const record=records[i];if(stage>1&&record.decisions[stage-2]?.next!==stage)continue;
  assert(++calls<=approval.maximumCalls);
  const r=await R.runOne(e,{outputRoot:path.resolve(root,'stage-'+stage),scoringProfile:P.id,executionProfile:C.stages[stage-1],executable:process.env.CODEX_EXECUTABLE||'codex'});
  record.runs[stage-1]=r;const d=C.decision(stage,r);record.decisions[stage-1]=d;
  if(!d.next){record.finalStatus=d.finalStatus;record.final=d.finalStatus==='complete'?r.computed:{status:'failed',score:null,problem_tier:null,reason:d.reasons.join(';')};record.finalStage=stage;}
  save();console.log(JSON.stringify({stage,number:e.number,status:r.status,tier:r.computed.problem_tier,score:r.computed.score,decision:d}));
  // Unknown transport outcomes are never automatically replayed or escalated.
  if(r.status==='failed'&&!r.evidence?.completed)throw Error('Execution outcome incomplete; preserved without automatic retry or escalation');
 }
 const baseline=read(approval.baselineReport);const summary=C.aggregate(records,baseline.rows);
 fs.writeFileSync(path.join(root,'report.json'),JSON.stringify({createdAt:new Date().toISOString(),approval:{...approval,protectedFiles:undefined},records,summary},null,2));console.log(JSON.stringify(summary));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main};
