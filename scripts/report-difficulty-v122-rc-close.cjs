'use strict';
// Evidence only. A failed smoke is never converted to readiness or a freeze.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/difficulty-v122-rc1/rc-close-20261020');
const C=require('../app/difficulty-v122/canonical.cjs'),P=require('../app/difficulty-v122/policy.cjs');
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>C.bytesHash(fs.readFileSync(f)),save=(n,x)=>fs.writeFileSync(path.join(out,n),JSON.stringify(x,null,2)+'\n');
const pre=read(path.join(out,'minimal-preflight.json')),smoke=read(path.join(out,'smoke/report.json')),plan=read(path.join(out,'smoke/approved-plan.json'));
assert(smoke.failed>0,'This report handles failed smoke only; successful freeze requires its separate verified workflow.');
assert.deepEqual(read(path.join(out,'production-before.json')).rows,read(path.join(out,'production-after.json')).rows);
for(const [f,h]of Object.entries(plan.lockedFiles))assert.equal(sha(path.join(root,f)),h,'smoke bundle changed');
assert.equal(sha(path.join(root,'artifacts/difficulty-v122-rc1/batch-preflight-20261020/final/stop-report.json')),plan.prior_incident_sha256);
const preserved=read(path.join(root,'artifacts/difficulty-v122-rc1/batch-preflight-20261020/start.json')).protectedFiles;
const saved=read(path.join(root,'artifacts/difficulty-v122-rc1/offline-preflight-20261020/final/saved/report.json')).snapshotFiles;
for(const [f,h]of Object.entries(preserved))assert.equal(sha(path.join(root,f)),h,f);
for(const [f,h]of Object.entries(saved))assert.equal(sha(f),h,f);
assert(!fs.existsSync(path.join(out,'smoke/batch/runner.lock')),'runner still owns lease');
const stageDir=path.join(out,'smoke/batch/calls'),stages=fs.readdirSync(stageDir).map(f=>read(path.join(stageDir,f)));
const diagnostics=stages.map(s=>{
 const raw=s.call.raw,missing=s.call.raw.viable_routes.flatMap(r=>{
  const ids=new Set(r.critical_discoveries.map(d=>d.id));
  return r.targets.flatMap(t=>t.conclusion_ids.filter(id=>!ids.has(id)).map(id=>({target:t.target_statement_id,missing_conclusion_id:id})));
 });
 return {question_id:s.identity.question_id,stage:s.stage,validation:s.envelope.validation,
  expected_source_manifest:s.identity.source_manifest_hash,returned_source_manifest:raw.source_manifest_hash,
  missing_conclusions:missing,score:s.envelope.score,tier:s.envelope.final_tier,raw_sha256:s.envelope.raw_response_hash};
});
save('smoke-diagnostics.json',diagnostics);
const codeHashes=Object.fromEntries(Object.keys(plan.lockedFiles).map(f=>[f,sha(path.join(root,f))]));
const hashes={status:'candidate_not_finally_frozen',computed_at:new Date().toISOString(),versions:{
 spec_revision:P.spec_revision,projection_version:P.projection_version,source_id_contract_version:P.source_id_contract_version,
 model_policy_version:P.model_policy_version,batch_policy_version:require('../app/difficulty-v122/phase-batch.cjs').version},
 criteria:read(path.join(root,'app/difficulty-v122/candidate-versions.json')).versions,files:codeHashes,
 tests:Object.fromEntries(['offline-guard','difficulty-v122-offline-isolation.test','difficulty-v122-phase-batch.test','difficulty-v122-shingu10-approved.test',
 'difficulty-v122-entrypoints.test','difficulty-v122-edge-runtime.test','difficulty-v122-edge-entrypoint.test'].map(f=>['tests/'+f+'.cjs',sha(path.join(root,'tests',f+'.cjs'))])),
 smoke:{snapshot:plan.snapshot_hash,report:sha(path.join(out,'smoke/report.json')),raw:diagnostics.map(x=>({question_id:x.question_id,sha256:x.raw_sha256}))}};
save('rc-candidate-hashes.json',hashes);
const blockers=diagnostics.filter(d=>!d.validation.valid).map(d=>({question_id:d.question_id,error:d.validation.detail,stage:1,
 reason:'Mandatory actual smoke failed. No automatic tuning or additional calls after failure.',repaired:false}));
