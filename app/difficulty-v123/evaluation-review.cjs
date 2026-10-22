'use strict';
// Difficulty-only approval is independent of teacher/problem/answer review.
// This adapter never writes catalog data or accepts historical ratings.
const C=require('../difficulty-v122/canonical.cjs'),S=require('../difficulty-v122/source.cjs');
const version='difficulty-evaluation-review-envelope-r1';
const roles=['printed_problem','printed_diagram','stored_solution_candidate','existing_approved_interpretation','teacher_annotation_excluded','handwritten_answer_excluded','grading_rubric_not_student_hint','problem_warning'];
function resolve({question,scope,images,question_id,revision_id,catalog,review_envelope:e}){
 const check=(v,k)=>{if(!v)throw Error('difficulty_review_mismatch:'+k);};
 check(e?.version===version&&e.difficulty_review_status==='approved_for_difficulty_evaluation_only','authorization');
 const {envelope_hash,...rest}=e;check(C.hash(rest)===envelope_hash,'envelope_hash');
 const identity={question_id,revision_id,content_hash:C.hash(question),image_hash:C.hash(images.map(i=>i.sha256)),source_content_hash:C.hash(catalog.content),source_files_hash:C.hash(catalog.files),scope_hash:C.hash(scope),review_status_hash:C.hash(catalog.metadata.reviews)};
 for(const[k,v]of Object.entries(identity))check(e.identity[k]===v,k);
 check(e.basis_hash===C.hash(e.basis),'basis_hash');
 check(e.approved_route_manifest_hash===C.hash(e.routes),'routes_hash');
 check(e.source_role_manifest_hash===C.hash(e.source_roles),'roles_hash');
 check(e.warning_manifest_hash===C.hash(e.warnings),'warnings_hash');
 check(e.difficulty_basis_source?.source_type==='stored_problem_and_reviewed_solution_for_difficulty_only','basis_source');
 check(e.source_roles.every(r=>roles.includes(r.role)&&r.provenance),'source_roles');
 check(e.approval_provenance?.request_sha256?.match(/^[a-f0-9]{64}$/),'approval_provenance');
 const labels=S.targetSources(question).map(t=>t.label);
 for(const route of e.routes){check(route.reviewed_spans?.length,'reviewed_spans');for(const span of route.reviewed_spans){check(span.allowed_roles.length===1&&S.roles.includes(span.allowed_roles[0]),'single_role');check(span.allowed_target_labels.every(l=>labels.includes(l)),'target');check(route.solution_excerpt.slice(span.start,span.end)===span.text,'basis_span');}}
 for(const im of images)check(C.bytesHash(Buffer.from(im.dataUrl.split(',')[1],'base64'))===im.sha256,'image_bytes');
 return {question_id,revision_id,question:structuredClone(question),scope:structuredClone(scope),images:structuredClone(images),difficulty_basis:e.basis,difficulty_basis_hash:C.hash({basis_hash:e.basis_hash,envelope_hash}),difficulty_basis_source:'approved_review_envelope',approved_routes:structuredClone(e.routes),source_warning:e.warnings.map(w=>w.text),approved_interpretation:e.interpretation||'',source_provenance:{version,review_envelope_hash:envelope_hash,identity,difficulty_basis_source:structuredClone(e.difficulty_basis_source),approval_provenance:e.approval_provenance,original_review_statuses:structuredClone(catalog.metadata.reviews)}};
}
module.exports={version,resolve};
