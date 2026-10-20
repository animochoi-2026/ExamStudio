'use strict';
// Minimal changed-dependency gate. No provider imports or production writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'artifacts/difficulty-v122-rc1');
const out=path.join(base,'rc-close-20261020'),prior=path.join(base,'offline-preflight-20261020/final');
const C=require('../app/difficulty-v122/canonical.cjs'),dir=path.join(root,'app/difficulty-v122');
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>C.bytesHash(fs.readFileSync(f)),save=(n,x)=>fs.writeFileSync(path.join(out,n),JSON.stringify(x,null,2)+'\n');
const old=read(path.join(out,'prior-candidate-versions.json')),current=read(path.join(dir,'candidate-versions.json')),checks=[],reused=[];
function check(name,fn){try{const evidence=fn();checks.push({name,passed:true,evidence});}catch(e){checks.push({name,passed:false,error:e.message});}}
function unchanged(names){for(const n of names)assert.equal(sha(path.join(dir,n)),old.files[n],n);return names;}
function reuse(name,report,names){unchanged(names);reused.push({name,report:path.relative(root,path.join(prior,report)),report_sha256:sha(path.join(prior,report)),dependencies:names.map(n=>({file:n,sha256:old.files[n]}))});return read(path.join(prior,report));}
check('criteria, prompt, schema and all numeric rules unchanged',()=>unchanged([
 'prompt.json','prompt.cjs','schema.cjs','schema.json','scorer.cjs','projection.cjs','validate.cjs','references.cjs','policy.cjs','router.cjs']));