save('full-rollout-readiness.json',{status:'blocked_by_smoke',RC_READY_FOR_FULL_ROLLOUT:false,approved_for_full_rollout:false,
 requires_separate_user_approval:true,releaseCandidateFrozen:false,blockers,productionWrites:0,deployments:0,fullCorpusAICalls:0,
 computerUse:0,batchConcurrency:3,crossStageConcurrency:0,smokeCalls:smoke.calls});
save('rollback-package.json',{status:'prepared_not_frozen',productionApplied:false,productionRollbackRequired:false,automaticRollbackExecuted:false,
 canonicalCommit:'02bc62a15ca2d48d04aee1a9964642ddcfb03a7c',localChangeDisposition:'Preserved uncommitted in isolated RC worktree; no reset, push, merge or deployment.',
 priorCandidateManifest:{file:'prior-candidate-versions.json',sha256:sha(path.join(out,'prior-candidate-versions.json'))},
 originalReviewResult:{file:read(path.join(out,'shingu10-approved-review.json')).parent_result_file,sha256:read(path.join(out,'shingu10-approved-review.json')).parent_result_hash},
 retainedIncident:{file:'../batch-preflight-20261020/final/stop-report.json',sha256:plan.prior_incident_sha256}});
fs.writeFileSync(path.join(out,'full-rollout-request-template.md'),
 '# 전체 평가 요청서 초안 — 실행 불가\n\n현재 RC_READY_FOR_FULL_ROLLOUT=false입니다. 실제 스모크의 source hash·결론 ID 오류가 해결되고 별도 승인된 스모크가 통과하기 전에는 사용할 수 없습니다.\n\n추후 별도로 대상 snapshot·모델·최대 호출 수·재시도 정책·실행 시점을 승인해야 합니다. 기본 정책은 전체 Luna → 후보 Sol/medium → 구조 실패 후보 Sol/high, 단계별 병렬 3, 단계 간 동시 실행 0, 자동 재시도 0입니다. 운영 활성화와 배포는 별도 승인 대상입니다.\n');
const report={at:new Date().toISOString(),status:'RC_BLOCKED_BY_ACTUAL_SMOKE',preflight:{currentTests:pre.currentTests,proofGates:{passed:pre.passed,failed:pre.failed}},
 smoke,diagnostics,blockers,RC_READY_FOR_FULL_ROLLOUT:false,approved_for_full_rollout:false,finalFreeze:false,commitCreated:false,
 workingTreeClean:false,productionChanges:0,deployments:0,fullCorpusAICalls:0,otherSchoolAICalls:0,computerUse:0,
 priorIncident:'Earlier synthetic-test incident retained: confirmed minimum 3 calls, total unknown; excluded from this separately approved smoke count.'};
