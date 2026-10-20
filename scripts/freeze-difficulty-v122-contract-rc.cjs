'use strict';
// Local freeze only. Does not deploy, activate, migrate, or call a provider.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'artifacts/difficulty-v122-rc1/rc-contract-fix-20261020');
const out=path.join(root,'release/difficulty-v122-rc1'),C=require('../app/difficulty-v122/canonical.cjs');
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>C.bytesHash(fs.readFileSync(f)),rel=f=>path.relative(root,f).replaceAll('\\','/');
function main(){
 const smokeDir=path.join(base,'selection-fix/smoke-medium'),smoke=read(path.join(smokeDir,'report.json'));
 assert.equal(smoke.failed,0);assert.equal(smoke.results.length,3);assert(smoke.results.every(x=>x.result?.status==='complete'));
 assert.equal(smoke.calls.luna,3);assert(smoke.calls.total<=6);assert.equal(smoke.calls.solHigh,0);assert.equal(smoke.calls.retries,0);
 assert(!fs.existsSync(path.join(smokeDir,'batch/runner.lock')));assert(!fs.existsSync(path.join(base,'smoke/batch/runner.lock')));
 const before=read(path.join(base,'production-before.json')),after=read(path.join(base,'production-after.json'));assert.deepEqual(after.rows,before.rows);
 const gate=read(path.join(base,'selection-fix/minimal-preflight.json'));assert.equal(gate.failed,0);assert.equal(gate.totalValidations,59);
 const candidate=read(path.join(root,'app/difficulty-v122/candidate-versions.json'));
 for(const [f,h]of Object.entries(candidate.files))assert.equal(sha(path.join(root,'app/difficulty-v122',f)),h);
 const plan=read(path.join(smokeDir,'approved-plan.json'));for(const [f,h]of Object.entries(plan.lockedFiles))assert.equal(sha(path.join(root,f)),h,f);
 const codeFiles=[...Object.keys(candidate.files).map(f=>'app/difficulty-v122/'+f),'app/difficulty-v122/candidate-versions.json',
  'app/bank-analysis.cjs','app/difficulty-v12/server.cjs','app/exam-queue-main.cjs','package.json','scripts/build-difficulty-v12.cjs','supabase/functions/bank-difficulty-v12/engine.mjs',
  ...fs.readdirSync(path.join(root,'scripts')).filter(f=>/difficulty-v122|test-offline/.test(f)).map(f=>'scripts/'+f),
  ...fs.readdirSync(path.join(root,'tests')).filter(f=>/difficulty-v122|offline-guard|^exam-queue-integration|^difficulty-v12-queue/.test(f)).map(f=>'tests/'+f)];
 const code=Object.fromEntries([...new Set(codeFiles)].sort().map(f=>[f,sha(path.join(root,f))]));
 const artifacts={};function record(file){artifacts[rel(file)]=sha(file);}
 for(const d of [path.join(base,'smoke'),smokeDir]){
  for(const f of ['approved-plan.json','sources.json','started.json','report.json','batch/manifest.json','batch/checkpoint.json'])record(path.join(d,f));
  for(const folder of ['batch/calls','transport']){
   function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(e.name.endsWith('.json')||e.name==='rendered-payload.txt')record(f);}}
   walk(path.join(d,folder));
  }
 }
 for(const f of ['production-before.json','production-after.json','selection-fix/minimal-preflight.json','selection-fix/schema-meta.json','before.json'])record(path.join(base,f));
 const previous=path.join(base,'../rc-close-20261020');
 for(const f of ['criteria-coverage.json','legacy-nonblockers.json','shingu10-approved-review.json','execution-original-scorer-preservation.json','completion-verification.json'])record(path.join(previous,f));
 const snapshot=path.join(base,'../corpus-snapshot'),corpus=Object.fromEntries(fs.readdirSync(snapshot).filter(f=>/^page-\d+\.json$/.test(f)).sort().map(f=>[f,sha(path.join(snapshot,f))]));
 const flags={RC_READY_FOR_FULL_ROLLOUT:true,approved_for_full_rollout:false,requires_separate_user_approval:true,productionWrites:0,deployments:0,fullCorpusAICalls:0,computerUse:0,batchConcurrency:3,crossStageConcurrency:0};
 const common={...flags,versions:{spec_revision:'difficulty-v1.2.2-rc1',projection_version:require('../app/difficulty-v122/projection.cjs').version,
  source_id_contract_version:require('../app/difficulty-v122/source.cjs').version,model_policy_version:require('../app/difficulty-v122/policy.cjs').model_policy_version,
  batch_policy_version:require('../app/difficulty-v122/phase-batch.cjs').version,response_contract_version:require('../app/difficulty-v122/response-contract.cjs').version},hashes:candidate.versions};
 const frozen={...common,status:'frozen',scope:'source metadata and target/conclusion wire contract only; mathematical criteria preserved',code,artifact_hashes:artifacts,
  corpus_snapshot_hash:C.hash(corpus),corpus_snapshot_files:corpus,corpusReexecuted:false,historical4216Reexecuted:false,
  validation:{localPassed:55,localFailed:0,reusedOfflineIsolationPassed:4,smokePassed:smoke.passed,smokeFailed:0,productionAggregateUnchanged:true},
  smoke:{calls:smoke.calls,results:smoke.stageResults.map(r=>({question_id:r.question_id,stage:r.stage,status:r.status,score:r.score,tier:r.tier,
   assembly_mode:r.computed.assembly_mode,assembly_triggered:r.computed.assembly_triggered,promotions:r.computed.promotions,
   raw_hash:r.raw_hash,validation:r.validation})),phase1_contract_hash:smoke.phase1_contract_hash,phase2_contract_hash:smoke.phase2_contract_hash,
   phase1_original_failure_preserved:true,phase1FinalContractLiveValidated:false,
   contract_transition:'After three Luna responses completed, reference selection contract corrected locally; original failed results retained, three candidates independently evaluated once by Sol medium. No common fictitious hash.'},
  historical_review:{file:rel(path.join(previous,'shingu10-approved-review.json')),projection_source:'user_approved_reviewed_projection',model_generated:false,score:4.8,tier:'T2',originalRawPreserved:true},
  legacy:{file:rel(path.join(previous,'legacy-nonblockers.json')),count:30,modified:false},
  fullRolloutAuthorization:'Not granted. A new target snapshot, maximum calls, and execution approval must be supplied separately.'};
 const rollback={status:'frozen_local_recovery_package',productionApplied:false,productionRollbackRequired:false,automaticRollbackExecuted:false,
  canonicalCommit:'02bc62a15ca2d48d04aee1a9964642ddcfb03a7c',priorCandidate:read(path.join(base,'before.json')).candidate,
  protectedProductionAggregates:before.rows,originalArtifacts:artifacts,
  recovery:'Preserve this RC commit and all ignored staging records. For code comparison use a separate checkout of canonicalCommit. Do not reset another worktree, deploy, activate scores, or overwrite historical responses.'};
 const readiness={...common,validation:frozen.validation,smoke:frozen.smoke,remainingHardBlockers:[],
  limitations:['The latest response-selection contract was validated live on Sol/medium; original Luna structural failures retain their earlier contract hashes. No additional Luna replay was made within the six-call cap.',
   'The 1252 corpus and 4216 historical checks were intentionally not rerun. This is local RC readiness, not production activation or deployment approval.']};
 fs.mkdirSync(out,{recursive:true});
 for(const [name,data]of Object.entries({'release-candidate-frozen.json':frozen,'rollback-package.json':rollback,'full-rollout-readiness.json':readiness})){
  const file=path.join(out,name);if(fs.existsSync(file))throw Error('freeze artifact already exists '+name);fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
 }
 fs.writeFileSync(path.join(out,'full-rollout-request-template.md'),`# 전체 평가 별도 승인 요청서\n\n현재 RC는 동결되었으며 전체 평가 승인은 없습니다.\n\n- RC commit: 승인 시 실제 commit 지정\n- 대상 문항 목록 및 snapshot hash: 승인 시 고정\n- 제외 대상과 기존 성공 결과 재사용 조건: 승인 시 명시\n- 정책: Luna/medium 전체 → 후보만 Sol/medium → 정의된 구조 실패만 Sol/high\n- 단계별 병렬 3, 단계 간 동시 실행 0\n- 최대 총 호출 수: 승인 시 대상 수와 단계별 상한을 명시\n- 자동 재시도 0, 결과 미확인 자동 재호출 금지\n- 이번 스모크: Luna 3회 구조 실패 기록 보존 후 수정 계약으로 Sol/medium 3회. 두 실제 계약 해시를 보존하며 최신 계약의 Luna 추가 호출은 하지 않음\n- 운영 점수 활성화, 운영 데이터 수정, 웹/데스크톱 배포는 별도 승인\n\nRC_READY_FOR_FULL_ROLLOUT=true\napproved_for_full_rollout=false\nrequires_separate_user_approval=true\n`,{flag:'wx'});
 console.log(JSON.stringify({frozen:rel(out),hashes:candidate.versions,flags,calls:smoke.calls}));
}
if(require.main===module)main();module.exports={main};
