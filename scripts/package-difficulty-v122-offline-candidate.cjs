'use strict';
require('../tests/offline-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),C=require('../app/difficulty-v122/canonical.cjs');
const F=require('./check-difficulty-v122-contract-offline.cjs'),{parentRoot,manifest}=F.inputs();
const preservation=F.preservation(parentRoot),base=F.base;
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),sha=f=>C.bytesHash(fs.readFileSync(f));
const regression=read(path.join(base,'offline-regression.json')),schema=read(path.join(base,'schema-validation.json'));
assert.equal(regression.actualAICalls,0);assert.equal(schema.checks,144);assert.equal(schema.failed,0);
assert.equal(regression.original_failures_preserved,4);assert.equal(regression.diagnostic_only_passes,2);
assert.deepEqual(regression.preservation,preservation);
const baseline=read(path.join(base,'baseline-tests/test-process-summary.json')),candidate=read(path.join(base,'candidate-tests/test-process-summary.json'));
const failedNames=(folder,file)=>fs.readFileSync(path.join(base,folder,path.basename(file)+'.log'),'utf8')
 .split(/\r?\n/).filter(l=>/^not ok /.test(l)).map(l=>l.replace(/^not ok \d+ - /,''));
for(const before of baseline){
 const after=candidate.find(t=>t.file===before.file);assert(after);
 assert.equal(after.tests,before.tests);assert.equal(after.failed,before.failed);
 assert.deepEqual(failedNames('candidate-tests',before.file),failedNames('baseline-tests',before.file));
}
const added=candidate.find(t=>t.file==='tests/difficulty-v122-wire-contract.test.cjs');
assert.equal(added.tests,16);assert.equal(added.failed,0);
const versions=read(path.join(root,'app/difficulty-v122/candidate-versions.json'));
for(const [file,hash]of Object.entries(versions.files))assert.equal(sha(path.join(root,'app/difficulty-v122',file)),hash);
assert.equal(C.hash(versions.files),versions.versions.criteria_payload_hash);
const frozen=read(path.join(parentRoot,'release/difficulty-v122-successor-overlay-20261021/release-candidate-frozen.json'));
const additions=['app/difficulty-v122/wire-contract.cjs','scripts/check-difficulty-v122-contract-offline.cjs',
 'scripts/check-difficulty-v122-wire-schema-offline.py','scripts/build-difficulty-v122-offline-candidate.cjs',
 'scripts/package-difficulty-v122-offline-candidate.cjs','tests/difficulty-v122-wire-contract.test.cjs'];
const code=Object.fromEntries([...Object.keys(frozen.code),...additions].sort().map(file=>[file,sha(path.join(root,file))]));
const out=path.join(root,'release/difficulty-v122-contract-offline-20261021');fs.mkdirSync(out,{recursive:true});
const evidenceFiles=['offline-regression.json','schema-validation.json','inputs/manifest.json',
 'baseline-tests/test-process-summary.json','candidate-tests/test-process-summary.json'];
const evidence=Object.fromEntries(evidenceFiles.map(f=>[path.relative(root,path.join(base,f)).replaceAll('\\','/'),sha(path.join(base,f))]));
const documents=Object.fromEntries(['docs/difficulty-v122-contract-offline-20261021.md','docs/difficulty-v122-gwanghui13-role-review-20261021.md'].map(f=>[f,sha(path.join(root,f))]));
const sum=items=>items.reduce((a,x)=>({tests:a.tests+x.tests,passed:a.passed+x.passed,failed:a.failed+x.failed}),{tests:0,passed:0,failed:0});
const result={
 candidate_id:'difficulty-v122-contract-offline-20261021',status:'offline_candidate_not_ready_for_rollout',
 source_state:'parent commit plus exact candidate code mapping; no production activation',
 parent:{commit:manifest.parent_commit,bundle_hash:manifest.parent_bundle_hash,criteria_payload_hash:manifest.parent_criteria_payload_hash},
 candidate_bundle_hash:C.hash(code),bundle_hash_definition:'SHA256 canonical path-to-file-SHA256 mapping in code',
 versions:versions.versions,code,documents,evidence,preservation,
 validation:{baseline:sum(baseline),candidate:sum(candidate),new_failures:0,new_tests:16,schema_checks:144,
  original_responses_replayed:4,original_failures_preserved:4,diagnostic_only_passes:2,
  diagnostic_results_registered:false,live_provider_schema_acceptance_tested:false,
  existing_failures:baseline.filter(t=>t.failed).map(t=>({file:t.file,names:failedNames('baseline-tests',t.file)}))},
 source_role_review:{question_id:'0063e7dd-5688-40e8-a86f-0b6ffcd2713a',status:'pending',applied:false,selected_role:null},
 outstanding:['Guanghui source role requires review; no source role has been assigned.',
  'Shingu 16 saved response lacks two required direct-clue quotations; no quotations were fabricated.',
  'No new model response was generated with the candidate schema.',
  'Six pre-existing extended test failures remain documented; no expectations were weakened.'],
 approved_for_full_rollout:false,RC_READY_FOR_FULL_ROLLOUT:false,new_candidate_evaluation_started:false,
 prior_staging_full_rollout_started:true,prior_staging_run_resumed:false,actualAICalls:0,productionWrites:0,deployments:0,
 computerUse:0,browserAutomation:0,pdfGeneration:0
};
fs.writeFileSync(path.join(out,'candidate-manifest.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({path:out,bundle_hash:result.candidate_bundle_hash,criteria_payload_hash:result.versions.criteria_payload_hash,validation:result.validation}));