save('report-final.json',report);
const review=read(path.join(out,'shingu10-approved-review.json'));
const body=`# RC 마감 결과: 실제 스모크 실패로 최종 동결 보류

1. **변경 파일**: \`app/difficulty-v122/{adapters,ledger,checkpoint,phase-batch}.cjs\`, candidate-versions.json, Edge engine.mjs; \`tests/offline-guard.cjs\`, offline-isolation·phase-batch·shingu10-approved 테스트; \`scripts/test-offline.cjs\`, prepare-shingu10-approved-rc·check-difficulty-v122-rc-close·smoke-difficulty-v122-rc·report-difficulty-v122-rc-close.cjs. 기존 RC 작업은 보존했다.
2. **Legacy**: 신구중 10번 외 23건, 신동중 5·7·8·14·16·18·서답형 1의 7건은 \`preserved_not_migrated\`, release_blocker=false로 별도 기록했다. 과거 실패 로그를 통과로 덮어쓰지 않았다. [목록](legacy-nonblockers.json)
3. **신구중 10번**: 원문 위치·revision·이미지·basis·부모 결과에 결합한 사용자 승인 projection. model_generated=false. 비자동 M2 1개, E=3, promotion 없음, **4.8/T2**. 부모 결과 해시 \`${review.parent_result_hash}\`. [산출물](shingu10-approved-review.json)
4. **Allowlist**: 로컬 sharp addon/이미지 읽기, 현재 Node 버전 확인, 제한된 읽기 전용 Git만 허용했다. 외부 통신·임의 child process·worker·Git 쓰기는 차단했다. Node permission 모드는 fsync까지 금지하므로 실제 atomic 저장 검증에는 선행 preload 차단기를 사용한다. 모든 subprocess를 허용한 것이 아니다. Windows native-addon 경로는 native realpath로 검증한다.
5. **Runner**: 전체 단계 barrier, 각 단계 최대 3, 단계 후보 manifest 고정, 영구 intent, fsync+원자적 rename, 실행 lease, 중복 키/미확인 호출 재실행 금지, 성공 결과 재사용, 명세 해시 불일치 거부를 구현했다.
6. **재사용 증거**: 입력·source·cache·Schema·prompt·scorer·validator 불변 해시 확인. corpus 1,252, cache 1,252/파일 2,519, Schema 1,253과 기존 기준 회귀·통과 acceptance 증거를 재사용했다. [근거](minimal-preflight.json)
7. **새 검증**: phase/checkpoint 18 + 격리 4 + 승인 projection 5 + 실제 진입점 12 = **39/39**. 최소 증거 gate **17/17**. Criteria coverage 83/83(기존 79개 재사용, 승인 projection 3개 새 증거, 과거 execution 1개 원래 scorer 보존 증거). 기존 4,216개 묶음은 재실행하지 않았다.
8. **Corpus 재실행**: 하지 않았다. 입력 adapter의 fromConfirmed와 source builder는 동일하다.
9. **Barrier·병렬**: mock에서 각 단계 최대 동시 3과 단계 간 동시 0 확인. 실제 Luna는 3건 동시 실행했다. 실제 Sol barrier는 스모크 중단으로 실행되지 않았다.
10. **재개·중복·미확인·stale**: 완료 snapshot 재개 추가 호출 0, 중복 intent 차단, timeout/unknown 승급 없음, revision 변경 stale_input, checkpoint rename 실패 시 완료 금지를 검증했다.
11. **Luna 실제 결과**:
    - 신동중 11번: 실패/null. \`source manifest hash mismatch\`. 입력 해시 끝부분 \`0935aaae69d179\` 대신 모델이 \`0936df2a64ca0\`를 출력했다.
    - 신동중 13번: 실패/null. \`missing/excluded target prerequisite\`. 결론 참조 \`conclusion_choice1..5\`가 실제 발견 ID \`d1_choice1..d5_choice5\`에 존재하지 않는다.
    - 신동중 9번: Luna 구조 검증 성공, **6.9/T3**. 최종 Sol 결과는 아니다.
12. **Stage 2**: 정책상 위 구조 실패 2건과 T3 1건은 후보이나, 스모크 실패 중단 규칙이 우선되어 후보 manifest 확정 및 Sol 실행을 하지 않았다.
13. **호출**: 이번 승인 스모크 Luna **3**, Sol/medium **0**, Sol/high **0**, 재시도 **0**, 합계 **3**. 과거 별도 오호출 사건은 최소 3회·총량 미확인 기록 그대로 보존한다.
14. **버전·해시**: difficulty-v1.2.2-rc1 / m2-required-projection-r2 / difficulty-source-id-r1 / luna-medium-sol-medium-structural-high-r3 / phase-barrier-concurrency3-r1. [현재 후보 해시](rc-candidate-hashes.json). 스모크 중 코드 해시 불변을 확인했다. **최종 frozen manifest는 만들지 않았다.**
15. **Rollback/readiness**: [rollback-package.json](rollback-package.json), [full-rollout-readiness.json](full-rollout-readiness.json), [실행 불가 요청서 초안](full-rollout-request-template.md). 운영 적용 이력이 없어 운영 rollback은 수행하지 않았다.
16. **Git**: 조건부 commit 요건(스모크 통과)을 충족하지 못해 commit/push/merge를 하지 않았다. 변경은 격리 worktree에 보존, working tree는 clean이 아니다.
17. **RC_READY_FOR_FULL_ROLLOUT=false**
18. **approved_for_full_rollout=false**
19. **운영 영향**: 운영 변경 0, 배포 0, 전체 corpus AI 재평가 0, 다른 학교 호출 0, Computer Use/브라우저 자동화 0. catalog 1,629·activation 결과 1,266·batch 1개 전후 전체 행 해시 동일. [전](production-before.json) / [후](production-after.json)
20. **남은 blocker**: 실제 스모크의 source hash 오류(11번), 존재하지 않는 결론 ID 참조(13번). 현재 결과를 자동 보정하거나 난이도 규칙을 바꾸지 않았다. 추가 AI 호출·다른 문항 대체·자동 반복 실행은 하지 않았다. [진단](smoke-diagnostics.json)
`;
fs.writeFileSync(path.join(out,'report-final.md'),body);
console.log(JSON.stringify({report:path.join(out,'report-final.md'),preflight:report.preflight,calls:smoke.calls,RC_READY_FOR_FULL_ROLLOUT:false,approved_for_full_rollout:false,productionChanges:0}));
