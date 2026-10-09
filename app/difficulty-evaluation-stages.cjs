'use strict';
// Local execution preparation. No login, API key, quota-setting or production
// writer lives here. The caller must supply the existing ChatGPT Codex bridge.
const D=require('./difficulty-assessment.cjs'),R=require('./difficulty-reassessment.cjs'),Cache=require('./assessment-cache.cjs');
const running=new Set(),schema={type:'object',additionalProperties:false,required:['assessment'],properties:{assessment:D.schema}};
function prepare(plan,{baseline,model=null,effort=null}={}){
 if(!baseline?.version||!baseline.instructions||baseline.version===D.version)throw Error('확인한 현행 기준 버전과 원문 프롬프트가 필요합니다.');
 if(plan.targetVersion!==D.version)throw Error('기존 문항 계획의 기준 버전이 현재 코드와 다릅니다.');
 const comparisons=D.referenceExamples.examples.flatMap((example,i)=>[
  {key:`example-${i+1}-current`,label:example.label,userTarget:example.userTarget,criteriaVersion:baseline.version,instructions:baseline.instructions},
  {key:`example-${i+1}-new`,label:example.label,userTarget:example.userTarget,criteriaVersion:D.version,instructions:D.instructionsForScope(D.referenceExamples.scope)}
 ].map(row=>({...row,status:'pending',text:JSON.stringify({question:{body:example.body,choices:example.choices,printedRelations:example.printedRelations,solution:example.verifiedReasoning},scope:D.referenceExamples.scope,criteriaVersion:row.criteriaVersion})})));
 const existing=plan.rows.filter(r=>r.status==='needs_ai_reassessment').map(row=>({key:row.idempotencyKey,status:'pending',row:{...row,request:{...row.request,model,effort}}}));
 const jobId=Cache.hash({planId:plan.planId,model,effort,comparisons:comparisons.map(({key,instructions,text})=>({key,instructions,text}))});
 return {format:'examstudio-difficulty-staged-v1',jobId,planId:plan.planId,criteriaVersion:D.version,model,effort,provider:'codex',billingRoute:'existing ChatGPT-login Codex bridge; no API-key fallback',version:0,aiCalls:0,maximumCalls:comparisons.length+existing.length,automaticRetries:0,approvalRequired:true,comparisonReviewRequired:true,comparisons,existing,productionWrites:0};
}
async function runStage(job,{stage,authorization,comparisonReview,bridge,readCurrentItem,checkpoint}={}){
 if(job.executionBlocked||[...(job.comparisons||[]),...(job.existing||[])].some(x=>['failed','in_progress','blocked'].includes(x.status)))throw Error('A failed, interrupted or blocked job requires review before further execution.');
 if(!['comparisons','existing'].includes(stage))throw Error('평가 단계를 확인하세요.');
 if(!job.model||!job.effort)throw Error('실행 모델과 추론 수준을 먼저 확인하세요.');
 if(!authorization?.granted||authorization.jobId!==job.jobId||authorization.model!==job.model||authorization.effort!==job.effort||!authorization.stages?.includes(stage)||authorization.maxCalls<job.maximumCalls)throw Error('현재 모델·계획·호출 상한에 대한 실행 승인이 필요합니다.');
 if(job.criteriaVersion!==D.version)throw Error('준비 이후 기준이 바뀌었습니다.');
 if(stage==='existing'&&(job.comparisons.some(x=>x.status!=='complete')||comparisonReview?.jobId!==job.jobId||comparisonReview?.criteriaVersion!==D.version||comparisonReview?.reviewed!==true))throw Error('먼저 두 예시의 현행/신규 4개 결과를 완료하고 기준 검토를 확인하세요.');
 if(typeof checkpoint!=='function'||!bridge?.run||stage==='existing'&&typeof readCurrentItem!=='function')throw Error('영속 실행 기록과 현재 문항 확인 경로가 필요합니다.');
 if(running.has(job.jobId))throw Error('이 계획의 평가가 이미 실행 중입니다.');running.add(job.jobId);
 const state=structuredClone(job),save=async()=>{const expectedVersion=state.version;state.version++;await checkpoint(structuredClone(state),{expectedVersion});};
 try{
  for(const entry of state[stage]){
   if(entry.status!=='pending')continue;let request,item;
   try{
    if(stage==='comparisons')request={model:state.model,effort:state.effort,context:{id:entry.key},images:[],purpose:'difficulty_comparison',execution:{task:'difficulty_comparison',schema,instructions:entry.instructions},text:entry.text};
    else{item=await readCurrentItem(entry.row.questionId);if(Object.keys(R.protectedFields(item.catalog)).length){entry.status='teacher_protected';await save();continue;}request={...R.requestFor(item,entry.row),context:{id:entry.key},images:[]};}
   }catch(e){entry.status='blocked';entry.error=e.message;await save();break;}
   if(state.aiCalls>=state.maximumCalls||state.aiCalls>=authorization.maxCalls)throw Error('승인된 평가 호출 상한에 도달했습니다.');
   // Persist an attempt before calling the provider. Interrupted/failed attempts
   // are never retried automatically, including after a process restart.
   entry.status='in_progress';state.aiCalls++;await save();
   try{
    const response=await bridge.run(request);entry.usage={tokens:response.tokens||null,model:response.model||null,effort:response.effort||null};
    if(entry.usage.model!==state.model||entry.usage.effort!==state.effort)throw Error('Provider returned a different model or effort.');
    const raw=response.result?.assessment,normalized=D.normalize(raw);if(!['estimated','deferred'].includes(normalized.status)||normalized.contradictions?.length)throw Error('평가 응답의 점수·구간·근거를 검증하지 못했습니다.');
    const at=new Date().toISOString();
    if(stage==='comparisons')entry.result={assessment:{...normalized,criteriaVersion:entry.criteriaVersion},model:state.model,effort:state.effort,provider:'codex',at};
    else{const latest=await readCurrentItem(entry.row.questionId),recorded=R.recordResult(latest,entry.row,raw,{provider:'codex',model:state.model,effort:state.effort,at,activate:false});entry.result=recorded.record||recorded.catalog.metadata.difficulty.rubricAssessments[entry.key];}
    entry.status='complete';await save();
   }catch(e){entry.status='failed';entry.error=e.message;await save();break;}
  }
  return state;
 }finally{running.delete(job.jobId);}
}
module.exports={prepare,runStage};
