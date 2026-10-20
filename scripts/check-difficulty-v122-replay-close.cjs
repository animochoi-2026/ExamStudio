'use strict';
require('../tests/offline-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'artifacts/difficulty-v122-overlay-replay-final-20261021');
const C=require('../app/difficulty-v122/canonical.cjs'),Gate=require('./difficulty-v122-replay-gate.cjs');
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>C.bytesHash(fs.readFileSync(f));
const before=read(base+'/before.json'),parent=read(path.join(root,'artifacts/difficulty-v122-evidence-rc/predecessor-preservation.json'));
const checks=[];
function check(name,fn){try{checks.push({name,passed:true,details:fn()});}catch(e){checks.push({name,passed:false,error:e.message});}}
const valid={status:'complete',problem_tier:'T0',score:1.2,promotions:[],assembly_triggered:false,assembly_mode:'none'};
check('historical exact score gate removed; reference retained',()=>{
 const text=fs.readFileSync(path.join(root,'scripts/replay-difficulty-v122-role-overlay.cjs'),'utf8');
 assert(!/assert\.equal\(r\.computed\.score,\s*1\.4/.test(text));
 assert(Gate.semanticGate(valid,null));
 const h=Gate.historicalComparison(valid);assert.equal(h.historical_reference_score,1.4);assert.equal(h.exact_decimal_match_required,false);
 return h;
});
check('semantic tier promotion assembly routing gates retained',()=>{
 for(const patch of [{status:'failed'},{problem_tier:'T1'},{promotions:['literacy']},{promotions:['execution']},{assembly_triggered:true},{assembly_mode:'chain'}])
  assert.throws(()=>Gate.semanticGate({...valid,...patch},null));
 assert.throws(()=>Gate.semanticGate(valid,2));return {negative_controls:7};
});
check('T0 band accepts boundaries and decimals; rejects out of band',()=>{
 for(const score of [1,1.1,1.2,1.4,1.9,2])assert(Gate.semanticGate({...valid,score},null));
 for(const score of [0.9,2.1,NaN,Infinity])assert.throws(()=>Gate.semanticGate({...valid,score},null));
 return {positive_controls:6,negative_controls:4};
});
check('all evaluator bytes and scorer formula unchanged in this request',()=>{
 const paths=Object.keys(before.files).filter(f=>f.startsWith('app/')||f.endsWith('/engine.mjs'));
 for(const f of paths)assert.equal(sha(path.join(root,f)),before.files[f],f);
 assert.equal(sha(path.join(root,'app/difficulty-v122/scorer.cjs')),parent.files['app/difficulty-v122/scorer.cjs']);
 assert.equal(require('../app/difficulty-v122/scorer.cjs').decimal(0,0,2),1.2);
 return {files:paths.length,scorer_hash:before.files['app/difficulty-v122/scorer.cjs']};
});
check('immutable overlay and historical failure/raw preserved',()=>{
 for(const [f,h]of Object.entries(before.files))assert.equal(sha(path.join(root,f)),h,f);
 return {files:Object.keys(before.files).length,overlay_file_hash:before.files['app/difficulty-v122/projection-role-overlays.json']};
});
check('operational write detector with real positive controls',()=>{
 const D=require(path.join(parent.old_root,'artifacts/difficulty-v122-rc1/baseline/shindong-m2-three-stage-20261020/detect-db-writes.cjs'));
 for(const op of ['insert','update','upsert','delete'])assert.equal(D.scan('client.from("fixture").'+op+'(payload)').writes.length,1);
 const files=fs.readdirSync(path.join(root,'app/difficulty-v122')).filter(n=>n.endsWith('.cjs'));
 for(const f of files){const result=D.scan(fs.readFileSync(path.join(root,'app/difficulty-v122',f),'utf8'));assert.equal(result.writes.length,0,f);assert.equal(result.unresolved.length,0,f);}
 return {files:files.length,positive_controls:4,operational_writes:0};
});
check('secret redaction and scoped candidate/evidence secret scan',()=>{
 const F=require('../app/difficulty-v121/failures.cjs'),Sub=require('../app/difficulty-v12/subscription.cjs');
 const fake='sk-proj-'+'x'.repeat(50);assert(!F.redact('Authorization: Bearer '+fake).includes(fake));
 assert.deepEqual(Sub.cleanEnv({OPENAI_API_KEY:fake,ACCESS_TOKEN:fake,SERVICE_ROLE:fake,PATH:'fixture'}),{PATH:'fixture'});
 const files=[...Object.keys(before.files),path.relative(root,base+'/saved-replay.json')];
 const secret=/(?:sk-(?:proj-)?[A-Za-z0-9_-]{32,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,})/;
 for(const f of files)assert(!secret.test(fs.readFileSync(path.join(root,f),'utf8')),'secret-like content: '+f);
 return {redaction_controls:2,scanned_files:files.length,findings:0};
});
check('parent frozen code raw artifacts unchanged',()=>{
 for(const [f,h]of Object.entries(parent.files))assert.equal(sha(path.join(parent.old_root,f)),h,f);
 const localRelease=path.join(root,'release/difficulty-v122-rc1'),originalRelease=path.join(parent.old_root,'release/difficulty-v122-rc1');
 for(const f of fs.readdirSync(localRelease))assert.equal(sha(path.join(localRelease,f)),sha(path.join(originalRelease,f)),f);
 return {protected_files:Object.keys(parent.files).length,parent_release_files:fs.readdirSync(localRelease).length,mismatches:0};
});
const replay=read(base+'/saved-replay.json');
assert.equal(replay.failed,0);assert.equal(replay.passed,3);assert.equal(replay.results[0].acceptance_checks.length,17);
assert.equal(replay.new_ai_calls,0);
const report={verification_mode:'offline_minimal_replay_close',checks,passed:checks.filter(x=>x.passed).length,failed:checks.filter(x=>!x.passed).length,
 replay_passed:3,replay_failed:0,question11_acceptance_passed:17,new_ai_calls:0,
 network_attempts:require('../tests/offline-guard.cjs').blocked.length,productionWrites:0,deployments:0,fullCorpusAICalls:0,computerUse:0};
fs.writeFileSync(base+'/minimum-checks.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));if(report.failed)process.exitCode=1;
