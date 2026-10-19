'use strict';
// Materialize already accepted results. No validator/scorer or AI invocation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),I=require('../difficulty-v12/input.cjs');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function prepare(root){
 const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8')),hash=f=>digest(fs.readFileSync(path.join(root,f)));
 const candidateFile='activation-preflight-20261019/candidate-manifest.json',m=read(candidateFile);
 assert.equal(m.rows.length,1266);assert.equal(I.hash(m.rows),m.selectedSetHash);
 for(const [f,h]of Object.entries(m.evidence))assert.equal(hash(f),h,`Changed evidence: ${f}`);
 const saved=read('saved-validation-20261019/audit.json');
 const items=m.rows.map(row=>{
  const id=row.questionId,entry=read(row.originalEntry.file),snapshot=read(`snapshot/${id}.json`),artifact=read(row.reference.file);
  let record,review=null,historical=null,reviewedHash=entry.input.contentHash;
  if(row.reference.file==='saved-validation-20261019/audit.json')record=structuredClone(saved.recovered.find(x=>x.questionId===id).record);
  else if(!row.requiresReviewEnvelope)record=structuredClone(artifact);
  else{
   const isSource=row.reference.file.startsWith('source-review-'),isAnswer=row.reference.file.includes('/answer-reviews/');
   historical=read(isAnswer?row.historicalRecord.file:fs.existsSync(path.join(root,`results/${id}.json`))?`results/${id}.json`:`failures/${id}.json`);
   const stage=isSource?artifact.originalStage:artifact.stage;
   const computed=isSource?artifact.computed:artifact.result.computed;
   const validation=isSource?artifact.validation:artifact.result.validation;
   assert(validation.valid&&validation.solution_validated);
   const callFile=isSource?artifact.originalResponse.file:isAnswer?'intended-answer-20261019/'+artifact.file:artifact.originalFile;
   const call=read(callFile),raw=isSource?artifact.reviewedResponse:artifact.result.raw||call.raw;
   const versionSource=historical.profile_version?historical:read(saved.preserved.find(x=>x.profileVersion===historical.profileVersion).file);
   const versions=Object.fromEntries(['spec_version','spec_revision','model_policy_version','json_schema_hash','scorer_code_hash','normalizer_version','anchor_set_version','profile_version'].map(k=>[k,versionSource[k]]));
   record={...versions,question_id:id,question_revision_id:entry.revisionId,question_content_hash:entry.input.contentHash,
    image_asset_hash:row.originalEntry.imageHash,prompt_hash:call.promptHash,final_stage:stage,final_model:call.settings.model,
    final_reasoning_effort:call.settings.effort,final_status:'complete',final_score:computed.score,final_tier:computed.problem_tier,computed,
    failure_reason:null,curriculum_scope:entry.input.payload.curriculum_scope};
   for(let n=1;n<=3;n++)for(const suffix of ['model','reasoning_effort','raw_json','calculated_tier','calculated_score','validation_result','failure_reason'])record[`stage${n}_${suffix}`]=null;
   Object.assign(record,{[`stage${stage}_model`]:call.settings.model,[`stage${stage}_reasoning_effort`]:call.settings.effort,
    [`stage${stage}_raw_json`]:raw,[`stage${stage}_calculated_score`]:computed.score,[`stage${stage}_calculated_tier`]:computed.problem_tier,
    [`stage${stage}_validation_result`]:validation});
   if(isSource&&artifact.questionEdits.length){const payload={...entry.input.payload,question:artifact.correctedQuestion};reviewedHash=I.hash({payload,images:entry.input.images.map(x=>x.sha256)});}
   review={version:'production-review-envelope-1',authorization:'user-approved-exception-preservation-20261019',
    reference:row.reference,validation_normalizer_version:'v121-normalizer-7',approved_result:artifact,
    original_call:{file:callFile,sha256:hash(callFile),record:call},historical_runner_record:historical,
    historical_runner_status:historical.final_status||historical.status,source_soundness_certified:false};
  }
  if(row.interpretation){const e=read(`intended-answer-20261019/entries/${id}.json`);reviewedHash=e.input.contentHash;}
  assert.equal(record.final_status,'complete');assert.equal(record.final_score,row.finalScore);assert.equal(record.final_tier,row.finalTier);
  assert.equal(record.question_revision_id,entry.revisionId);
  // Never replace the historical question_content_hash. Bind source and reviewed
  // input separately; the activation record is a new immutable result envelope.
  Object.assign(record,{evaluation_id:row.finalEvaluationId,activation_batch_id:m.activation_batch_id,
   source_content_hash:I.hash(snapshot.catalog.content),source_image_asset_hash:I.hash(snapshot.catalog.files),
   source_hash_method:'sha256(canonical JSON catalog.content/catalog.files)',original_evaluation_input_hash:entry.input.contentHash,
   reviewed_evaluation_input_hash:reviewedHash,production_review_envelope:review,
   final_selection_provenance:{reference:row.reference,source:row.source,interpretation:row.interpretation||null,
    sourceWarnings:row.sourceWarnings||null,originalEntry:row.originalEntry,source_soundness_certified:false},result_structure_version:'difficulty-production-result-1'});
  if(historical)record.historical_result_hash=I.hash(historical);
  return {questionId:id,revisionId:entry.revisionId,reviewVersion:snapshot.revision.review_version,
   snapshot:snapshot.catalog,result:record,sourceSnapshotHash:I.hash(snapshot.catalog)};
 });
 assert.equal(new Set(items.map(x=>x.questionId)).size,1266);
 const count=fn=>items.reduce((a,x)=>(a[fn(x)]=(a[fn(x)]||0)+1,a),{});
 assert.equal(items.filter(x=>x.result.production_review_envelope).length,14);
 const prompts=count(x=>x.result.prompt_hash);assert.equal(Object.keys(prompts).length,2);assert.deepEqual(prompts,m.summary.sourcePromptCounts);
 const {versions}=require('./desktop-policy.cjs');
 const policy={version:'approved-preserved-evaluation-set-1',authorization:'user-approved-exception-preservation-20261019',
  candidateManifestHash:hash(candidateFile),selectedSetHash:m.selectedSetHash,expected:1266,desktopVersions:versions,
  allowedPrompts:Object.keys(prompts),allowedNormalizers:[...new Set(items.map(x=>x.result.normalizer_version))],
  schemaHash:versions.json_schema_hash,scorerCodeHash:versions.scorer_code_hash,reviewCount:14,
  selectedResults:items.map(x=>({questionId:x.questionId,evaluationId:x.result.evaluation_id,resultHash:I.hash(x.result)}))};
 return {batchId:m.activation_batch_id,policy,items,summary:{count:items.length,prompts,normalizers:count(x=>x.result.normalizer_version),reviewCount:14,newAiCalls:0}};
}
module.exports={prepare};
