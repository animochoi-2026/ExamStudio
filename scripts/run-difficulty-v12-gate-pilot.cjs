'use strict';
// Explicitly authorized six-item experiment; does not relax the full pilot's 30-item guard.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const I=require('../app/difficulty-v12/input.cjs'),R=require('../app/difficulty-v12/subscription.cjs'),S=require('../app/difficulty-v12/schema.cjs');
const selected=['V2','V5','V6','B11','B14','B19'];
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
function validate(entries,previous){
 assert.equal(entries.length,6,'Only six authorized items may run');
 assert.deepEqual(entries.map(e=>e.alias||e.id),selected,'Authorized item order/set differs');
 assert.equal(new Set(entries.map(e=>e.id)).size,6);
 for(const e of entries){R.verifyInput(e.input);const old=previous.find(x=>x.id===e.id);assert(old);assert.equal(e.alias||e.id,old.alias||old.id);for(const k of ['questionId','revisionId','reviewVersion'])assert.deepEqual(e[k],old[k]);assert.deepEqual(e.input.payload,old.input.payload);assert.deepEqual(e.input.images,old.input.images);assert.equal(e.input.contentHash,old.input.contentHash);}
 return I.hash(entries.map(e=>({id:e.id,inputVersion:e.input.inputVersion})));
}
async function main(){
 const [root,mode]=process.argv.slice(2);if(!root)throw Error('Private round4 directory required');
 const entries=read(path.join(root,'pilot-inputs.json')),approval=read(path.join(root,'execution-approval.json'));
 const manifestHash=validate(entries,read(approval.previousManifest));
 assert.equal(manifestHash,approval.manifestHash);assert.equal(R.evaluationVersion,approval.evaluationVersion);assert.equal(I.promptHash,approval.promptHash);assert.equal(approval.baseEvaluations,6);assert.equal(approval.automaticRetries,0);assert.deepEqual(approval.settings,R.settings);
 const sha=f=>require('node:crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex');
 for(const [f,h] of Object.entries(approval.files))assert.equal(sha('app/difficulty-v12/'+f),h,'Protected module changed: '+f);
 const preserved=read(path.join(root,'previous-results-preservation.json'));
 for(const [f,h] of Object.entries(preserved))assert.equal(sha(f),h,'Prior result changed: '+f);
 if(mode==='--report'){
  const oldReport=read(approval.previousReport),rows=entries.map(e=>{
   const key=I.hash({inputVersion:e.input.inputVersion,evaluationVersion:R.evaluationVersion}),file=path.resolve(root,'results',key,'result.json');
   const r=fs.existsSync(file)?read(file):null;if(r?.raw)assert.deepEqual(S.evaluate(r.raw).computed,r.computed);
   const old=oldReport.rows.find(x=>x.id===e.id);
   return {id:e.id,alias:e.alias||e.id,school:e.school||null,number:e.number||e.input.payload.target_question,previous:old.computed,status:r?.status||'pending',computed:r?.computed||null,raw:r?.raw||null,resultFile:file,startedAt:r?.startedAt,finishedAt:r?.finishedAt,usage:r?.evidence?.usage};
  });
  const gate=(id,g)=>rows.find(x=>x.alias===id)?.computed?.promotions?.includes(g)||false;
  const report={createdAt:new Date().toISOString(),manifestHash,promptHash:I.promptHash,evaluationVersion:R.evaluationVersion,completed:rows.filter(x=>x.status==='complete').length,failed:rows.filter(x=>x.status==='failed').length,pending:rows.filter(x=>x.status==='pending').length,checks:{V2_assembly:gate('V2','assembly'),V5_execution:gate('V5','execution'),V6_literacy:gate('V6','literacy')},teacherReview:'pending for bank three items',preservedFiles:Object.keys(preserved).length,rows};
  fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,rows:undefined}));return;
 }
 R.assertSubscription(process.env.CODEX_EXECUTABLE||'codex');
 console.log(JSON.stringify({manifestHash,items:6,settings:R.settings,evaluationVersion:R.evaluationVersion,mode:mode==='--run-approved'?'run':'prepare-only'}));
 if(mode!=='--run-approved')return;
 for(const e of entries){const r=await R.runOne(e,{outputRoot:path.resolve(root,'results'),executable:process.env.CODEX_EXECUTABLE||'codex'});console.log(JSON.stringify({id:e.alias||e.id,status:r.status,tier:r.computed.problem_tier,score:r.computed.score,gates:r.computed.promotions}));if(r.status==='failed'&&!r.evidence?.completed)break;}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validate};
