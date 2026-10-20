'use strict';
// Candidate metadata only. Never overwrites an existing frozen release.
require('../tests/offline-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'app/difficulty-v122');
const C=require('../app/difficulty-v122/canonical.cjs'),F=require('./check-difficulty-v122-contract-offline.cjs');
const {manifest,parentRoot}=F.inputs();F.preservation(parentRoot);
const files=Object.fromEntries(fs.readdirSync(dir).filter(n=>/\.(cjs|json)$/.test(n)&&n!=='candidate-versions.json').sort().map(n=>[n,C.bytesHash(fs.readFileSync(path.join(dir,n)))]));
const versions={
 prompt_hash:C.hash(['prompt.json','prompt.cjs','wire-contract.cjs'].map(n=>files[n])),
 schema_hash:C.hash(['schema.json','schema.cjs','wire-contract.cjs'].map(n=>files[n])),
 projection_hash:files['projection.cjs'],
 validator_hash:C.hash(['validate.cjs','references.cjs','response-contract.cjs','evidence.cjs','projection-role-overlay.cjs','projection-role-overlays.json'].map(n=>files[n])),
 scorer_hash:files['scorer.cjs'],
 source_builder_hash:C.hash(['source.cjs','input.cjs','evidence.cjs','projection-role-overlay.cjs','projection-role-overlays.json'].map(n=>files[n])),
 criteria_payload_hash:C.hash(files)
};
const parent=JSON.parse(fs.readFileSync(path.join(parentRoot,'app/difficulty-v122/candidate-versions.json')));
for(const key of ['projection_hash','validator_hash','scorer_hash','source_builder_hash'])assert.equal(versions[key],parent.versions[key],key);
assert.notEqual(versions.criteria_payload_hash,manifest.parent_criteria_payload_hash);
fs.writeFileSync(path.join(dir,'candidate-versions.json'),JSON.stringify({
 status:'offline_contract_candidate_not_ready_for_rollout',parent_commit:manifest.parent_commit,parent_bundle_hash:manifest.parent_bundle_hash,
 parent_criteria_payload_hash:manifest.parent_criteria_payload_hash,mathematical_rules_unchanged:true,
 approved_for_full_rollout:false,RC_READY_FOR_FULL_ROLLOUT:false,actualAICalls:0,versions,files
},null,2)+'\n');
console.log(JSON.stringify({status:'offline_contract_candidate_not_ready_for_rollout',versions}));
