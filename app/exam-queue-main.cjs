'use strict';
const crypto=require('node:crypto'),fs=require('node:fs');
const {hash,fileHash,summary,failure}=require('./exam-queue.cjs');
const Batch=require('./batch-queue.js');
const Inventory=require('./source-inventory.cjs');
function installExamQueue({queue,store,workflow,regionDetector,bankAccess,handle,dialog,window,busy}){
 const previousObserver=store.onWrite;store.onWrite=(p,previous)=>{queue.observe(p,previous);previousObserver?.(p,previous);};
 const {Gate}=require('./ai-concurrency.cjs'),sharedStageGate=new Gate(),stepCalls=new Map(),problemCalls=new Set();
 const current=id=>store.get(queue.item(id).projectId);
 const held=message=>{throw Error(message);};
 const reconcileNumbering=(id,problemIds)=>{const item=queue.item(id),project=current(id);for(const p of project.problems.filter(p=>!problemIds||problemIds.includes(p.id))){const next=require('./queue-numbering.cjs').reconcile(p.recognition,item.metadata.numbering,p.queueGroup);if(next)store.updateProblem(project.id,p.id,x=>{x.recognition=next;x.warnings=next.uncertainties.map(u=>u.text);});}};
 handle('examQueueStatus',()=>queue.status());
 handle('examQueueAdd',async files=>{if(!files){const pick=await require("./source-picker.cjs").pickSourceFiles(dialog,window(),queue.directory,{title:'대기열에 시험지 추가',properties:['openFile','multiSelections'],filters:[{name:'시험지',extensions:['pdf','png','jpg','jpeg','webp','bmp']}]});if(!pick)return queue.status();files=pick;}return queue.add(files).snapshot;});
 handle('examQueueEdit',({id,patch})=>queue.edit(id,patch));
 handle('examQueueAction',({action,id,value})=>{
   if(!['removePending','remove'].includes(action))return queue.action(action,id,value);
   if(queue.isRemoved(id))return queue.status();
   const item=queue.assertRemovablePending(id);
   return dialog.showMessageBox(window(),{type:'question',title:'대기열에서 제거',
    message:'이 시험지를 대기열에서 제거할까요?',detail:item.name+'\n\n대기열 등록만 해제합니다. 원본 PDF·저장된 인식과 풀이·이미 업로드된 자료·다른 대기 항목은 유지됩니다.\n진행 중인 인식·업로드는 결과를 저장하며 마무리하고, 이 시험지의 새 단계와 후속 처리는 시작하지 않습니다.',
    buttons:['취소','대기열에서 제거'],defaultId:0,cancelId:0,noLink:true
   }).then(result=>{
    // Recheck identity at mutation; starting during the dialog no longer prevents removal.
    if(result.response!==1)return queue.status();
    return queue.action('removePending',id);
   });
  });
 handle('examQueueRepairMetadata',({id,problemIds,resolvedIssue})=>{
  if(queue.active||busy.size||queue.state.mode==='running')throw Error('일시정지하고 실행 중 단계가 끝난 뒤 저장 메타데이터를 연결하세요.');
  const item=queue.item(id),project=current(id),bank=bankAccess().bank(),results=[];
  if(!Array.isArray(problemIds)||!problemIds.length||problemIds.some(pid=>!project.problems.some(p=>p.id===pid)))throw Error('복구할 고정 문항 ID를 확인하세요.');
  for(const pid of new Set(problemIds)){
   const old=project.problems.find(p=>p.id===pid),r=old.recognition,q=old.original;
   if(!r||r.correctedByUser||item.steps[pid+':upload']?.status==='complete'){results.push({problemId:pid,changed:false,protected:true});continue;}
   const binding=Object.values(bank.state.items).find(i=>i.projectId===project.id&&i.problemId===pid),next=require('./queue-numbering.cjs').reconcile(r,item.metadata.numbering,old.queueGroup);
   const printed=[r.originalRecognizedBody,r.body,q?.body].map(text=>require('./question-text.cjs').splitSourcePoints(text).points).filter(n=>n!==null);
   const score=printed[0],conflict=printed.some(n=>n!==score)||[r.points,q?.originalPoints].some(n=>n!=null&&n!==score);
   const pointsRecovered=printed.length>0&&score>0&&!conflict&&!Object.hasOwn(binding?.overrides||{},'originalPoints')&&(r.points==null||q?.originalPoints==null);
   if(next||pointsRecovered)store.updateProblem(project.id,pid,p=>{if(next){p.recognition=next;p.warnings=next.uncertainties.map(u=>u.text);}if(pointsRecovered){p.recognition.points=score;p.original.originalPoints=score;p.recognition.sourcePointsRecovery={method:'explicit_printed_annotation',points:score,originalText:p.recognition.originalRecognizedBody||p.recognition.body};}});
   const fresh=current(id).problems.find(p=>p.id===pid),solve=item.steps[pid+':solve'];
   if(solve?.status==='failed'&&failure(Error(solve.reason))==='held'){
    solve.sourceRepair={previousStatus:solve.status,previousReason:solve.reason};solve.status='held';
    solve.reason=fresh.recognition.uncertainties.length?'원문 확인 필요: '+fresh.recognition.uncertainties.map(u=>u.text).join(' · '):'정답·풀이 미완료: 저장된 풀이가 없어 추가 AI 없이 후속 처리 보류';
   }
   if(pointsRecovered&&resolvedIssue&&item.discoveryIssues.includes(resolvedIssue)){
    item.discoveryIssues=item.discoveryIssues.filter(x=>x!==resolvedIssue);item.resolvedDiscoveryIssues=[...(item.resolvedDiscoveryIssues||[]),{issue:resolvedIssue,reason:'원본 인쇄 배점과 저장 본문 연결',problemId:pid}];
   }
   results.push({problemId:pid,numberingReconciled:!!next,pointsRecovered,pointsConflict:!!conflict&&printed.length>0,points:pointsRecovered?score:fresh.recognition.points,solutionPresent:!!fresh.original?.answer?.trim()&&!!fresh.original?.solution?.trim(),confirmationRequired:!!fresh.recognition.uncertainties.length});
  }
  queue.save();return {results,snapshot:queue.status()};
 });
 handle('examQueueNext',()=>queue.next());
 handle('examQueuePrepare',({id})=>{const project=queue.ensureProject(id),item=queue.item(id);if(item.scopeConfirmed&&item.scope&&hash(project.scope)!==hash(item.scope))return workflow.saveScope(project.id,item.scope);return workflow.decorate(project);});
 handle('examQueueDiscovery',({id,pages,issue})=>{if(queue.isRemoved(id))return queue.status();const item=queue.item(id);if(issue){item.discoveryIssues=[...new Set([...item.discoveryIssues,String(issue).slice(0,1000)])];item.status='held';if(failure(Error(String(issue)))==='pause'){queue.state.mode='paused';queue.state.reason=String(issue).slice(0,1000);}}else{if(!Number.isInteger(pages)||pages<1||pages>500)throw Error('페이지 수를 확인하세요.');item.pages=pages;}queue.save();return queue.status();});
 handle('examQueueRegions',async({id,page,imageDataUrl,provider})=>{
  if(queue.isRemoved(id))return {stopped:true};
  const item=queue.item(id),project=current(id),basis={file:item.hash,page,model:workflow.getSettings(provider),provider,version:2};
  return queue.stage(id,'page:'+page,'regions',basis,async()=>regionDetector.run({projectId:project.id,sourceId:'primary',page,imageDataUrl,provider,requestId:'regions-'+crypto.randomUUID(),queueContext:project.problems.map(p=>({group:p.queueGroup,pages:p.regions.map(r=>r.page)}))}),result=>Array.isArray(result?.regions));
 });
 handle('examQueueCapture',({id,page,index,region,imageDataUrl,hint})=>{
  if(queue.isRemoved(id))return store.get(queue.state.items.find(i=>i.id===id).projectId);
  const item=queue.item(id),project=current(id);if(queue.state.mode!=='running'||item.status==='cancelled')return project;
  const detectionKey=item.id+':'+page+':'+index;if(project.problems.some(p=>p.queueDetectionKeys?.includes(detectionKey)))return workflow.decorate(project);
  if(project.problems.length>=queue.state.limits.maxQuestions){queue.state.mode='paused';queue.state.reason='시험지별 문항 수 상한에 도달했습니다.';queue.save();throw Error(queue.state.reason);}
  let problemId;
  if(hint?.continuationOf){const matches=project.problems.filter(p=>p.queueGroup===hint.continuationOf);if(matches.length!==1){item.discoveryIssues.push(page+'쪽 이어지는 문항 대상 확인 필요');queue.save();throw Error('다중 페이지 문항 연결 확인 필요');}problemId=matches[0].id;}
  const saved=store.addRegion({projectId:project.id,problemId,region:{...region,page,sourceId:'primary'},imageDataUrl,queueDetection:{key:detectionKey,group:hint?.group,issue:hint?.kind==='uncertain'?'표지·정답지·혼합 시험 또는 불명확한 영역 확인 필요':null}});const p=problemId?saved.problems.find(p=>p.id===problemId):saved.problems.at(-1);
  return workflow.decorate(saved);
 });
 handle('examQueueConfirmRegion',({id,problemId})=>{
  if(queue.active)throw Error('일시정지 후 영역을 확인하세요.');const project=current(id),item=queue.item(id);
  const saved=store.updateProblem(project.id,problemId,p=>{delete p.queueRegionIssue;p.queueRegionConfirmedAt=new Date().toISOString();});
  for(const stage of ['recognition','solve','analysis','upload'])if(item.steps[problemId+':'+stage]){item.steps[problemId+':'+stage].status='pending';item.steps[problemId+':'+stage].retryAuthorized=true;}
  item.status='pending';queue.save();return workflow.decorate(saved);
 });
 const runStep=async({id,problemId,stage,provider='codex',lookupOnly=false})=>{
  if(queue.isRemoved(id))return {stopped:true};
  if([...busy.keys()].some(key=>!String(key).startsWith('exam-queue:')))throw Error('현재 문항 작업이 끝난 뒤 대기열을 실행하세요.');
   reconcileNumbering(id,[problemId]);
   const item=queue.item(id),project=current(id),p=project.problems.find(p=>p.id===problemId);if(!p)throw Error('문항을 찾을 수 없습니다.');
  const key=p.id+':'+stage,q=p.original;let source;try{source={regions:p.regions,crops:p.cropPaths.map(fileHash)};}catch(error){return queue.stage(id,key,stage,{regions:p.regions,crops:p.cropPaths},()=>{throw error;},()=>false);}
  // Validate the original on direct stage calls as well as prepare/resume.
  try{queue.ensureProject(id);}catch(error){return queue.stage(id,key,stage,{file:item.hash,sourceChanged:true},()=>{throw error;},()=>false);}
  let basis,execute,verify;
   if(stage==='recognition'||stage==='solve'){
    if(stage==='solve'&&q?.solutionDraft&&item.steps[key]?.status==='held'&&!item.steps[key].retryAuthorized)return {held:true,status:'held',reason:item.steps[key].reason};
   const request={projectId:project.id,problemId:p.id,task:stage,provider,text:stage==='recognition'?'선택한 영역에서 인쇄된 원문을 인식하세요.':'원문을 보존하고 시험범위 안에서 정답과 상세 풀이를 작성하세요.',...(stage==='solve'?{autoRecover:false,reuseSolution:true,queuePipeline:true}:{})};
   // Scope is deliberately absent from OCR dependencies. Actual compiled rules/model are included.
   let plan;try{plan=workflow.prepare(request);}catch(error){return queue.stage(id,key,stage,{source,scope:item.scope,question:q},()=>held(error.message),()=>false);}
   basis=stage==='recognition'?{source,task:stage,model:plan.selection,provider,dependencies:{...plan.recognitionDependencies,formatVersion:undefined,formatCode:fileHash(require.resolve('./rules.cjs')),formatRules:workflow.rules.snapshot().modules.filter(m=>m.id==='core'||m.id==='task.recognition').map(m=>({id:m.id,version:m.version}))}}:{source,task:stage,model:plan.selection,provider,modules:plan.info.modules,schema:plan.info.schemaVersion,instructions:plan.compiled.instructions,recognitionVersion:p.recognition?.version,question:q?{body:q.body,choices:q.choices,diagram:q.diagram,layoutDocument:q.layoutDocument}:null,scope:item.scope};
   verify=()=>{const fresh=current(id).problems.find(x=>x.id===p.id);return stage==='recognition'?!!fresh?.recognition?.body?.trim()&&!fresh.recognition.sourceStale&&!fresh.recognition.rulesStale:Batch.currentSolution(fresh);};
   execute=async step=>{
    if(p.queueRegionIssue)held(p.queueRegionIssue);
    if(stage==='solve'&&(!item.scopeConfirmed||!item.scope))held('시험범위 미확정: 원문은 보존하고 풀이·추천을 보류합니다.');
    if(stage==='recognition'&&p.recognition?.correctedByUser){if(!await verify())held('수동 교정 원문 보호: 개별 재인식 도구에서 확인하세요.');return {problemId:p.id};}
    if(stage==='solve'){
     const n=Inventory.number(p.recognition?.originalNumber||p.recognition?.sourceQuestionNumber,p.recognition?.sourceNumbering?.section||'unknown');if(!n.key)held('원본 번호 또는 객관식·서술형 구분 확인 필요');
      if(summary(item,project).inventory.duplicates.includes(n.key))held('중복 원본 번호 확인 필요');
     if(p.recognition?.uncertainties?.length)held('원본 확인 필요: '+p.recognition.uncertainties.map(u=>u.text).join(' · '));
     if(/choice/.test(p.recognition?.questionType||q?.questionType||'')&&!q?.choices?.length)held('필수 선택지 누락');
    }
    // Persisted response packets are replayed after a crash; no completed content is removed.
    const requestId=crypto.randomUUID();(step.workflowRequestIds||=[]).push(requestId);queue.save();const result=await workflow.run({...request,requestId});step.result={problemId:p.id,questionId:result.project.problems.find(x=>x.id===p.id)?.original?.id};queue.save();return step.result;
   };
  }else if(stage==='analysis'){
   const analysisModule=require('./bank-analysis.cjs');basis={question:analysisModule.basis(q,p,project.scope),scope:item.scope,scopeComparisonVersion:2,model:workflow.getSettings(provider),provider,criteria:require('./difficulty-assessment.cjs').version};
   verify=()=>{const b=bankAccess().bank(),fresh=current(id),fp=fresh.problems.find(x=>x.id===p.id);if(!fp?.original)return false;const i=b.ensure(fresh,fp,fp.original);return i.metadata.analysis?.status==='complete'&&i.metadata.analysis.basis===analysisModule.basis(fp.original,fp,fresh.scope)&&(require('./desktop-difficulty.cjs').effective({metadata:i.metadata}).number!==null)&&!!(i.metadata.classification.confirmed?.primaryUnit||i.metadata.classification.primaryUnit)&&require('./bank-question-types.cjs').effective({metadata:i.metadata}).length>0;};
   execute=async()=>{if(!item.scopeConfirmed)held('시험범위 미확정: 추천 보류');if(!Batch.currentSolution(p))held('현재 풀이가 미완료이므로 추천 보류');const access=bankAccess(),bank=access.bank();
    // First import the existing combined response. Only missing metadata uses the existing recommendation tool.
    await access.analysis.run(bank,{projectId:project.id,questionIds:[q.id],provider,automatic:true});
    if(!await verify()){if(q.queueClassification)held('통합 응답의 단원·유형·난이도 확인 필요: 추가 AI 호출 없이 보류');const local=bank.ensure(project,p,q);if(local.metadata.analysis?.status==='complete')local.metadata.analysis.status='classification_pending';const result=await access.analysis.run(bank,{projectId:project.id,questionIds:[q.id],provider,automatic:false});if(result.errors.length)throw Object.assign(Error(result.errors[0].message),{code:result.waiting?'quota':'analysis'});}
    return {questionId:q.id};};
  }else if(stage==='upload'){
   const priorCheckpoint=item.steps[key];
   const bank=bankAccess().bank();bank.editSource(project.id,'primary',item.metadata);const bankItem=q&&bank.ensure(project,p,q);basis={q:require('./workflow.cjs').content(q),source,scope:item.scope,metadata:{source:item.metadata,classification:bankItem?.metadata.classification,difficulty:bankItem?.metadata.difficulty}};
   verify=async()=>{const jobs=bank.state.jobs.filter(j=>j.projectId===project.id&&j.questionId===bankItem?.id);const job=jobs.at(-1);if(!job)return false;const checkpoint=item.steps[key],matches=job.queueInputFingerprint?job.queueInputFingerprint===hash(basis):checkpoint?.fingerprint===hash(basis)&&checkpoint?.result?.jobId===job.id;if(job.committed&&job.status==='complete')return matches;
    {const heads=await bank.remoteHeads(job.questionId);if(heads.some(h=>h.revisionId===job.revisionId)){job.committed=true;job.status='complete';bankItem.status='complete';bankItem.baseRevisionId=job.revisionId;bank.save();return matches;}}return false;};
   const processUpload=async job=>{try{return await bank.process(job);}catch(error){job.error=String(error.message);job.status=failure(error)==='pause'?'paused':'failed';bank.save();throw error;}};
   execute=async step=>{if(!Inventory.fields.every(k=>item.metadata[k]))held('학교·학년·연도·학기·시험 종류 필수정보 미확정: 업로드 보류');
    if(!Batch.currentSolution(p)||!item.scopeConfirmed)held('풀이·시험범위 확인 필요: 업로드 보류');if(!item.steps[p.id+':analysis']||item.steps[p.id+':analysis'].status!=='complete')held('단원·유형·난이도 단계 확인 필요');
     const inventory=summary(item,project).inventory,n=Inventory.number(p.recognition?.originalNumber||p.recognition?.sourceQuestionNumber,p.recognition?.sourceNumbering?.section||'unknown');if(!n.key||inventory.duplicates.includes(n.key)||inventory.unexpected.includes(n.key))held('누락 또는 중복 원본 번호 확인 필요');
    // Recovery can reset job status to queued; query its commit before enqueue.
     if(await verify())return step.result||{jobId:bank.state.jobs.filter(j=>j.projectId===project.id&&j.questionId===bankItem.id).at(-1).id,questionId:q.id};
     const previousJob=bank.state.jobs.find(j=>j.id===priorCheckpoint?.result?.jobId);
     if(previousJob?.queueManaged&&previousJob.queueInputFingerprint===hash(basis)&&!previousJob.committed&&!previousJob.conflictBlocked&&['failed','queued','preparing','paused','uploading'].includes(previousJob.status)){
      if(bank.running)held('다른 업로드가 진행 중입니다. 완료 후 개별 재시도하세요.');
      const path=require('node:path'),input=JSON.parse(fs.readFileSync(path.join(bank.dir,'outbox',previousJob.id,'local-input.json'),'utf8')),frozen=input.project.problems.find(x=>x.id===p.id)?.original;
      const artifact=value=>Object.fromEntries(['body','statementBox','bodyBorder','choices','answer','solution','originalPoints','questionType','diagram','observedDiagram','layoutDocument','layoutMode','choiceLayout','diagramMode','diagramPosition','figurePlacements','hiddenFigureIds','grading'].map(k=>[k,value?.[k]]));
      if(hash(artifact(frozen))!==hash(artifact(q)))held('기존 등록 산출물과 현재 수동 수정이 다릅니다. 기존 등록 도구에서 수정본을 확인하세요.');
      step.result={jobId:previousJob.id,revisionId:previousJob.revisionId,questionId:q.id};queue.save();queue.ensureProject(id);await processUpload(previousJob);return step.result;
     }
    bank.editSource(project.id,'primary',item.metadata);const targets=await bank.targets(project.id,[q.id]);if(targets.some(t=>t.required))held('서버 기존 문항 후보가 애매합니다. 기존 등록 도구에서 대상을 확인하세요.');
    const priorJobs=new Set(bank.state.jobs.map(j=>j.id));queue.ensureProject(id);await bank.enqueue(project.id,[q.id]);const job=bank.state.jobs.filter(j=>j.projectId===project.id&&j.questionId===bankItem.id).at(-1);if(!job)held('업로드 작업 기록 누락');if(priorJobs.has(job.id)&&(job.queueInputFingerprint?job.queueInputFingerprint!==hash(basis):step.result?.jobId!==job.id))held('기존 등록 입력과 현재 정보가 다릅니다. 등록 보류: 기존 등록 도구에서 출처·수정본을 확인하세요.');job.queueManaged=true;job.queueInputFingerprint=hash(basis);step.result={jobId:job.id,revisionId:job.revisionId,questionId:q.id};bank.save();queue.save();
    if(!await verify()){if(bank.running)held('다른 업로드가 진행 중입니다. 완료 후 개별 재시도하세요.');queue.ensureProject(id);await processUpload(job);}
    return step.result;};
  }else throw Error('대기열 처리 단계를 확인하세요.');
  if(lookupOnly){
   if(stage!=='upload')throw Error('결과 조회는 업로드 단계만 지원합니다.');
   const checkpoint=item.steps[key];
   if(!checkpoint||checkpoint.fingerprint!==hash({...basis,artifactWriterVersion:2}))return {held:true,reason:'업로드 입력이 바뀌어 기존 결과와 비교가 필요합니다.',retryable:false};
   try{
    if(await verify()){checkpoint.status='complete';checkpoint.reason=null;checkpoint.finishedAt=new Date().toISOString();queue.save();return {result:checkpoint.result,reused:true};}
    return {held:true,status:checkpoint.status,reason:checkpoint.reason,retryable:true};
   }catch(error){checkpoint.status='unknown';checkpoint.reason='기존 결과 조회 실패: '+error.message;queue.save();return {held:true,status:'unknown',reason:checkpoint.reason,retryable:false};}
  }
  return queue.stage(id,key,stage,stage==='upload'?{...basis,artifactWriterVersion:2}:basis,execute,verify);
 };
 handle('examQueueStep',request=>{
  if(queue.isRemoved(request.id))return {stopped:true};
  const problem=request.id+':'+request.problemId,key=problem+':'+request.stage,fingerprint=hash(request),prior=stepCalls.get(key);
  if(prior){if(prior.fingerprint!==fingerprint)throw Error('진행 중 요청의 입력이 다릅니다.');return prior.promise;}
  if(problemCalls.has(problem))throw Error('같은 문항의 이전 단계가 끝난 뒤 실행하세요.');
  problemCalls.add(problem);queue.reservations.set(key,{item:queue.item(request.id),key:request.problemId+':'+request.stage});busy.set('exam-queue:'+key,true);
  const execute=()=>runStep(request);const work=['analysis','upload'].includes(request.stage)?sharedStageGate.run(execute):Promise.resolve().then(execute);
  const promise=work.finally(()=>{stepCalls.delete(key);problemCalls.delete(problem);queue.reservations.delete(key);busy.delete('exam-queue:'+key);queue.save();});
  stepCalls.set(key,{fingerprint,promise});return promise;
 });
 handle('examQueueRetryUpload',async({id,problemId})=>{
  if(queue.active||busy.size||!['paused','idle'].includes(queue.state.mode))throw Error('일시정지 후 해당 업로드만 재개하세요.');
  const item=queue.item(id),step=item.steps[problemId+':upload'];
  if(!step||step.kind!=='upload'||!['unknown','failed','held'].includes(step.status))throw Error('미완료 업로드 단계를 확인하세요.');
  try{
   queue.action('resume');
   // Query an existing commit before authorizing any retransmission.
   const lookup=await runStep({id,problemId,stage:'upload',lookupOnly:true});
   if(!lookup.held||!lookup.retryable||queue.state.mode!=='running')return lookup;
   if((step.uploadRecoveryRetries||0)>=Math.min(1,queue.state.limits.maxRetries))throw Error('개별 업로드 재개 상한에 도달했습니다. 기존 결과를 확인하세요.');
   step.uploadRecoveryRetries=(step.uploadRecoveryRetries||0)+1;step.retryAuthorized=true;queue.save();
   return await runStep({id,problemId,stage:'upload'});
  }finally{queue.action('pause');}
 });
 handle('examQueueFinish',({id})=>{if(queue.isRemoved(id))return queue.status();queue.finish(id);const item=queue.item(id);if(item.status!=='cancelled'&&summary(item,current(id)).whole)return queue.move(id);return queue.status();});
 handle('examQueueMove',({id})=>queue.move(id));
}
module.exports={installExamQueue};