check('input and source contract unchanged; 1252 corpus evidence reused',()=>{
 const r=reuse('1252 corpus input/hash/revision/basis/route','corpus-preflight.json',[
  'input.cjs','source.cjs','native-source.cjs','approved-review.cjs','source-review.cjs','canonical.cjs']);
 const Adapter=require('../app/difficulty-v122/adapters.cjs'),before=require(path.join(base,'batch-preflight-20261020/before/app/difficulty-v122/adapters.cjs'));
 assert.equal(Adapter.fromConfirmed.toString(),before.fromConfirmed.toString(),'source adapter changed');
 assert.equal(r.input_build_success,1252);assert.equal(r.input_build_failure,0);
 for(const p of r.snapshot_pages)assert.equal(sha(path.join(base,'corpus-snapshot',p.file)),p.sha256);
 return {reexecuted:false,passed:1252,snapshot_pages_verified:r.snapshot_pages.length};
});
check('cache discovery unchanged; full cache audit not repeated',()=>{
 const f='scripts/difficulty-v122-cache.cjs',hashes=read(path.join(prior,'checked-file-hashes.json')).files;
 assert.equal(sha(path.join(root,f)),hashes[f]);const r=read(path.join(prior,'cache-audit.json'));
 reused.push({name:'1252 cache / 2519 files',report:path.relative(root,path.join(prior,'cache-audit.json')),report_sha256:sha(path.join(prior,'cache-audit.json')),dependencies:[{file:f,sha256:hashes[f]}]});
 return {reexecuted:false,previous:r};
});
check('1253 schema meta evidence reused',()=>{
 const r=reuse('schema meta and portability','schema-meta.json',['schema.cjs','schema.json','source.cjs']);assert.equal(r.failed,0);return r;
});
check('current canonical content manifest matches actual bytes',()=>{
 for(const [f,h]of Object.entries(current.files))assert.equal(sha(path.join(dir,f)),h,f);return {files:Object.keys(current.files).length};
});
check('18 current phase runner and checkpoint tests',()=>{
 const r=read(path.join(out,'tests/test-process-summary.json')).find(r=>r.file.endsWith('phase-batch.test.cjs'));
 assert.equal(r.exitCode,0);assert.equal(r.passed,18);assert.equal(r.failed,0);return r;
});
check('4 isolated external IO and allowlist tests',()=>{
 const r=read(path.join(out,'tests/test-process-summary.json')).find(r=>r.file.endsWith('offline-isolation.test.cjs'));
 assert.equal(r.exitCode,0);assert.equal(r.passed,4);assert.equal(r.failed,0);return r;
});
check('5 identity-bound approved projection tests',()=>{
 const r=read(path.join(out,'review-tests/test-process-summary.json'))[0];assert.equal(r.passed,5);assert.equal(r.failed,0);return r;
});
check('12 actual desktop API batch Edge entrypoint checks',()=>{
 const files=['entrypoint-integration.json','edge-runtime-integration.json','edge-entrypoint-gate.json'];
 const rs=files.map(f=>read(path.join(out,'entrypoints',f)));
 const count=rs.reduce((n,r)=>n+(r.passed??(r.status==='passed'?1:0)),0);
 for(const r of rs)assert(!r.failed);assert.equal(count,12);return {passed:count,files};
});
check('approved M2 artifact actual content and stored parent preserved',()=>{
 const a=read(path.join(out,'shingu10-approved-review.json')),b=require('./prepare-shingu10-approved-rc.cjs').build();
 assert.deepEqual(a,JSON.parse(JSON.stringify(b)));assert.equal(a.evaluated.computed.score,4.8);assert.equal(a.evaluated.computed.problem_tier,'T2');
 return {parent_result_hash:a.parent_result_hash,projection_hash:a.projection_hash,score:4.8,tier:'T2',model_generated:false};
});
check('historical raw and source records preserved; legacy excluded explicitly',()=>{
 const start=read(path.join(base,'batch-preflight-20261020/start.json')),saved=read(path.join(prior,'saved/report.json'));
 const files={...Object.fromEntries(Object.entries(start.protectedFiles).map(([f,h])=>[path.join(root,f),h])),...saved.snapshotFiles};
 for(const [f,h]of Object.entries(files))assert.equal(sha(f),h,f);
 const legacy=saved.rows.filter(r=>r.school==='shingu'&&String(r.number)!=='10'||r.school==='shindong'&&['5','7','8','14','16','18','서답형 1'].includes(String(r.number)))
  .map(r=>({question_id:r.question_id,revision_id:r.revision_id,school:r.school,number:r.number,
   legacy_status:'preserved_not_migrated',release_blocker:false,reason:'historical_contract_missing_current_fields',historical_diagnostic_status:r.status}));
 assert.equal(legacy.length,30);save('legacy-nonblockers.json',legacy);
 const replay=read(path.join(prior,'shingu-original-scorer-replay.json'));assert.equal(replay.rows.filter(r=>r.status==='passed').length,23);
 return {protectedFiles:Object.keys(files).length,changed:0,legacyItems:30,originalShinguScorerPreserved:23};
});
check('execution 6, 21, written1 original scorer replay remains exact',()=>{
 const oldDir=path.join(base,'baseline/shindong-m2-three-stage-20261020'),m=read(path.join(oldDir,'manifest.json')),S=require(path.join(oldDir,'scorer.cjs'));
 const rows=[];
 for(const [number,score,tier]of [['6',6.8,'T3'],['21',8.7,'T4'],['서답형 1',9.7,'T5']]){
  const item=m.find(x=>String(x.number)===number),final=read(path.join(oldDir,'run-three-stage',item.id,'final.json'));
  const raw=read(path.join(oldDir,'run-three-stage',item.id,'stage-'+final.finalStage,'result.json')).raw,ctx=read(path.join(oldDir,item.contextFile));
  const now=S.score(raw,ctx);assert.equal(now.score,score);assert.equal(now.problem_tier,tier);assert.deepEqual(now.promotions,final.computed.promotions);
  rows.push({number,score,tier,promotions:now.promotions,rawSHA256:C.hash(raw),forcedMigration:false});
 }
 save('execution-original-scorer-preservation.json',rows);return rows;
});
check('AST operating write and RPC controls including new scheduling files',()=>{
 const D=require(path.join(base,'baseline/shindong-m2-three-stage-20261020/detect-db-writes.cjs'));
 for(const op of ['insert','update','upsert','delete'])assert.equal(D.scan('client.from("x").'+op+'(p)').writes.length,1);
 assert.equal(D.scan('client.rpc("bank_v121_review_import",p)').writes.length,1);assert.equal(D.scan('storage.putFile(p)').writes.length,1);
 for(const x of ['Array.from({length:3},(_,i)=>i)','client.from("x").select("*")','client.rpc("bank_search_current",{})'])assert.equal(D.scan(x).writes.length,0);
 for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.cjs'))){const r=D.scan(fs.readFileSync(path.join(dir,f),'utf8'));assert.equal(r.writes.length,0,f);assert.equal(r.unresolved.length,0,f);}
 return {positiveControls:6,negativeControls:3,actualWrites:0};
});
check('criteria coverage preserves 79 prior passes and resolves scoped dependencies',()=>{
 const oldCoverage=read(path.join(prior,'criteria-coverage.json'));
 unchanged(['scorer.cjs','validate.cjs','references.cjs','source.cjs','projection.cjs','router.cjs','evaluator.cjs','contracts.cjs']);
 const criteria=oldCoverage.criteria.map(c=>({...c,prior_status:c.status,status:c.status==='passed'?'passed_reused':
  [21,22,23].includes(c.id)?'passed_new_approved_review':c.id===30?'passed_original_scorer_legacy_preservation':c.status,
  evidence:[21,22,23].includes(c.id)?'review-tests/test-process-summary.json':c.id===30?'execution-original-scorer-preservation.json':path.relative(root,path.join(prior,'criteria-coverage.json'))}));
 assert(criteria.every(c=>c.status.startsWith('passed')));save('criteria-coverage.json',{mapped:83,required:83,passed:83,failed:0,blocked:0,criteria});
 return {mapped:83,passed:83,reused:79,currentApprovedReview:3,originalScorerPreservation:1};
});
check('subscription transport and no-test-execution boundary unchanged',()=>unchanged(['subscription.cjs','test-boundary.cjs']));
check('production catalog and activation hashes match previous accepted evidence',()=>{
 const rows=read(path.join(out,'production-before.json')).rows;
 assert.deepEqual(rows,[{kind:'catalog',n:1629,hash:'93b9066527286ac2785a22be3291bcc4'},
  {kind:'activation_results',n:1266,hash:'6ff57e307d1abe26eabde4d88917aaa8'},{kind:'activation_batches',n:1,hash:'3b2dd85cca6132a8f11dda3428391693'}]);
 return {readOnly:true,rows};
});
check('payload limits record actual evidence without inventing a ceiling',()=>{
 const previous=read(path.join(prior,'input-limit-review.json'));
 return {...previous,status:'recorded_unknown_external_limit',release_blocker:false,
  reason:'No new observed limit error. User authorizes bounded actual smoke; no guessed threshold, truncation or image alteration.'};
});
const report={at:new Date().toISOString(),passed:checks.filter(x=>x.passed).length,failed:checks.filter(x=>!x.passed).length,checks,reused,
 currentTests:{phase:18,isolation:4,approvedReview:5,entrypoints:12,total:39},corpusReexecuted:false,cacheReaudited:false,
 all4216Reexecuted:false,actualAICalls:0,productionWrites:0,deployments:0,computerUse:0,approvedForFullRollout:false};
save('minimal-preflight.json',report);console.log(JSON.stringify({...report,checks:checks.filter(x=>!x.passed),reused:undefined},null,2));
if(report.failed)process.exitCode=1;
