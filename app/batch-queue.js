(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExamBatchQueue=api;})(globalThis,function(){
 // Each successful request is persisted by the existing workflow before the next starts.
 async function run(items, execute, {signal={},onProgress=()=>{}}={}) {
  const results=[];
  for(const [index,item] of items.entries()) {
   if(signal.cancelled)break;
   onProgress({index,total:items.length,item,results});
   try {results.push({item,status:'completed',value:await execute(item,index)});}
   catch(error){results.push({item,status:signal.cancelled?'cancelled':'failed',error});}
  }
  return {results,remaining:items.slice(results.length),cancelled:!!signal.cancelled};
 }
 function pendingRecognition(p){return !!(p.regions?.length&&(!p.recognition||!p.recognition.body?.trim()||p.recognition.sourceStale||p.recognition.rulesStale)&&!p.recognition?.correctedByUser);}
 function sourceCurrent(p){return !!p.recognition&&!p.recognition.sourceStale&&!p.recognition.rulesStale;}
 function currentSolution(p,q=p.original){
  if(!sourceCurrent(p)||!q?.answer?.trim()||!q.solution?.trim()||q.solutionDraft||q.solutionStale)return false;
  const version=q.reviewBaseline?.sourceVersion||q.provenance?.sourceVersion||q.sourceVersion;
  if(version&&version!==p.recognition.version&&!p.recognition.equivalentVersions?.includes(version))return false;
  // A manual approval still pending is different from invalidated content.
  if(q.reviewReasons?.length)return false;
  return q.approval?.status==='approved'||!(q.checks?.ai?.status==='failed'||q.checks?.separateReview?.status==='failed'||q.checks?.scope?.status==='incompatible'||q.checks?.program?.errors?.length);
 }
 async function pipeline(ids,execute,{signal={},onProgress=()=>{},through='generation'}={}){
  const results=[],blocked=new Map();
  for(const task of ['recognition','review','solve','generation'].slice(0,through==='solve'?3:4)){
   const stage=await run(ids,async(id,index)=>{if(blocked.has(id))return {skipReason:blocked.get(id)};return execute(task,id,index);},{signal,onProgress:p=>onProgress({...p,task})});
   for(const r of stage.results){
    if(r.status==='failed'&&['recognition','review'].includes(task))blocked.set(r.item,task==='recognition'?'원문 인식 실패로 다음 단계를 실행하지 않았습니다.':'원문 확인 실패로 다음 단계를 실행하지 않았습니다.');
    results.push(r.value?.skipReason?{...r,task,status:'skipped',reason:r.value.skipReason}:{...r,task});
   }
   if(signal.cancelled)break;
  }
  return {results,cancelled:!!signal.cancelled};
 }
 function stages(problems=[]){
  const total=problems.length;
  const ready=sourceCurrent;
  const counts={regions:problems.filter(p=>p.regions?.length).length,recognition:problems.filter(ready).length,review:problems.filter(p=>ready(p)&&p.recognition.confirmed&&!p.recognition.uncertainties?.length).length,solve:problems.filter(p=>currentSolution(p)).length,generation:problems.filter(p=>p.variants?.some(q=>q.body&&currentSolution(p,q))).length};
  const held=problems.filter(p=>p.original?.solutionDraft||p.original?.solutionStale||p.original?.reviewReasons?.length||(p.original?.solution&&!currentSolution(p))).length;
  const exportable=problems.filter(p=>currentSolution(p)&&p.original?.include&&p.original?.approval?.status==='approved'&&!p.original?.needsReview).length;
  const complete=Object.fromEntries(Object.entries(counts).map(([k,n])=>[k,total>0&&n===total]));
  return {total,counts,complete,held,exportable,current:Object.keys(complete).find(k=>!complete[k])||null};
 }
 // Automatic continuation is not an explicit request for a new variant.
 function automaticPlan(p,mode='automatic'){
  const recognized=!!p.recognition&&!pendingRecognition(p);
  const solved=currentSolution(p);
  return {recognition:!recognized,review:!solved,solve:!solved,generation:false};
 }
 return {run,pipeline,pendingRecognition,stages,automaticPlan,currentSolution};
});
