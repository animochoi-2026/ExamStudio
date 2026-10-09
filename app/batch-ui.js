import './batch-queue.js';
export function installBatchUI({api,state,$,element,button,guarded,openDialog,toast,renderAll,selectProblem,workflowUI,currentAiSettings,ready,sourceReady,visibleErrors,errorText,showSourceReview}) {
 const {run,pipeline,pendingRecognition,automaticPlan}=globalThis.ExamBatchQueue;
 const labels={recognition:'전체 인식',generation:'유사문제 일괄생성',solve:'전체 풀이 생성',automatic:'모두 자동'};
 let review=null;
 const bar=element('nav','batch-toolbar stage-bar');bar.id='batchToolbar';bar.setAttribute('aria-label','시험지 작업 단계');
 bar.append($('detectRegions'));
 const regionButton=button('문제영역 설정','button compact outline',()=>{if(blocked())return;review=null;$('collectRegions').checked=true;$('cancelSelection').dispatchEvent(new CustomEvent('reset-mode'));$('viewer').focus();renderAll();});regionButton.id='batch-regions';
 const reviewButton=button('전체 검수','button compact outline',()=>showReviewChoice());reviewButton.id='batch-review';
 const stageButtons={regions:regionButton,review:reviewButton};
 for(const task of ['recognition','solve','generation']){const b=button(labels[task],'button compact outline',guarded(()=>showBatch(task)));b.id='batch-'+task;stageButtons[task]=b;}
 for(const [index,task] of ['regions','recognition','review','solve'].entries()){if(index)bar.append(element('span','stage-arrow','→'));const b=stageButtons[task];b.dataset.stage=task;b.dataset.label=b.textContent;bar.append(b);}
 const progress=element('span','editor-hint');progress.id='batchProgress';progress.setAttribute('aria-live','polite');
 const automaticButton=button('모두 자동','button compact primary',guarded(()=>showBatch('automatic')));automaticButton.id='batch-automatic';bar.append(automaticButton);const generationButton=stageButtons.generation;generationButton.dataset.stage='generation';generationButton.dataset.label=generationButton.textContent;bar.append(generationButton);
 const bankSlot=element('div','bank-upload-slot');bankSlot.id='bankUploadSlot';
 const stop=button('일괄 중지','button compact quiet',guarded(cancel));stop.id='batchStop';bar.append(progress,stop,bankSlot);
 document.querySelector('.document-bar').before(bar);
 document.dispatchEvent(new Event('bank-toolbar-ready'));
 const progressDialog=element('dialog','modal batch-progress-modal');progressDialog.id='batchProgressDialog';progressDialog.setAttribute('aria-label','전체 작업 진행');progressDialog.addEventListener('cancel',e=>e.preventDefault());
 const progressBody=element('div','modal-body');const progressTitle=element('h2');progressTitle.id='batchProgressTitle';const progressDetail=element('p');progressDetail.id='batchProgressDetail';progressDetail.setAttribute('aria-live','polite');const progressMeter=element('progress');progressMeter.max=1;
 const progressStop=button('전체 중지','button primary',guarded(cancel));progressStop.id='batchProgressStop';progressBody.append(progressTitle,progressDetail,progressMeter,element('p','editor-hint','완료된 결과는 바로 저장됩니다. 중지하면 다음 문제는 시작하지 않습니다.'),progressStop);progressDialog.append(progressBody);document.body.append(progressDialog);
 const nav=element('div','batch-review-toolbar');nav.id='batchReviewNav';nav.hidden=true;$('workContent').before(nav);
 function candidates(task){return (state.project?.problems||[]).filter(p=>(task==='automatic')?!!p.regions?.length:task==='recognition'?pendingRecognition(p):task==='solve'?p.recognition&&p.original&&!globalThis.ExamBatchQueue.currentSolution(p):!!p.recognition&&!!p.original);}
 function blocked(){return !!(state.busy||state.batch||state.loading||state.saving||state.savingAi||state.documentBusy);}
 function refresh(){
  if(state.batch){progressTitle.textContent=state.batch.label;progressDetail.textContent=`전체 ${state.batch.total}문제 중 ${state.batch.index+1}번째 · 문제 ${state.batch.problemNumber||state.batch.index+1}번${state.batch.cancelled?' · 중지 중':''}`;progressMeter.max=state.batch.total;progressMeter.value=state.batch.index;progressStop.disabled=!!state.batch.cancelled;}
  const stages=globalThis.ExamBatchQueue.stages(state.project?.problems||[]);
  const current=state.batch?.task||(review?'review':stages.current);
  for(const [key,b] of Object.entries(stageButtons)){b.classList.toggle('stage-complete',stages.complete[key]);b.classList.toggle('stage-current',!!state.project&&key===current);if(state.project&&key===current)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');b.textContent=`${stages.complete[key]?'✓ ':''}${b.dataset.label}${stages.total?' '+stages.counts[key]+'/'+stages.total:''}`;b.title=key==='generation'?'자동 실행에서 정상 완료된 문항은 문서에 포함됩니다. 개별 생성은 검토 후 포함하세요.':key==='review'?'사용자 확인 또는 자동 실행 승인에 따라 검토가 완료된 수입니다.':`${stages.counts[key]}/${stages.total} 완료`;}
  regionButton.disabled=blocked()||!state.sourceSize;
  for(const task of Object.keys(labels))$('batch-'+task).disabled=blocked()||!candidates(task).length;
  reviewButton.disabled=blocked()||!(state.project?.problems||[]).some(p=>p.original);
  $('collectRegions').disabled=blocked();stop.hidden=!state.batch;stop.disabled=!!state.batch?.cancelled;
  progress.textContent=state.batch?`${state.batch.label} ${state.batch.index+1}/${state.batch.total}${state.batch.cancelled?' · 중지 중':''}`:(state.batchSummary|| (stages.total?`풀이 ${stages.counts.solve} · 보류/재검토 ${stages.held} · 원문 출력 가능 ${stages.exportable}`:''));
  if(review?.projectId!==state.project?.id)review=null;
  nav.hidden=!review;if(!review)return;
  const currentEntry=review.entries[review.index];
  review.entries=review.entries.filter(e=>{const p=state.project.problems.find(p=>p.id===e.problemId);return p&&(p.original?.id===e.questionId||p.variants?.some(q=>q.id===e.questionId));});
  if(!review.entries.length){review=null;nav.hidden=true;return;}
  const currentIndex=review.entries.indexOf(currentEntry);review.index=currentIndex>=0?currentIndex:Math.min(review.index,review.entries.length-1);
  // Keep the review cursor consistent even when the user selects another tab.
  const entry=review.entries[review.index],p=state.project.problems.find(p=>p.id===entry?.problemId);
  if(!p){review=null;nav.hidden=true;return;}
  nav.replaceChildren();
  const prev=button('이전','button compact outline',()=>move(-1));prev.id='batchReviewPrevious';prev.disabled=blocked()||review.index===0;
  const next=button('다음 · 보류','button compact outline',()=>move(1));next.id='batchReviewNext';next.disabled=blocked()||review.index===review.entries.length-1;
  const confirm=button(review.kind==='original'&&(!p.original.solution||p.original.solutionStale||p.original.solutionDraft)?'원문 확인 · 다음':'검토 완료 · 다음','button compact primary',guarded(confirmNext));confirm.id='batchReviewConfirm';confirm.disabled=blocked()||!!state.editor||state.selectedId!==p.id||state.view!==(review.kind==='original'?'original':'variants');
  const close=button('검토 닫기','button compact quiet',()=>{review=null;refresh();});close.disabled=blocked();
  nav.append(element('span','',`${review.kind==='original'?'원문':'유사문제'} 검토 ${review.index+1}/${review.entries.length}`),prev,confirm,next,close);
 }
 async function showBatch(task){
  if(blocked())return;
  const projectId=state.project.id,list=candidates(task),root=openDialog(labels[task],'전체 또는 원하는 문제 번호를 선택하세요');
  if((task==='automatic'))for(const p of list){const plan=automaticPlan(p,task),steps=Object.keys(plan).filter(k=>plan[k]&&k!=='review').map(k=>labels[k]);root.append(element('p','automatic-plan',`문제 ${state.project.problems.indexOf(p)+1}: ${steps.length?steps.join(' → '):'완료 · 모든 단계 건너뜀'}`));}
  root.append(element('p','',(task==='automatic')?'인식 → 원문 정답·상세 풀이 → 검토 완료·문서 포함 → Word 자동 저장까지 진행합니다. 출제자의 의도를 반영해 오독만 최소 교정하며 완료된 풀이를 다시 생성하지 않습니다. 유사문제는 오른쪽 일괄생성 버튼으로 따로 만듭니다. 생성된 풀이의 검수 경고는 보존한 채 출력에 포함하며 나중에 개별 제외할 수 있습니다. 응답 실패나 풀이를 완성하지 못한 문항은 사유를 남기고 나머지를 계속합니다. Word 파일은 결과물 폴더에 날짜와 중복 방지 번호를 붙여 저장합니다.':task==='recognition'?'아직 인식하지 않았거나 영역이 바뀐 문제를 모아 처리합니다. 확인·교정한 원문은 자동으로 덮어쓰지 않습니다.':task==='solve'?'풀이가 없는 원문을 함께 처리합니다. 확인 필요 항목을 남겨둔 원문도 출제 의도에 따라 자동 검토·풀이를 작성하고, 주의점은 코멘트에 남깁니다. 사용자 승인으로 처리하지 않습니다.':'선택한 원문마다 지정한 유사문제와 상세 풀이를 만들고, 검토 완료·문서 포함 후 Word를 자동 저장합니다. 검수 경고가 있는 완성 문항도 포함하며 문제는 나중에 체크 해제하거나 삭제할 수 있습니다. 기본은 원문마다 동일 난이도 1개이며 추가 요청을 우선 적용합니다.'));
  const all=element('input');all.type='checkbox';all.checked=true;all.id='batchSelectAll';const allLabel=element('label','batch-choice');allLabel.append(all,document.createTextNode('전체 선택'));root.append(allLabel);
  const variantChoices=new Map();
  const checks=list.map(p=>{
   // Only the problem text labels the checkbox. A native select must not share
   // that label's activation area, and long formulas must not cover the select.
   const line=element('div','batch-choice batch-problem-row'),label=element('label','batch-problem-label'),c=element('input');
   const number=state.project.problems.indexOf(p)+1;
   c.type='checkbox';c.checked=true;c.value=p.id;c.className='batch-problem-choice';
   label.append(c,element('span','batch-problem-text',`문제 ${number} · ${p.original?.body?.slice(0,70)||`${p.regions[0]?.page||1}페이지 · 인식 대기`}`));
   line.append(label);root.append(line);
   if(task==='generation'){
    const v=element('select');v.className='batch-variant-choice';v.setAttribute('aria-label',`문제 ${number} 변형 방식`);
    for(const [value,title] of [['numeric_only','수치만 변경'],['mirror_numeric','수치 변경 · 좌우 반전'],['harder','난이도 한 단계 높이기']]){const o=element('option','',title);o.value=value;v.append(o);}
    line.append(v);variantChoices.set(p.id,v);
   }
   return c;
  });
  let preview;
  if(task==='recognition'||(task==='automatic')){preview=element('div','batch-crop-previews');preview.setAttribute('aria-label','인식할 실제 원본 이미지');root.append(element('p','','아래 실제 문제 이미지를 확인한 뒤 최종 확인을 누르세요. 체크한 번호만 인식합니다.'),preview);}
  all.addEventListener('change',()=>checks.forEach(c=>c.checked=all.checked));
  checks.forEach(c=>c.addEventListener('change',()=>{all.checked=checks.every(c=>c.checked);all.indeterminate=!all.checked&&checks.some(c=>c.checked);}));
  let variant,extra,consent;
  if(task==='generation'){
   extra=element('textarea');extra.id='batchInstructions';extra.rows=3;extra.placeholder='추가 요청 (선택): 예) 각 원문마다 수치 변경 2개와 좌우 반전 1개 만들어줘';root.append(extra);
   consent=element('input');consent.type='checkbox';consent.checked=true;consent.id='batchAllowUnverified';const label=element('label','batch-choice');label.append(consent,document.createTextNode('확인 필요·오류가 있는 원문도 현재 내용으로 생성 (오류 기록 보존)'));root.append(label);
  }
  const note=element('p','review-notice');note.hidden=true;root.append(note);
  const start=button((task==='automatic')?'안내 확인 · '+labels[task]:task==='recognition'?'최종 확인 · 전체 인식':'선택한 문제 실행','button primary',guarded(async()=>{
   if(blocked()||state.project?.id!==projectId)return;
   const ids=checks.filter(c=>c.checked).map(c=>c.value);if(!ids.length){note.hidden=false;note.textContent='문제를 하나 이상 선택하세요.';return;}
   if(task==='generation'&&!consent.checked){const unsafe=list.filter(p=>ids.includes(p.id)&&(!sourceReady(p.recognition)||visibleErrors().some(e=>e.problemId===p.id&&!/요청 \d+문항, 반환 \d+문항: 수량 불일치/.test(e.text||''))));if(unsafe.length){note.hidden=false;note.textContent=`문제 ${unsafe.map(p=>state.project.problems.indexOf(p)+1).join(', ')}번을 먼저 확인하거나, 위의 확인 필요 원문도 생성 옵션을 선택하세요.`;return;}}
   const options={variant:'numeric_only',variants:Object.fromEntries([...variantChoices].map(([id,v])=>[id,v.value])),extra:extra?.value.trim(),allowUnverifiedGeneration:!!consent?.checked,automatic:task==='generation'};$('mainDialog').close();if((task==='automatic'))await executeAutomatic(ids,task);else await executeBatch(task,ids,options);
  }));start.id='batchStart';root.append(start);
  if(preview){
   start.disabled=true;
   try{for(const [i,p] of list.entries()){
    if(!p.cropPaths?.length)throw Error('선택 영역 이미지가 없습니다. 영역을 다시 지정하세요.');
    const group=element('section','batch-crop-card');group.append(element('strong','',`문제 ${state.project.problems.indexOf(p)+1}`));preview.append(group);
    const sync=()=>{group.hidden=!checks[i].checked;};checks[i].addEventListener('change',sync);all.addEventListener('change',sync);
    for(const file of p.cropPaths){const asset=await api.readAsset(file);const img=element('img','region-confirm-image');img.alt=`문제 ${state.project.problems.indexOf(p)+1} 실제 선택 영역`;img.src=asset.dataUrl;group.append(img);await img.decode();}
   }start.disabled=false;}catch(error){note.hidden=false;note.textContent='이미지를 확인할 수 없어 인식을 시작하지 않았습니다. '+errorText(error);}
  }
 }
 async function perform(task,id,options={}){
  const projectId=state.project.id,p=state.project.problems.find(p=>p.id===id);
  if(!p)throw Error('문제가 삭제되어 건너뛰었습니다.');
  await selectProblem(id);state.view='chat';
  if(options.difficultyStep===1&&!options.extra)options={...options,extra:'시험 범위 안에서 원문보다 난이도를 한 단계 높인 유사문제 1개를 만들어 주세요.'};
  const text=task==='recognition'?'선택한 영역에서 인쇄된 원문을 인식하세요.':task==='solve'?'출제 의도에 따라 원문은 보존하고 오독만 최소 교정하여 정답·상세 풀이를 작성하고 검산하세요. 주의점은 풀이 마지막 참고 코멘트에 남기세요.':options.extra||({numeric_only:'수치만 바꾼 유사문제 1개를 만들어 주세요.',mirror_numeric:'도형을 좌우 반전하고 수치를 바꾼 유사문제 1개를 만들어 주세요.',alternative_property:'같은 주제에서 다른 성질을 활용한 유사문제 1개를 만들어 주세요.'}[options.variant]);
  const automaticSolve=task==='solve'&&(options.automatic||!p.recognition?.confirmed||!sourceReady(p.recognition));
  const request=workflowUI.request(text,task==='recognition'?'recognition':task==='generation'?'suggestion':'solve',{task,...(task==='recognition'?{acceptReplacement:true}:{}),variant:task==='generation'?(globalThis.ExamTaskIntent.infer(options.extra||'').variant||options.variant):'',targetIds:p.original?[p.original.id]:[],reuseSolution:task==='solve',allowUnverifiedGeneration:options.allowUnverifiedGeneration,overrideSourceVersion:p.recognition?.version,userInstructions:options.extra||'',automaticPipeline:!!options.automatic||automaticSolve,automaticFinalize:!!options.automatic,batchIncludeWarnings:!!options.automatic,difficultyStep:options.difficultyStep||0,autoRecover:automaticSolve,recoveryWhenNeeded:!!options.automatic,...(automaticSolve?{force:true}:{})});
  const ai=currentAiSettings();state.busy={problemId:id,status:`${labels[task]} · 문제 ${state.project.problems.indexOf(p)+1}`,model:ai.model,effort:ai.effort,stream:'',canceling:false};renderAll();
  try{const result=await api.chat(request);if(result?.project)state.project=result.project;if(options.automatic&&task!=='recognition'){const current=state.project.problems.find(p=>p.id===id),qs=task==='solve'?[current.original]:current.variants.filter(q=>q.provenance?.requestId===request.requestId);if(qs.some(q=>!q.include))throw Error('결과는 저장했지만 검토가 남았습니다. '+qs.filter(q=>!q.include).flatMap(q=>q.checks?.program?.errors||q.checks?.ai?.unverified||[]).join(' '));}return id;}
  catch(error){try{state.project=await api.openProject(projectId);}catch{}if(!state.batch?.cancelled)toast(errorText(error),true,null,{projectId,problemId:id});throw error;}
  finally{state.busy=null;renderAll();}
 }
 function begin(task,ids){const signal={task,label:labels[task],index:0,total:ids.length,cancelled:false};state.batch=signal;review=null;state.batchSummary='';renderAll();progressDialog.showModal();return signal;}
 function showOutcome(outcome,ids,task){
  state.batch=null;progressDialog.close();
  const results=outcome.results,ok=results.filter(r=>r.status==='completed'),failed=results.filter(r=>r.status==='failed');
  const finished=(task==='automatic')?ok.filter(r=>r.task==='solve'):ok;
  const successfulIds=finished.map(r=>r.item);
  state.batchSummary=(task==='automatic')?`원문 풀이 완료 ${finished.length}/${ids.length} · 오류 ${failed.length}건`:`완료 ${ok.length} · 실패 ${failed.length} · 미처리 ${ids.length-ok.length-failed.length}`;renderAll();
  const root=openDialog(outcome.cancelled?'일괄 작업 중지':'일괄 작업 결과',labels[task]);root.append(element('p','',state.batchSummary),element('p','','완료된 결과는 문제별로 저장했습니다. 해결된 확인 사항은 이력과 풀이 코멘트에 보관하며 미해결 항목만 오류 기록에 남습니다. 실패·미처리 대상만 다시 선택해 실행할 수 있습니다.'));
  if((task==='automatic'))for(const phase of ['recognition','solve'])root.append(element('p','',`${labels[phase]}: 완료 ${ok.filter(r=>r.task===phase).length} · 실패 ${failed.filter(r=>r.task===phase).length} · 선행 단계 실패로 건너뜀 ${results.filter(r=>r.task===phase&&r.status==='skipped').length}`));
  for(const r of failed)root.append(element('p','review-notice',`${labels[r.task]||labels[task]} · 문제 ${state.project.problems.findIndex(p=>p.id===r.item)+1}: ${errorText(r.error)}`));
  if(failed.some(r=>/범위|금지.*개념|피타고라스/.test(errorText(r.error)))){root.append(element('p','','시험 범위 때문에 보류된 문항은 로그인·CLI 오류와 다릅니다. 현재 시험지에 맞는 범위를 선택하거나 금지 개념을 확인한 뒤, 보류된 문항의 풀이만 다시 실행하세요. 이미 인식한 원문은 다시 인식할 필요가 없습니다.'),button('시험 범위 확인','button outline',()=>{$('mainDialog').close();$('editPromptProfile').click();}));}
  if(successfulIds.length)root.append(button('결과 차례로 검토','button primary',()=>{$('mainDialog').close();startReview(task==='generation'?'variants':'original',successfulIds);}));
  if(outcome.word){root.append(element('p','', 'Word 저장 완료: '+outcome.word.path),button('저장한 Word 열기','button outline',guarded(()=>api.openPath(outcome.word.path))));}if(outcome.exportError)root.append(element('p','review-notice','Word 저장 실패: '+outcome.exportError));root.append(button('닫기','button outline',()=> $('mainDialog').close()));
 }
 async function saveBatchWord(outcome,originalsOnly){
  if(outcome.cancelled||state.batch?.cancelled)return;state.batch.label='Word 자동 저장';refresh();
  try{outcome.word=await api.exportDocument({projectId:state.project.id,format:'docx',automatic:true,originalsOnly});}catch(e){outcome.exportError=errorText(e);}
 }
 async function executeBatch(task,ids,options){
  const intendedProjectId=state.project?.id;if(!await ready()||state.project?.id!==intendedProjectId)return;
  const signal=begin(task,ids);
  try{const outcome=await run(ids,id=>perform(task,id,{...options,variant:options.variants?.[id]==='harder'?'numeric_only':options.variants?.[id]||options.variant,difficultyStep:options.variants?.[id]==='harder'?1:0}),{signal,onProgress:({index,item})=>{signal.index=index;signal.problemNumber=state.project.problems.findIndex(p=>p.id===item)+1;refresh();}});if(task==='generation')await saveBatchWord(outcome,false);showOutcome(outcome,ids,task);}
  finally{state.batch=null;progressDialog.close();renderAll();}
 }
 async function executeAutomatic(ids,mode='automatic'){
  const intendedProjectId=state.project?.id;if(!await ready()||state.project?.id!==intendedProjectId)return;
   const signal=begin(mode,ids),unread=new Set();
   const plans=new Map(ids.map(id=>[id,automaticPlan(state.project.problems.find(p=>p.id===id),mode)]));
  try{
   const outcome=await pipeline(ids,async(task,id)=>{
    const p=state.project.problems.find(p=>p.id===id);
    if(!plans.get(id)[task]){if(task==='solve'&&!p.original?.documentExcluded&&(!p.original?.include||p.original?.approval?.status!=='approved')){state.project=await api.finalizeAutomatic({projectId:state.project.id,problemId:id,includeWarnings:true});renderAll();if(!state.project.problems.find(q=>q.id===id).original?.include)throw Error('저장된 풀이가 변경되어 검토가 필요합니다.');}return 'reused';}
    if(task==='recognition'){
     if(p?.recognition?.body?.trim()&&p.original&&(!p.recognition.sourceStale&&!p.recognition.rulesStale||p.recognition.correctedByUser))return 'reused';
     try{const result=await perform(task,id,{automatic:true});const current=state.project.problems.find(p=>p.id===id);if(!current?.recognition?.body?.trim()||!current.original)throw Error('인식 결과에 문제 본문이 없습니다. 선택 영역을 확인하고 전체 다시 인식을 실행하세요.');return result;}catch(e){unread.add(id);throw e;}
    }
    if(unread.has(id)||!p?.recognition?.body||!p.original)throw Error('원문 인식을 완료하지 못하여 이 단계를 건너뛰었습니다.');
    // Automatic mathematical review runs together with solving, not as an extra AI request.
    if(task==='review')return 'ready_for_review_and_solution';
    if(task==='solve'&&!p.original.reviewReasons?.length&&p.original.checks?.scope?.status!=='incompatible'&&p.original.answer&&p.original.solution&&!p.original.solutionDraft&&!p.original.solutionStale&&!p.recognition.sourceStale&&!p.recognition.rulesStale&&(p.recognition.confirmed||p.recognition.automaticReview?.sourceVersion===p.recognition.version)){state.project=await api.finalizeAutomatic({projectId:state.project.id,problemId:id,includeWarnings:true});renderAll();if(!state.project.problems.find(q=>q.id===id).original.include)throw Error('저장된 풀이에 미해결 검토 항목이 있습니다.');return 'reused';}
    return perform(task,id,{automatic:true,variant:'numeric_only',allowUnverifiedGeneration:task==='generation'});
   },{signal,through:'solve',onProgress:({task,index,item})=>{signal.task=task;signal.label=task==='review'?'자동 검토 준비 (검산은 풀이와 함께 진행)':task==='solve'?'자동 검토 · 전체 풀이 생성':labels[task];signal.index=index;signal.problemNumber=state.project.problems.findIndex(p=>p.id===item)+1;refresh();}});
   await saveBatchWord(outcome,true);showOutcome(outcome,ids,mode);
  }finally{state.batch=null;progressDialog.close();renderAll();}
 }
 async function cancel(){if(!state.batch)return;state.batch.cancelled=true;refresh();if(state.busy){state.busy.canceling=true;await api.cancelChat({problemId:state.busy.problemId});}refresh();}
 function showReviewChoice(){const root=openDialog('차례로 검토','원문과 유사문제를 하나씩 확인하세요');for(const [kind,title] of [['original','원문 검토'],['variants','유사문제 검토']])root.append(button(title,'button outline',()=>{$('mainDialog').close();startReview(kind);}));}
 function startReview(kind,ids){
  const entries=(state.project?.problems||[]).filter(p=>!ids||ids.includes(p.id)).flatMap(p=>(kind==='original'?[p.original]:(p.variants||[])).filter(Boolean).map(q=>({problemId:p.id,questionId:q.id})));
  if(!entries.length){toast('검토할 문제가 없습니다.');return;}review={projectId:state.project.id,kind,entries,index:0};showEntry();
 }
 const showEntry=guarded(async()=>{const entry=review.entries[review.index];await selectProblem(entry.problemId);state.view=review.kind==='original'?'original':'variants';renderAll();document.getElementById('question-'+entry.questionId)?.scrollIntoView({block:'start'});});
 function move(delta){if(blocked())return;if(state.editor){toast('편집을 저장하거나 닫은 뒤 다음 문제로 이동하세요.');return;}review.index=Math.max(0,Math.min(review.entries.length-1,review.index+delta));showEntry();}
 async function confirmNext(){
  if(blocked()||!review||state.editor)return;const entry=review.entries[review.index],p=state.project.problems.find(p=>p.id===entry.problemId);
  if(review.kind==='original'&&p.recognition?.uncertainties?.length){showSourceReview(p,()=>confirmNext(),null,{solveAfter:false});return;}
  state.saving=true;renderAll();
  try{state.project=review.kind==='original'?await api.confirmSource({projectId:state.project.id,problemId:p.id,sourceVersion:p.recognition?.version,reviewed:true}):await api.approveQuestion({projectId:state.project.id,problemId:p.id,questionId:entry.questionId,approved:true});
   if(review.kind==='original'&&p.original.solution&&!p.original.solutionStale)state.project=await api.approveQuestion({projectId:state.project.id,problemId:p.id,questionId:entry.questionId,approved:true});}
  finally{state.saving=false;renderAll();}
  if(review.index+1<review.entries.length)move(1);else{review=null;renderAll();toast('검토를 마쳤습니다. 풀이가 없는 원문은 「전체 풀이 생성」을 누르세요.');}
 }
 return {refresh,cancel,isOriginalReview:()=>review?.kind==='original'};
}
