'use strict';
// Offline release packaging. No provider, database, deployment or subprocess.
require('../tests/offline-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../app/difficulty-v122/canonical.cjs'),V=require('../app/difficulty-v122/validate.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'artifacts/difficulty-v122-overlay-replay-final-20261021');
const out=path.join(root,'release/difficulty-v122-successor-overlay-20261021');
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>C.bytesHash(fs.readFileSync(f));
const sourceCommit=process.argv[2];assert(/^[a-f0-9]{40}$/.test(sourceCommit||''),'committed source SHA required');
assert(!fs.existsSync(out),'successor artifacts already exist');
const parent=read(path.join(root,'artifacts/difficulty-v122-evidence-rc/predecessor-preservation.json'));
const parentManifestFile=path.join(parent.old_root,'release/difficulty-v122-rc1/release-candidate-frozen.json');
const parentManifest=read(parentManifestFile),candidate=read(path.join(root,'app/difficulty-v122/candidate-versions.json'));
const before=read(base+'/before.json'),replay=read(base+'/saved-replay.json'),checks=read(base+'/minimum-checks.json');
assert.equal(checks.passed,8);assert.equal(checks.failed,0);assert.equal(checks.network_attempts,0);
assert.equal(replay.passed,3);assert.equal(replay.failed,0);assert.equal(replay.new_ai_calls,0);
assert(replay.successor_freeze_eligible);assert.equal(replay.results[0].acceptance_checks.length,17);
for(const [f,h]of Object.entries(before.files))assert.equal(sha(path.join(root,f)),h,f);
for(const [f,h]of Object.entries(parent.files))assert.equal(sha(path.join(parent.old_root,f)),h,f);
for(const [f,h]of Object.entries(candidate.files))assert.equal(sha(path.join(root,'app/difficulty-v122',f)),h,f);
assert.equal(C.hash(candidate.files),candidate.versions.criteria_payload_hash);

const extraFiles=[
 'scripts/build-difficulty-v122-evidence-rc.cjs','scripts/build-difficulty-v122-overlay-candidate.cjs',
 'scripts/replay-difficulty-v122-evidence.cjs','scripts/replay-difficulty-v122-role-overlay.cjs',
 'scripts/smoke-difficulty-v122-evidence.cjs','scripts/difficulty-v122-replay-gate.cjs',
 'scripts/check-difficulty-v122-replay-close.cjs','scripts/freeze-difficulty-v122-replay-successor.cjs',
 'tests/difficulty-v122-evidence.test.cjs','tests/difficulty-v122-role-overlay.test.cjs','tests/difficulty-v122-overlay-entrypoints.cjs'];
const codeFiles=[...new Set([...Object.keys(parentManifest.code),...Object.keys(candidate.files).map(f=>'app/difficulty-v122/'+f),...extraFiles])].sort();
const code=Object.fromEntries(codeFiles.map(f=>[f,sha(path.join(root,f))]));
const bundleHash=C.hash(code);
const copies=new Map(),add=(dest,file)=>copies.set(dest,{source:file,bytes:fs.readFileSync(file),sha256:sha(file)});
for(const file of ['before.json','saved-replay.json','minimum-checks.json','previous-replay-script.cjs'])add('evidence/'+file,base+'/'+file);
add('evidence/previous-failed-replay.json',path.join(root,'artifacts/difficulty-v122-role-overlay/saved-replay.json'));
add('evidence/parent-release-candidate-frozen.json',parentManifestFile);
add('evidence/parent-preservation.json',path.join(root,'artifacts/difficulty-v122-evidence-rc/predecessor-preservation.json'));
add('evidence/frozen-source-inputs.json',path.join(root,'artifacts/difficulty-v122-evidence-rc/inputs/sources.json'));
add('evidence/overlay-local-tests.txt',path.join(root,'artifacts/difficulty-v122-role-overlay/local-tests.tap'));
add('evidence/overlay-entrypoint-mocks.json',path.join(root,'artifacts/difficulty-v122-role-overlay/entrypoint-mocks.json'));
const originalPlan=read(path.join(root,'artifacts/difficulty-v122-evidence-rc/inputs/approved-run-plan.json'));
const singlePlan=read(path.join(root,'artifacts/difficulty-v122-evidence-rc/single-luna-smoke/approved-plan.json'));
const sourceResponses=[];
for(const [index,number]of [[0,11],[1,13],[2,9]]){
 const plan=index?originalPlan:singlePlan,request=index?plan.requests[index]:plan;
 const transportDir=index
  ?path.join(parent.old_root,'artifacts/difficulty-v122-rc1/post-freeze-luna-contract-smoke-20261020T150005Z/transport',request.request_id)
  :path.join(root,'artifacts/difficulty-v122-evidence-rc/single-luna-smoke/transport',request.request_id);
 const transport=read(transportDir+'/transport-result.json'),raw=read(transportDir+'/raw-response.json'),schema=read(transportDir+'/schema.json');
 assert.equal(transport.status,'complete');assert.equal(transport.model,'gpt-6-luna');assert.equal(transport.effort,'medium');
 assert.equal(transport.evidence.completed,true);assert.equal(transport.evidence.exitCode,0);assert.deepEqual(transport.raw,raw);
 assert.equal(sha(transportDir+'/raw-response.json'),replay.results[index].raw_sha256);
 V.structural(V.sanitized(raw),schema);
 for(const field of ['question_id','revision_id','question_content_hash','image_asset_hash','difficulty_basis_hash','source_manifest_hash'])
  assert.equal(request.identity[field],replay.results[index].identity[field],field);
 for(const file of fs.readdirSync(transportDir))add('evidence/source-'+number+'/'+file,transportDir+'/'+file);
 sourceResponses.push({number,question_id:request.identity.question_id,original_identity:request.identity,
  original_request_envelope:request.request_envelope,original_request_id:request.request_id,
  exact_model:transport.model,effort:transport.effort,original_started_at:transport.started_at,original_completed_at:transport.completed_at,
  source_response_was_actual_luna:true,source_response_api_passed:true,source_response_schema_passed:true,
  raw_response_hash:sha(transportDir+'/raw-response.json'),transport_result_hash:sha(transportDir+'/transport-result.json'),
  original_failure_records_preserved:true,final_contract_replay_passed:true});
}
// Never export credentials. Report file names only, never matching values.
const secret=/(?<![A-Za-z0-9_-])(?:sk-(?:proj-)?[A-Za-z0-9_-]{32,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,})/;
assert(secret.test('"sk-proj-'+'x'.repeat(50)+'"'));
assert(secret.test('Bearer sk-'+'x'.repeat(50)));
assert(!secret.test('"ask-'+'schema_version_'.repeat(4)+'"'),'embedded sk in schema name is not a credential');
for(const [name,v]of copies)if(!name.endsWith('.webp'))assert(!secret.test(v.bytes.toString('utf8')),'secret-like evidence: '+name);
const artifactHashes=Object.fromEntries([...copies].map(([n,v])=>[n,v.sha256]));
const flags={LUNA_LATEST_CONTRACT_SMOKE_PASSED:true,RC_READY_FOR_FULL_ROLLOUT:true,approved_for_full_rollout:false,
 requires_separate_user_approval:true,full_rollout_started:false,productionWrites:0,deployments:0,fullCorpusAICalls:0,computerUse:0};
const executionPolicy={phase_order:['all Luna/medium complete','freeze Stage 2 candidate manifest','all candidates Sol/medium complete','freeze Stage 3 candidate manifest','structural-failure candidates Sol/high complete','final merge'],
 stage_concurrency:3,cross_stage_concurrency:0,automatic_retries:0,unknown_result_retry:false,
 model_bindings:require('../app/difficulty-v122/policy.cjs').stages};
const common={...flags,candidate_id:'difficulty-v122-successor-overlay-20261021',source_commit:sourceCommit,
 parent:{commit:parent.commit,bundle_hash:parentManifest.hashes.criteria_payload_hash,frozen_manifest_hash:sha(parentManifestFile)},
 bundle_hash:bundleHash,bundle_hash_definition:'SHA256 of canonical JSON mapping code file paths to SHA256 bytes',
 hashes:candidate.versions,verification_mode:'actual_luna_response_replay',new_ai_calls:0,execution_policy:executionPolicy};
const attestation={...common,source_response_was_actual_luna:true,source_response_api_passed:true,source_response_schema_passed:true,
 final_contract_replay_passed:true,live_call_under_final_contract:false,
 provenance_note:'Previously collected actual Luna responses replayed under the final overlay/evidence contract; no new model call. Original input and criteria hashes remain separate from replay hashes.',
 historical_comparison:replay.results[0].historical_comparison,source_responses:sourceResponses,
 question_results:replay.results,checks:{minimum_passed:8,minimum_failed:0,replay_passed:3,replay_failed:0,question11_acceptance_passed:17},
 parent_hash_mismatches:0,original_failure_records_preserved:true,artifact_hashes:artifactHashes};
const frozen={...common,status:'frozen',code,artifact_hashes:artifactHashes,
 attestation_file:'latest-luna-contract-replay-attestation.json',attestation_sha256:C.bytesHash(JSON.stringify(attestation,null,2)+'\n'),
 app_candidate_status_note:'Immutable candidate-versions.json retains its historical pre-freeze status; this release manifest is the freeze authority.',
 scope:'Approved role overlay and evidence wiring; release gate accepts current deterministic T0 result without historical exact decimal equality.',
 validation:attestation.checks,corpus_reexecuted:false,historical4216_reexecuted:false,remaining_hard_blockers:[]};
const readiness={...common,validation:attestation.checks,latest_luna_contract_verified:true,
 verification_evidence:'actual_luna_response_replay',ready_for_separate_full_rollout_request:true,remaining_hard_blockers:[],
 limitations:['No new Luna/Sol call under this request. Earlier Sol and policy-test evidence is inherited, not rerun.',
 'No full corpus, cache, historical, queue, GUI or production validation was rerun. Operational activation and deployment are not approved.',
 'The previously run representative Edge mock used a no-overlay fixture; desktop/API/batch overlay mocks are preserved as prior evidence.'],
 attestation_file:'latest-luna-contract-replay-attestation.json'};
const rollback={...common,status:'local_recovery_package',productionApplied:false,automaticRollbackExecuted:false,
 parent_source_commit:parent.commit,parent_manifest:'evidence/parent-release-candidate-frozen.json',
 historical_artifact_locations:parent.old_root,protected_parent_hashes:parent.files,
 recovery:'Create a separate checkout at parent_source_commit to recover parent code. Preserve ignored originals and this release evidence. Do not reset shared worktrees, deploy, overwrite historical raw responses or change production scores.'};
const template=`# Difficulty v1.2.2 전체 재평가 별도 승인 요청서\n\n- 동결 후보: ${common.candidate_id}\n- 소스 commit: ${sourceCommit}\n- bundle hash: ${bundleHash}\n- criteria payload hash: ${candidate.versions.criteria_payload_hash}\n- 검증 방식: 기존 실제 Luna raw 3건의 최종 계약 재생, 신규 AI 호출 0회\n- 새 대상 ID/revision/입력 snapshot 및 제외 목록: 별도 승인 시 고정\n- 모델: gpt-6-luna/medium → gpt-6.1-sol/medium → gpt-6.1-sol/high\n- 전체 Luna/medium 완료(동시성 3) → Stage 2 후보 manifest 동결 → 후보 전체 Sol/medium 완료(동시성 3) → Stage 3 후보 manifest 동결 → 구조 실패 후보 전체 Sol/high 완료(동시성 3) → 최종 병합\n- 서로 다른 stage 동시 실행 0, 자동 재시도 0, 결과 미확인 자동 재호출 금지\n- 단계별 대상 수·최대 신규 호출 수·총 상한: 별도 사용자 승인에 명시\n- 운영 write/점수 활성화/배포는 별도 승인\n\nRC_READY_FOR_FULL_ROLLOUT=true\nLUNA_LATEST_CONTRACT_SMOKE_PASSED=true\napproved_for_full_rollout=false\nrequires_separate_user_approval=true\nfull_rollout_started=false\n`;
if(process.argv[3]==='--check-only'){
 console.log(JSON.stringify({packaging_checks:'passed',code_files:codeFiles.length,evidence_files:copies.size,source_provenance_checks:sourceResponses.length,new_ai_calls:0}));
 process.exit(0);
}
fs.mkdirSync(out,{recursive:true});
for(const [name,v]of copies){fs.mkdirSync(path.dirname(path.join(out,name)),{recursive:true});fs.writeFileSync(path.join(out,name),v.bytes,{flag:'wx'});}
for(const [name,value]of Object.entries({'release-candidate-frozen.json':frozen,'rollback-package.json':rollback,
 'full-rollout-readiness.json':readiness,'latest-luna-contract-replay-attestation.json':attestation}))
 fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(out,'full-rollout-request-template.md'),template,{flag:'wx'});
console.log(JSON.stringify({release:out,source_commit:sourceCommit,bundle_hash:bundleHash,criteria_payload_hash:candidate.versions.criteria_payload_hash,
 code_files:codeFiles.length,evidence_files:copies.size,new_ai_calls:0,flags}));
