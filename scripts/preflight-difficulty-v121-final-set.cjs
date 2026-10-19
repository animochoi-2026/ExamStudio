'use strict';
// Read-only with respect to evaluation inputs/results and production. This joins
// already accepted audit records; it never evaluates a response or invokes AI.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const I=require('../app/difficulty-v12/input.cjs');
const root=path.resolve(__dirname,'../artifacts/difficulty-v121');
const output=path.join(root,'activation-preflight-20261019');
const evidence=new Map();
function digest(file){return crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');}
function read(file,expected){const hash=digest(file);if(expected)assert.equal(hash,expected,`Evidence changed: ${file}`);evidence.set(file,hash);return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}
const saved=read('saved-validation-20261019/audit.json'),source=read('source-review-20261019/audit.json'),three=read('reviewed-three-20261019-1/audit.json'),intent=read('intended-answer-20261019/audit.json');
const targets=read('targets.json').rows,rows=[];
function add(questionId,file,selector,status,score,tier,extra={}){
 const entryFile=`entries/${questionId}.json`,entry=read(entryFile);
 assert.equal(status,'complete',`Final status: ${questionId}`);
 assert(Number.isFinite(score)&&/^T[0-5]$/.test(tier),`Missing score/tier: ${questionId}`);
 const reference={file,sha256:digest(file),selector};
 const evaluationId='sha256:'+I.hash(reference);
 rows.push({questionId,finalEvaluationId:evaluationId,source:{school:entry.source.school,year:entry.source.academicYear,semester:entry.source.semester,exam:entry.source.exam,number:entry.source.originalNumber},
  finalStatus:status,finalScore:score,finalTier:tier,reference,originalEntry:{file:entryFile,sha256:digest(entryFile),revisionId:entry.revisionId,contentHash:entry.input.contentHash,imageHash:I.hash(entry.input.images.map(x=>x.sha256).sort())},...extra});
}
function addRecord(file,record,selector='$',extra={}){
 const r=record||read(file);
 add(r.question_id,file,selector,r.final_status,r.final_score,r.final_tier,{
  recordVersions:Object.fromEntries(['spec_version','spec_revision','model_policy_version','prompt_hash','json_schema_hash','scorer_code_hash','normalizer_version','anchor_set_version','profile_version'].map(k=>[k,r[k]??null])),
  evaluatedRevisionId:r.question_revision_id,evaluatedContentHash:r.question_content_hash,evaluatedImageHash:r.image_asset_hash,
  notForAutomaticImport:r.notForAutomaticImport===true,...extra});
}
for(const x of saved.preserved)addRecord(x.file,read(x.file,x.hash));
for(const x of saved.recovered){assert.equal(x.status,'complete');addRecord('saved-validation-20261019/audit.json',x.record,`recovered[questionId=${x.questionId}].record`);}
for(const x of source.items.filter(x=>x.category==='local_repair')){
 const file='source-review-20261019/'+x.correctionFile,r=read(file);
 assert.equal(r.status,'locally_validated');assert(r.validation.valid&&r.validation.solution_validated);
 const call=read(r.originalResponse.file,r.originalResponse.sha256);
 read(`entries/${x.questionId}.json`,r.originalEntrySha256);
 add(x.questionId,file,'computed+validation','complete',r.computed.score,r.computed.problem_tier,{
  recordVersions:null,originalCallPromptHash:call.promptHash,reviewProfileVersion:r.profileVersion,
  notForAutomaticImport:r.notForAutomaticImport===true,questionEdits:r.questionEdits,
  sourceWarnings:r.review,requiresReviewEnvelope:true});
}
for(const x of three.items.filter(x=>x.status==='complete'))addRecord(`reviewed-three-20261019-1/results/${x.questionId}.json`);
for(const x of intent.local){
 const file=`intended-answer-20261019/recovered/${x.questionId}.json`,r=read(file),call=read(r.originalFile,r.originalSha256);
 assert(r.result.validation.valid&&r.result.validation.solution_validated);
 assert.equal(x.score,r.result.computed.score);assert.equal(x.tier,r.result.computed.problem_tier);
 add(x.questionId,file,'result','complete',x.score,x.tier,{recordVersions:null,originalCallPromptHash:call.promptHash,
  reviewPolicy:r.review.policy,requiresReviewEnvelope:true,sourceWarnings:r.result.sourceWarnings,contextEdits:r.contextEdits});
}
for(const x of intent.evaluated){
 const file=`intended-answer-20261019/results/${x.questionId}.json`,r=read(file);
 const entry=read(`intended-answer-20261019/entries/${x.questionId}.json`);
 assert.equal(r.question_content_hash,entry.input.contentHash);
 if(x.answerReview){
  const af=`intended-answer-20261019/answer-reviews/${x.questionId}.json`,ar=read(af);
  read('intended-answer-20261019/'+ar.file,ar.fileHash);
  assert.equal(ar.result.computed.score,x.score);assert.equal(ar.result.computed.problem_tier,x.tier);
  // The original failed record stays failed. The separately accepted review is
  // the selected result, not a mutation or re-labelling of that historical run.
  add(x.questionId,af,'result',x.status,x.score,x.tier,{recordVersions:null,originalCallPromptHash:r.prompt_hash,
   evaluatedRevisionId:r.question_revision_id,evaluatedContentHash:r.question_content_hash,evaluatedImageHash:r.image_asset_hash,
   requiresReviewEnvelope:true,notForAutomaticImport:r.notForAutomaticImport===true,interpretation:x.interpretation,
   historicalRecord:{file,sha256:digest(file),status:r.final_status,versions:Object.fromEntries(['prompt_hash','normalizer_version','profile_version'].map(k=>[k,r[k]]))}});
 }else{assert.equal(x.score,r.final_score);assert.equal(x.tier,r.final_tier);addRecord(file,r,'$',{interpretation:x.interpretation});}
}
rows.sort((a,b)=>a.questionId.localeCompare(b.questionId));
assert.equal(rows.length,1266);assert.equal(new Set(rows.map(x=>x.questionId)).size,1266);assert.equal(new Set(rows.map(x=>x.finalEvaluationId)).size,1266);
assert.deepEqual(rows.map(x=>x.questionId),targets.map(x=>x.question_id).sort());
for(const r of rows)assert.equal(r.originalEntry.revisionId,targets.find(t=>t.question_id===r.questionId).revision_id);
const counts=values=>values.reduce((out,v)=>(out[String(v)]=(out[String(v)]||0)+1,out),{});
const versions={};for(const key of ['spec_revision','model_policy_version','prompt_hash','json_schema_hash','scorer_code_hash','normalizer_version','profile_version'])versions[key]=counts(rows.map(r=>r.recordVersions?.[key]??'review_envelope_not_materialized'));
const promptCounts=counts(rows.map(r=>r.recordVersions?.prompt_hash||r.originalCallPromptHash));
const changedInput=rows.filter(r=>r.evaluatedContentHash&&r.evaluatedContentHash!==r.originalEntry.contentHash);
const questionEdits=rows.filter(r=>r.questionEdits?.length);
// Snapshot manifests use canonical JSON hashes, unlike byte-hashed audit files.
const snapshot=read('snapshot-manifest.json');for(const s of snapshot.rows)assert.equal(I.hash(read(s.file)),s.hash,`Snapshot changed: ${s.file}`);
// Recheck all hashes at the end to detect concurrent writes during collection.
for(const [file,hash] of evidence)assert.equal(digest(file),hash,`Concurrent change: ${file}`);
const summary={selected:rows.length,failed:0,unresolved:0,missingScoreOrTier:0,duplicateQuestions:0,duplicateFinalIds:0,
 sourcePromptCounts:promptCounts,fullRecordVersionCounts:versions,reviewEnvelopesRequired:rows.filter(r=>r.requiresReviewEnvelope).length,
 changedEvaluationInputs:changedInput.length,locallyEditedQuestions:questionEdits.length,notForAutomaticImport:rows.filter(r=>r.notForAutomaticImport).length,
 tierCounts:counts(rows.map(r=>r.finalTier)),verifiedEvidenceFiles:evidence.size,productionWrites:0,newAiCalls:0,reevaluated:0,
 currentDatabaseContentVerified:false,activationReady:false};
const manifest={format:'difficulty-v121-final-selection-candidate-1',activation_batch_id:crypto.randomUUID(),createdAt:new Date().toISOString(),
 status:'blocked_before_deployment',finalEvaluationIdScheme:'sha256 of immutable artifact reference and JSON selector; local candidate identifiers, not imported database IDs',
 selectedSetHash:I.hash(rows),summary,blockers:[
 'The requested single prompt/normalizer version is not shared by all final records. Historical hashes must not be relabelled.',
 'Fourteen accepted local review results require a production review envelope. Historical failed records must not be silently changed to complete.',
 'Seven intended-answer inputs and three locally corrected questions are not identical to original evaluation inputs. Source hashes and reviewed-input hashes require separate provenance.',
 'The strict current import/activation contract cannot accept this set; desktop deployment and atomic activation have not started.'
 ],rows,evidence:Object.fromEntries(evidence)};
fs.mkdirSync(output,{recursive:true});
const destination=path.join(output,'candidate-manifest.json');
assert(!fs.existsSync(destination),'Preflight manifest already frozen; do not overwrite');
fs.writeFileSync(destination,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
const report=`# v1.2.1 운영 전환 사전 점검\n\n${manifest.createdAt}\n\n이미 채택된 결과만 모아 ${rows.length}문항 후보 집합을 고정했다. AI 호출 0회, 재채점 0회, 운영 쓰기 0회. 후보 식별자는 증거 파일 해시와 JSON 위치로 만든 로컬 ID이며 아직 DB에 등록된 활성 평가 ID가 아니다.\n\n## 전환 차단 사유\n\n- 원래 호출 프롬프트는 2종: 기본 ${promptCounts['90de3a538399cd5fec853e7b8f9c8e60a5b7500f65fb7ca1bf2cc61adc80c601']}건, 출제 의도 7건.\n- 완성형 결과 레코드의 정규화 버전은 ${JSON.stringify(versions.normalizer_version)}. 나머지 ${summary.reviewEnvelopesRequired}건은 승인된 별도 검토 결과를 운영 저장 형식으로 연결해야 한다. 기존 결과의 버전 표기를 변경하지 않았다.\n- 출제 의도 해석 입력 7건은 원래 입력 해시와 다르다. 별도로 로컬 교정한 본문/선지는 3건이다. 운영 원문 변경 없이 동일 해시라고 처리할 수 없다.\n- 요청서 3·10·11절의 동일 버전/입력 조건을 아직 만족하지 않아 데스크톱 배포와 운영 점수 활성화를 시작하지 않았다. 현재 DB 내용/이미지 전체 대조도 이 보고서의 완료 범위가 아니다.\n\n## 로컬 교정 입력\n\n`+questionEdits.map(r=>`- ${r.source.school} ${r.source.year} ${r.source.semester} ${r.source.exam} ${r.source.number}: ${r.questionEdits.map(e=>e.rationale).join(' ')}`).join('\n')+`\n\n## 선택 결과\n\n점수/tier 누락 0건, 문항 중복 0건, 실패 0건, 미확인 0건. 분포: ${JSON.stringify(summary.tierCounts)}. 증거 파일 ${evidence.size}개 해시 확인.\n\n해결안은 기존 결과의 실제 프롬프트·정규화 버전을 보존한 허용 목록과 원문/평가용 입력의 분리 해시를 도입하는 것이다. 이는 단일 해시 일치를 요구하는 현재 전환 조건 변경이므로 자동 적용하지 않았다.\n`;
fs.writeFileSync(path.join(output,'report.md'),report,{flag:'wx'});
console.log(JSON.stringify({path:destination,...summary},null,2));
