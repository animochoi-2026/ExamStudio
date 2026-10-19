'use strict';
// This command cannot dispatch AI or write production data. Writes only a new
// local overlay; never moves/replaces successes, original calls, or approvals.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const I=require('../app/difficulty-v12/input.cjs'),P=require('../app/difficulty-v121/profile.cjs'),Policy=require('../app/difficulty-v121/policy.cjs'),A=require('../app/difficulty-v121/answer.cjs');
const Saved=require('../app/difficulty-v121/saved-revalidation.cjs');
const root=path.resolve(process.argv[2]||'artifacts/difficulty-v121'),preview=process.argv.includes('--preview');
const round='retry-20261019-1',read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const digest=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const manifest=read(round+'/manifest.json'),approval=read(round+'/approval.json');
const reviewFile='answer-equivalence-review-20261019.json';
const answerReviews=fs.existsSync(path.join(root,reviewFile))?read(reviewFile).reviews:[];
const differenceFile='answer-difference-review-20261019.json';
const differenceReviews=fs.existsSync(path.join(root,differenceFile))?read(differenceFile).rows:[];
if(I.hash(manifest)!==approval.manifestHash||manifest.promptHash!==P.promptHash||manifest.schemaHash!==P.schemaHash)throw Error('frozen_manifest_or_prompt_changed');
if(!preview&&(fs.existsSync(path.join(root,'runner.lock'))||fs.existsSync(path.join(root,round,'runner.lock'))))throw Error('wait_for_inflight_responses_before_final_revalidation');
const protectedFiles={...manifest.protectedFiles};
for(const [f,h] of Object.entries(protectedFiles))if(digest(f)!==h)throw Error('original_evidence_changed:'+f);
const protect=f=>{protectedFiles[f]=digest(f);return read(f);};
if(answerReviews.length)protect(reviewFile);
if(differenceReviews.length)protect(differenceFile);
const preserved=[],recovered=[],remaining=[];
for(const t of read('targets.json').rows){
 const f='results/'+t.question_id+'.json';if(!fs.existsSync(path.join(root,f)))continue;
 const r=protect(f);if(r.final_status==='complete')preserved.push({questionId:t.question_id,file:f,hash:protectedFiles[f],profileVersion:r.profile_version});
}
if(preserved.length!==manifest.firstPass.completed)throw Error('success_count_changed');
for(const t of manifest.rows){
 const rf=round+'/results/'+t.questionId+'.json';
 if(fs.existsSync(path.join(root,rf))){const r=protect(rf);if(r.final_status==='complete'){preserved.push({questionId:t.questionId,file:rf,hash:protectedFiles[rf],profileVersion:r.profile_version});continue;}}
 const ef='entries/'+t.questionId+'.json';if(digest(ef)!==t.entryHash)throw Error('input_changed:'+t.questionId);
 const entry=protect(ef),byStage=t.stages.map(s=>{
  const files=[s.file,round+'/calls/'+s.key+'/result.json'].filter(f=>f&&fs.existsSync(path.join(root,f)));
  return files.map(file=>{const result=protect(file);if(result.inputVersion!==entry.input.inputVersion||result.key!==s.key||result.promptHash!==P.promptHash||result.executionProfile!==Policy.stages[s.stage-1].id)throw Error('saved_response_identity_mismatch:'+file);return {file,hash:protectedFiles[file],result};});
 });
 const out=Saved.review(entry,byStage,answerReviews),base={questionId:t.questionId,revisionId:t.revisionId,source:entry.source,storedAnswer:entry.validationContext.storedAnswer,...out};
 if(out.status==='complete')recovered.push({...base,record:{...out.record,evaluation_run_id:'saved-validation-20261019',profile_version:P.version,input_identity:P.inputIdentity(entry),validation_repair:{method:'saved_responses_only',originalProfile:manifest.profileVersion,provenance:out.provenance},completed_at:new Date().toISOString()}});
 else{
  const last=out.observations.at(-1),raw=last?.raw;
  const comparison=raw?A.verify(raw.derived_answer,entry.validationContext.storedAnswer,{answerType:raw.answer_type,choices:entry.validationContext.choices}):null;
  const sourceWarnings=out.observations.filter(o=>o.raw.assessment_uncertainty?.some(x=>['source_ambiguity','scope_ambiguity'].includes(x)));
  const differenceReview=differenceReviews.find(r=>r.questionId===t.questionId&&r.revisionId===t.revisionId&&r.inputVersion===entry.input.inputVersion&&r.kind==='different_answer'&&out.observations.some(o=>o.file===r.file&&I.hash(o.raw)===r.rawHash));
  const category=differenceReview?'different_answer':sourceWarnings.length||['reference_student_mismatch','curriculum_scope_mismatch'].includes(out.reason)?'source_or_scope_review':comparison?.reason==='answer_mismatch'?'different_answer':out.status==='unresolved'?'no_confirmed_response':'validation_review';
  remaining.push({...base,category,comparison,differenceReview,derivedAnswer:raw?.derived_answer||null,solutionSummary:raw?.solution_summary||null,modelReason:raw?.short_reason||null,sourceWarnings:sourceWarnings.map(o=>({file:o.file,flags:o.raw.assessment_uncertainty,summary:o.raw.solution_summary,reason:o.raw.short_reason})),restrictions:entry.input.payload.solution_restrictions});
 }
}
const categories=Object.fromEntries(['different_answer','source_or_scope_review','validation_review','no_confirmed_response'].map(k=>[k,remaining.filter(r=>r.category===k).length]));
const reviewedRecovered=recovered.filter(r=>[1,2,3].some(n=>r.record['stage'+n+'_validation_result']?.reason==='reviewed_answer_equivalence')).length;
const summary={at:new Date().toISOString(),modelCalls:0,productionWrites:0,profileVersion:P.version,preservedSuccesses:preserved.length,recovered:recovered.length,automaticFormatRecoveries:recovered.length-reviewedRecovered,reviewedEquivalenceRecoveries:reviewedRecovered,totalSuccesses:preserved.length+recovered.length,remaining:remaining.length,categories,reasons:remaining.reduce((a,r)=>(a[r.reason]=(a[r.reason]||0)+1,a),{}),total:1266};
if(summary.totalSuccesses+summary.remaining!==summary.total)throw Error('reconciliation_count_mismatch');
if(preview){console.log(JSON.stringify({...summary,remainingItems:remaining.map(({questionId,source,reason,category,storedAnswer,derivedAnswer})=>({questionId,school:source.school,number:source.originalNumber,reason,category,storedAnswer,derivedAnswer}))},null,2));process.exit(0);}
for(const f of ['run-status.json','progress.jsonl','started.json','manifest.json','approval.json'])protectedFiles[round+'/'+f]=digest(round+'/'+f);
for(const [f,h]of Object.entries(protectedFiles))if(digest(f)!==h)throw Error('source_changed_during_revalidation:'+f);
const dest=path.join(root,'saved-validation-20261019');fs.mkdirSync(dest);
const write=(f,v)=>fs.writeFileSync(path.join(dest,f),typeof v==='string'?v:JSON.stringify(v,null,2),{flag:'wx'});
fs.mkdirSync(path.join(dest,'results'));
for(const r of recovered)write('results/'+r.questionId+'.json',r.record);
write('summary.json',summary);write('audit.json',{summary,protectedFiles,preserved,recovered,remaining,answerReviews,differenceReviews});
for(const category of Object.keys(categories))write(category+'.json',remaining.filter(r=>r.category===category));
const esc=s=>String(s??'').replace(/\|/g,'\\|').replace(/\r?\n/g,' ');
const lines=['# 저장 응답 재검증 결과','',`기존 성공 ${preserved.length}문항 보존, 추가 복구 ${recovered.length}문항, 통합 성공 ${summary.totalSuccesses}문항, 확인 필요 ${remaining.length}문항. AI 신규 호출 0회, 운영 쓰기 0회.`,'','원래 성공·응답·입력 파일은 해시로 보존했다. 아래의 원문 문제는 모델이 보고한 경고를 포함하며, 원본 자체의 오류로 모두 확정한 뜻은 아니다. 값·선지 불일치도 어느 답이 옳은지 별도 원문 확인이 필요하다.'];
const titles={different_answer:'저장 답과 다른 값 또는 선택지',source_or_scope_review:'원문·입력·허용 풀이 확인 필요',validation_review:'동치·풀이·평가 구조 추가 확인 필요',no_confirmed_response:'저장된 확정 응답 부족'};
for(const category of Object.keys(categories)){
 lines.push('',`## ${titles[category]} (${categories[category]}문항)`,'','| 학교·시험·문항 | 저장 답 | 응답 | 사유 |','|---|---|---|---|');
 for(const r of remaining.filter(r=>r.category===category)){const s=r.source;lines.push(`| ${esc([s.school,s.academicYear,s.semester,s.exam,s.originalNumber].join(' '))} | ${esc(r.storedAnswer)} | ${esc(r.derivedAnswer)} | ${esc(r.reason)} |`);}
 for(const r of remaining.filter(r=>r.category===category)){lines.push('',`### ${r.source.school} ${r.source.academicYear} ${r.source.exam} ${r.source.originalNumber}`,'',`문항 ID: ${r.questionId}`,``,r.differenceReview?.note||'',``,r.modelReason||'확정 응답 없음',``,r.solutionSummary||'',``,...r.sourceWarnings.map(w=>`원문 경고: ${w.flags.join(', ')} — ${w.summary}`),...r.observations.filter(o=>o.validation.detail).map(o=>`검증 오류 원문 (${o.stage}단계): ${o.validation.reason}: ${o.validation.detail}`),...(r.savedResponseFailures||[]).map(e=>`호출 오류 원문 (${e.stage}단계): ${e.reason} — ${e.errors.map(x=>[x.code,x.message].filter(Boolean).join(': ')).join('; ')} [${e.file}]`));}
}
write('report.md',lines.join('\n')+'\n');console.log(JSON.stringify(summary,null,2));
