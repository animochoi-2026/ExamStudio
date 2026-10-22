'use strict';
// Frozen-file binding only: no evaluator/scorer, transport or AI module imported.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const S=process.argv[2],D=process.argv[3],sha=x=>crypto.createHash('sha256').update(x).digest('hex'),read=f=>JSON.parse(fs.readFileSync(f)),hashFile=f=>sha(fs.readFileSync(f));
const pins={candidate:'9d854707e80f0f459b4baa5f3dc44daea1be015ca9ae3ec8af2869b294566e88',common:'32150b5cb2399497f597fc9546d1ce72509bb194ddd80b3ff3af0962b8bad452',rc:'1b45f5ec96ee6609ba811f90f265ed519cebee71'};
assert.equal(hashFile(S+'/candidate-manifest.json'),pins.candidate);
const manifest=read(S+'/candidate-manifest.json');
assert.equal(manifest.source_commit,pins.rc);assert.equal(manifest.common_evaluation_manifest_hash,pins.common);
for(const [f,h] of Object.entries(manifest.files))assert.equal(hashFile(S+'/'+f),h,f);
const index=read(S+'/index.json'),audit=read(S+'/distribution-audit.json').rows,fp=read(S+'/evidence/current-fingerprints-after.json').rows;
assert.equal(index.length,1266);assert.equal(new Set(index.map(x=>x.question_id)).size,1266);
const backup=fs.readdirSync(D+'/rollback').filter(x=>/^catalog-\d+\.json$/.test(x)).flatMap(x=>read(D+'/rollback/'+x));
assert.equal(backup.length,1266);
const rows=[],issues=[];
for(const i of index){
 const r=read(S+'/'+i.record),a=audit.find(x=>x.question_id===i.question_id),b=backup.find(x=>x.question_id===i.question_id),f=fp.find(x=>x.question_id===i.question_id);
 assert(b&&f&&a);assert.equal(b.revision_id,i.revision_id);assert.equal(b.content_hash,f.content_hash);assert.equal(b.files_hash,f.files_hash);assert.equal(b.review_version,f.review_version);
 assert.equal(r.score,i.score);assert.equal(r.tier,i.tier);assert.equal(a.score,i.score);assert.equal(a.tier,i.tier);
 let stored=r;
 if(r.selected?.record_path){assert.equal(hashFile(r.selected.record_path),r.selected.record_sha256);stored=read(r.selected.record_path);}
 const computed=stored.computed||stored.envelope?.computed;
 if(!computed){issues.push({id:i.question_id,reason:'computed_missing',keys:Object.keys(stored)});continue;}
 assert.equal(computed.score,i.score,'stored score '+i.question_id);
 assert.equal(computed.problem_tier||computed.final_tier,i.tier);
 assert.deepEqual(computed.promotions,a.promotions);
 const result={spec_revision:'1.2.3',question_id:i.question_id,question_revision_id:i.revision_id,final_status:'complete',final_score:i.score,final_tier:i.tier,final_stage:a.stage,final_model:a.model,
 final_reasoning_effort:a.stage===3?'high':'medium',computed,request_id:stored.request_id||r.selected?.request_id,
 input_identity:r.input_identity,original_provenance:r.selected||{request_id:r.request_id,stage:r.stage,source_versions:r.source_versions,code_commit:r.code_commit},
 candidate_record:i.record,candidate_record_sha256:manifest.files[i.record],candidate_manifest_hash:pins.candidate,common_evaluation_manifest_hash:pins.common,code_rc_commit:pins.rc,
 source_content_hash:f.content_hash,source_files_hash:f.files_hash,source_scope_hash:f.scope_hash,source_reviews_hash:f.reviews_hash,source_manifest_hash:f.source_hash};
 rows.push({question_id:i.question_id,revision_id:i.revision_id,review_version:b.review_version,expected_metadata:b.metadata,expected_confirmed:b.confirmed,result});
}
assert.equal(issues.length,0,JSON.stringify(issues));
fs.writeFileSync(D+'/activation-input.json',JSON.stringify({pins,rows}),{flag:'wx'});
fs.writeFileSync(D+'/frozen-validation.json',JSON.stringify({pins,verified_files:Object.keys(manifest.files).length,count:rows.length,score_recalculations:0,ai_calls:0,issues}),{flag:'wx'});
console.log(JSON.stringify({count:rows.length,verified_files:Object.keys(manifest.files).length,issues}));

