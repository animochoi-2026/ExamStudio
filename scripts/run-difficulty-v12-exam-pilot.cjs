'use strict';
// Explicitly approved, frozen exam snapshot. Production write paths are not imported.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const I=require('../app/difficulty-v12/input.cjs'),R=require('../app/difficulty-v12/subscription.cjs'),S=require('../app/difficulty-v12/schema.cjs');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function validate(entries,targets,approval){
 assert(entries.length>0);assert.equal(entries.length,approval.maximumCalls);assert.equal(entries.length,targets.length);
 assert.deepEqual(entries.map(e=>e.questionId),targets.map(t=>t.question_id));
 assert.equal(new Set(entries.map(e=>e.questionId)).size,entries.length);
 assert.deepEqual(entries.map(e=>e.questionId),entries.map(e=>e.questionId).sort());
 for(const [n,e] of entries.entries()){
  const t=targets[n];assert.equal(e.id,e.questionId);assert.equal(e.revisionId,t.revision_id);assert.equal(e.reviewVersion,t.review_version);assert.equal(e.originalPoints,t.source.originalPoints);
  assert.equal(t.source.documentId,approval.sourceDocumentId);assert.equal(t.source.academicYear,approval.year);assert.equal(t.source.semester,approval.semester);assert.equal(t.source.exam,approval.exam);assert(approval.schoolNames.includes(t.source.school));
  R.verifyInput(e.input);
 }
 const hash=I.hash(entries);assert.equal(hash,approval.manifestHash);return hash;
}
function report(root,entries){
 const rows=entries.map(e=>{const key=I.hash({inputVersion:e.input.inputVersion,evaluationVersion:R.evaluationVersion}),f=path.resolve(root,'results',key,'result.json'),r=fs.existsSync(f)?read(f):null;if(r?.raw)assert.deepEqual(S.evaluate(r.raw).computed,r.computed);return {id:e.id,number:e.number,originalOrder:e.originalOrder,originalPoints:e.originalPoints,revisionId:e.revisionId,status:r?.status||'pending',computed:r?.computed||null,raw:r?.raw||null,startedAt:r?.startedAt,finishedAt:r?.finishedAt,usage:r?.evidence?.usage,resultFile:f};});
 const valid=rows.filter(r=>r.status==='complete'&&Number.isFinite(r.computed?.score));
 const value={createdAt:new Date().toISOString(),promptHash:I.promptHash,evaluationVersion:R.evaluationVersion,completed:valid.length,failed:rows.filter(r=>r.status==='failed').length,pending:rows.filter(r=>r.status==='pending').length,tiers:Object.fromEntries(Array.from({length:6},(_,n)=>['T'+n,valid.filter(r=>r.computed.problem_tier==='T'+n).length])),gates:Object.fromEntries(['assembly','literacy','execution'].map(g=>[g,valid.filter(r=>r.computed.promotions.includes(g)).length])),mean:valid.length?valid.reduce((s,r)=>s+r.computed.score,0)/valid.length:null,minimum:valid.length?Math.min(...valid.map(r=>r.computed.score)):null,maximum:valid.length?Math.max(...valid.map(r=>r.computed.score)):null,rows};
 fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(value,null,2));return value;
}
async function main(){
 const [root,mode]=process.argv.slice(2);if(!root)throw Error('Private exam pilot directory required');
 const entries=read(path.join(root,'inputs.json')),targets=read(path.join(root,'targets.json')),approval=read(path.join(root,'execution-approval.json'));
 validate(entries,targets,approval);assert.equal(approval.promptHash,I.promptHash);assert.equal(approval.evaluationVersion,R.evaluationVersion);assert.deepEqual(approval.settings,R.settings);assert.equal(approval.automaticRetries,0);
 for(const [f,h] of Object.entries(approval.protectedFiles))assert.equal(sha(f),h,'Protected file changed: '+f);
 if(mode==='--report'){const r=report(root,entries);console.log(JSON.stringify({...r,rows:undefined}));return;}
 R.assertSubscription(process.env.CODEX_EXECUTABLE||'codex');console.log(JSON.stringify({count:entries.length,settings:R.settings,promptHash:I.promptHash,mode:mode==='--run-approved'?'run':'prepare-only'}));
 if(mode!=='--run-approved')return;
 for(const e of entries){const r=await R.runOne(e,{outputRoot:path.resolve(root,'results'),executable:process.env.CODEX_EXECUTABLE||'codex'});report(root,entries);console.log(JSON.stringify({number:e.number,id:e.id,status:r.status,tier:r.computed.problem_tier,score:r.computed.score,gates:r.computed.promotions}));if(r.status==='failed'&&!r.evidence?.completed)break;}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validate,report};
