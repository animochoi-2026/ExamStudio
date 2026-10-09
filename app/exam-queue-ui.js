import './question-workers.js';
import {createPdfRender} from './pdf-rendering.js';
import {scopeTreeEditor} from './scope-tree-ui.js';
import {installQueueProgress} from './exam-queue-progress.js';
const labels={pending:'대기',running:'처리 중',held:'확인 필요',complete:'처리 종료',cancelled:'취소'};
const stages={regions:'영역 찾기',recognition:'원문·도형 인식',solve:'정답·풀이',analysis:'단원·유형·난이도',upload:'문제은행 업로드'};
export function installExamQueueUI({api,state,element,button,openDialog,guarded,toast,loadProject,loadSource,renderAll,selectProblem,getProvider,ready}){
 if(!api?.examQueueStatus)return;
 let snapshot=null,running=false,syncMetadata=()=>{};const removing=new Set();
 const concurrencyInput=document.getElementById('queueConcurrency'),concurrencyStatus=document.getElementById('queueConcurrencyStatus');
 let savingConcurrency=false;
 const settingsBusy=data=>running||data?.mode==='running'||!!data?.activeStages?.length||!!data?.aiRequests?.active||!!data?.aiRequests?.waiting;
 function drawConcurrency(data){
  if(!concurrencyInput)return;
  concurrencyInput.disabled=savingConcurrency||settingsBusy(data);
  if(document.activeElement!==concurrencyInput)concurrencyInput.value=String(data.limits.aiConcurrency);
  concurrencyStatus.textContent=savingConcurrency?'동시 처리 수 저장 중…':settingsBusy(data)?'처리 중 · 일시정지하고 진행 요청이 끝나면 변경할 수 있습니다.':'저장됨 · 최대 '+data.limits.aiConcurrency+'개 동시 처리';
 }
 if(concurrencyInput){concurrencyInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();concurrencyInput.blur();}});concurrencyInput.addEventListener('change',async()=>{
  if(savingConcurrency)return;savingConcurrency=true;concurrencyInput.disabled=true;concurrencyStatus.textContent='동시 처리 수 저장 중…';
  try{const value=Number(concurrencyInput.value);if(!concurrencyInput.validity.valid||!Number.isSafeInteger(value)||value<1)throw Error('동시 처리 수는 1 이상의 정수로 입력하세요.');const data=await api.examQueueAction({action:'limits',value:{aiConcurrency:value}});concurrencyInput.value=String(data.limits.aiConcurrency);savingConcurrency=false;draw(data);}
  catch(error){concurrencyInput.value=String(snapshot?.limits.aiConcurrency||5);concurrencyStatus.textContent='저장되지 않음: '+error.message;toast(error.message,true);}
  finally{savingConcurrency=false;concurrencyInput.disabled=settingsBusy(snapshot);}
 });}
 async function resumeQueue(){await ready();draw(await api.examQueueAction({action:'resume'}));void run();}
 const progress=installQueueProgress({element,button,onPause:guarded(async()=>draw(await api.examQueueAction({action:'pause'}))),onResume:guarded(resumeQueue),onCancel:guarded(async()=>draw(await api.examQueueAction({action:'cancel'}))),onResults:guarded(item=>details(item))});
 const panel=element('section','exam-queue');panel.id='examQueue';panel.setAttribute('aria-label','시험지 처리 대기열');
 const header=element('div','exam-queue-actions exam-queue-toolbar'),title=element('strong','exam-queue-title','시험지 대기열'),list=element('div','exam-queue-list');list.id='examQueueList';
 header.append(button('＋ 대기열 추가','button compact outline',guarded(async()=>draw(await api.examQueueAdd()))));
 const start=button('정보 확인 · 시작','button compact primary',guarded(confirm)),pause=button('일시정지','button compact outline',guarded(async()=>draw(await api.examQueueAction({action:'pause'})))),resume=button('재개','button compact outline',guarded(resumeQueue)),cancel=button('전체 취소','button compact quiet',guarded(async()=>draw(await api.examQueueAction({action:'cancel'}))));
  start.id='examQueueStart';pause.id='examQueuePause';resume.id='examQueueResume';const showProgress=button('진행 상황 보기','button compact outline',()=>{progress.update(snapshot,running);progress.show();});showProgress.id='examQueueShowProgress';header.append(start,pause,resume,cancel,showProgress);panel.append(title,header,element('p','editor-hint','여기에 PDF·사진을 놓으면 시험지별로 순차 처리합니다. 아래 기존 파일 열기·단일 시험지 도구도 사용할 수 있습니다.'),list);const workspace=document.querySelector('.workspace');workspace.classList.add('has-exam-queue');workspace.prepend(panel);
 panel.addEventListener('dragover',event=>{if(Array.from(event.dataTransfer.types).includes('Files')){event.preventDefault();event.stopPropagation();panel.classList.add('file-drag-active');}});
 panel.addEventListener('dragleave',()=>panel.classList.remove('file-drag-active'));
 panel.addEventListener('drop',guarded(async event=>{if(!event.dataTransfer.files.length)return;event.preventDefault();event.stopPropagation();panel.classList.remove('file-drag-active');draw(await api.examQueueDrop(event.dataTransfer.files));}));
 async function removePending(item){
  if(removing.has(item.id))return;removing.add(item.id);draw(snapshot);
  try{draw(await api.examQueueAction({action:'removePending',id:item.id}));}
  finally{removing.delete(item.id);draw(await api.examQueueStatus());}
 }
 function removalButton(item){const control=button('대기열에서 제거','button compact outline',guarded(()=>removePending(item)));control.disabled=removing.has(item.id);control.setAttribute('aria-label',item.name+' 대기열에서 제거');control.title='언제든 대기열 등록만 해제합니다. 진행 중 결과는 보존하고 후속 처리를 멈춥니다.';return control;}
 function draw(data){snapshot=data;title.textContent='시험지 대기열 · '+data.items.length+'개';syncMetadata(data);drawConcurrency(data);progress.update(data,running);list.replaceChildren();start.disabled=running||!data.items.some(i=>!['cancelled','complete'].includes(i.status));pause.disabled=data.mode!=='running';resume.disabled=running||data.mode==='running';
  for(const item of data.items){const s=item.summary,done=item.status==='complete'&&s.whole,row=element('article','exam-queue-row'+(done?' is-complete':''));row.dataset.queueId=item.id;const heading=element('div','exam-queue-row-heading'),name=element('span','exam-queue-filename',item.name);name.title=item.name;heading.append(name);
   if(done)heading.append(element('span','exam-queue-complete-label','완료'));
   row.append(heading,element('p','',`${done?'처리·등록 완료':item.status==='complete'?'부분 완료 · 확인 필요':item.status==='running'&&data.mode==='paused'?'일시정지':labels[item.status]}${Object.values(item.steps).find(s=>s.status==='running')?' · '+(s.activeProblem||'페이지 탐색')+' · '+stages[Object.values(item.steps).find(s=>s.status==='running').kind]:''} · ${s.countLabel} · 처리 ${s.complete} · 업로드 ${s.uploaded} · 검수 ${s.reviewed}`),element('p','editor-hint',`실패 문항 ${s.failedQuestions} · 보류 문항 ${s.heldQuestions} · 결과불명 문항 ${s.unknownQuestions} · 탐색 확인 ${item.discoveryIssues.length} · 누락 ${s.inventory.missing.length} · 중복 ${s.inventory.duplicates.length}${item.move.status==='complete'?' · 원본 이동 완료':item.move.status==='unknown'?' · 원본 이동 결과불명':item.move.status==='failed'?' · 원본 이동 실패':item.move.status==='held'?' · 원본 이동 보류':''}`));
   if(item.reason||item.move.reason)row.append(element('p','review-notice',item.reason||item.move.reason));
   const actions=element('div','exam-queue-actions');actions.append(removalButton(item));
   for(const [text,action,value]of [['↑','order',-1],['↓','order',1],['개별 취소','cancel']])actions.append(button(text,'button compact quiet',guarded(async()=>draw(await api.examQueueAction({action,id:item.id,value})))));
   if(item.projectId)actions.append(button('원본·문항 열기','button compact outline',guarded(async()=>{if(running)throw Error('일시정지 후 열어 주세요.');await loadProject(await api.openProject(item.projectId));renderAll();})));
   actions.append(button('결과·오류 보기','button compact outline',guarded(()=>details(item))));
   if(['held','cancelled'].includes(item.status))actions.append(button('개별 재시도','button compact outline',guarded(async()=>{const body=openDialog('개별 재시도','결과불명 AI 요청은 다시 비용이 발생할 수 있습니다. 저장된 응답과 완료 산출물은 먼저 재사용합니다.');body.append(button('확인 · 미완료만 재시도','button primary',guarded(async()=>{draw(await api.examQueueAction({action:'retry',id:item.id}));document.getElementById('mainDialog').close();})));})));
   row.append(actions);list.append(row);
  }
 }
 async function details(item){const root=openDialog(item.name+' · 처리 결과','처리 완료·업로드 완료·검수 완료는 서로 다릅니다. AI 결과의 정확함을 뜻하지 않습니다.');root.append(element('p','',item.summary.countLabel),element('p','editor-hint',item.currentPath));
  if(item.projectId&&item.summary.confirmedTotal==null){
   const box=element('div','exam-queue-actions'),inputs={};
   for(const [key,label]of [['total','원본 총수'],['objectiveCount','객관식 수'],['writtenCount','서답형 수']]){const holder=element('label','',label),input=element('input');input.type='number';input.min=key==='writtenCount'?0:1;input.max=2000;input.step=1;input.value=item.metadata.numbering?.[key]??'';input.setAttribute('aria-label','완료 확인 '+label);holder.append(input);box.append(holder);inputs[key]=input;}
   const confirm=button('총수 확인만 저장','button outline',guarded(async()=>{if(running||snapshot.mode==='running')throw Error('처리가 멈춘 뒤 확인하세요.');const value=Object.fromEntries(Object.entries(inputs).map(([k,input])=>[k,input.value===''?null:Number(input.value)]));const next=await api.examQueueAction({action:'confirmTotal',id:item.id,value});draw(next);const updated=next.items.find(i=>i.id===item.id);await details(updated);toast(updated.summary.whole?'총수를 확인했습니다. 기존 업로드 기록은 그대로입니다.':'총수를 확인했습니다. 보류·미완료 문항은 그대로 남습니다.');}));
   confirm.disabled=running||!['paused','idle'].includes(snapshot.mode);box.append(confirm);root.append(element('p','editor-hint','원본을 대조한 총수를 저장합니다. 기존 문항·업로드·출처 정보는 바꾸지 않으며 AI 실행·재업로드·원본 이동을 시작하지 않습니다.'),box);
  }
  for(const [key,s]of Object.entries(item.steps)){const row=element('div','exam-queue-result');row.append(element('span','',`${stages[s.kind]||s.kind} · ${s.status}${s.reason?' · '+s.reason:''}`));if(!key.startsWith('page:')&&item.projectId)row.append(button('문항·원본 대조','button compact outline',guarded(async()=>{if(running)throw Error('일시정지 후 열어 주세요.');await loadProject(await api.openProject(item.projectId));await selectProblem(key.split(':')[0]);state.view='original';document.getElementById('mainDialog').close();renderAll();})));if(s.kind==='upload'&&['unknown','failed','held'].includes(s.status))row.append(button('이 업로드만 재개','button compact outline',guarded(async()=>{if(running)throw Error('일시정지 후 재개하세요.');const result=await api.examQueueRetryUpload({id:item.id,problemId:key.split(':')[0]});draw(await api.examQueueStatus());if(result.held)toast(result.reason,true);document.getElementById('mainDialog').close();await loadProject(await api.openProject(item.projectId));renderAll();})));root.append(row);}
  if(item.projectId){const project=await api.openProject(item.projectId);for(const p of project.problems.filter(p=>p.queueRegionIssue))root.append(element('p','review-notice',p.queueRegionIssue),button('이 영역을 원본과 대조하여 문제 영역으로 확인','button outline',guarded(async()=>{if(running)throw Error('일시정지 후 확인하세요.');await api.examQueueConfirmRegion({id:item.id,problemId:p.id});draw(await api.examQueueStatus());document.getElementById('mainDialog').close();})));}
  for(const key of ['missing','duplicates','unknown'])if(item.summary.inventory[key].length)root.append(element('p','review-notice',`${key==='missing'?'누락':key==='duplicates'?'중복':'번호 확인'}: ${item.summary.inventory[key].join(', ')}`));
  for(const issue of item.discoveryIssues)root.append(element('p','review-notice',issue));
  for(const record of item.resolvedDiscoveryIssues||[])root.append(element('p','editor-hint','해결된 탐색 기록 (완료 판정 제외): '+record.issue+' · '+record.reason));
  if(['failed','held','unknown','moving'].includes(item.move.status))root.append(button('업로드 재실행 없이 원본 이동 재확인','button outline',guarded(async()=>{draw(await api.examQueueMove({id:item.id}));document.getElementById('mainDialog').close();})));
 }
 async function confirm(){if(running||state.busy||state.editor)throw Error('현재 작업·편집을 저장한 뒤 시작하세요.');const settings=await api.getRulesSettings({}),root=openDialog('대기열 시작 전 정보 확인','파일명 규칙만 적용했습니다. 모르는 값은 빈칸입니다. 필수정보 미확정은 업로드 보류, 시험범위 미확정은 인식까지만 진행합니다.');
  const table=element('table','exam-queue-metadata'),head=element('tr');for(const label of ['시험지','학교','학년','연도','학기','시험 종류','원본 총수','객관식 수','서술형 수','총수 확인','시험범위','중복 확인'])head.append(element('th','',label));table.append(head);const editors=[];let submitting=false;const metadataCount=element('p','editor-hint');root.append(metadataCount);
  for(const item of snapshot.items.filter(i=>!['cancelled'].includes(i.status))){const row=element('tr'),cells={},nameCell=element('td'),remove=removalButton(item);nameCell.append(element('div','',item.name),remove);row.append(nameCell);
   for(const key of ['school','grade','academicYear','semester','exam']){const cell=element('td'),input=element('input');input.value=item.metadata[key]||'';input.setAttribute('aria-label',item.name+' '+key);cell.append(input);row.append(cell);cells[key]=input;}
   const countCell=element('td'),count=element('input');count.type='number';count.min=1;count.max=2000;count.value=item.metadata.numbering?.total??'';count.placeholder='선택';countCell.append(count);row.append(countCell);
   const sectionCounts={};for(const key of ['objectiveCount','writtenCount']){const cell=element('td'),input=element('input');input.type='number';input.min=key==='writtenCount'?0:1;input.max=2000;input.value=item.metadata.numbering?.[key]??'';input.placeholder='선택';cell.append(input);row.append(cell);sectionCounts[key]=input;}
   const confirmCell=element('td'),confirmed=element('input');confirmed.type='checkbox';confirmed.checked=!!item.metadata.numbering?.confirmed;confirmCell.append(confirmed);row.append(confirmCell);
   const scopeCell=element('td'),scope=element('select'),empty=element('option','','확인 필요');empty.value='';scope.append(empty);const scopes=[];
   if(item.scope){scopes.push({id:'current',name:item.scope.title||'현재 범위',scope:item.scope});}for(const p of settings.presets||[])scopes.push(p);if(settings.scope)scopes.push({id:'default',name:'기존 설정 범위 확인 후 선택',scope:settings.scope});
   for(const p of scopes){const option=element('option','',p.name);option.value=p.id;scope.append(option);}scope.value=item.scopeConfirmed&&item.scope?'current':'';
   const editScope=button('범위 편집','button compact outline',()=>{const popup=document.createElement('dialog');popup.className='modal';const box=element('div','modal-body');popup.append(box);document.body.append(popup);const chosen=scopes.find(p=>p.id===scope.value)?.scope;const editor=scopeTreeEditor({host:box,element,button,scope:chosen||{grade:'',semester:'',domains:[],units:[],prerequisites:[],forbidden:[],restrictions:''},className:'queue-scope'});box.append(button('범위 확인·적용','button primary',guarded(()=>{const value=editor.read();scopes.push({id:'edited',name:value.title||'편집 범위',scope:value});let o=scope.querySelector('[value="edited"]');if(!o){o=element('option');o.value='edited';scope.append(o);}o.textContent=value.title||'편집 범위';scope.value='edited';popup.close();popup.remove();})),button('닫기','button quiet',()=>{popup.close();popup.remove();}));popup.showModal();});scopeCell.append(scope,editScope);row.append(scopeCell);
   const duplicateCell=element('td'),duplicate=element('select');for(const [value,label]of [['','확인 필요'],['same','같은 시험 · 기존 작업 사용'],['separate','별도 시험으로 확인']]){const option=element('option','',label);option.value=value;duplicate.append(option);}duplicate.value=item.duplicateDecision||'';duplicate.disabled=!item.duplicateCandidate;duplicateCell.append(duplicate);row.append(duplicateCell);table.append(row);editors.push({item,row,remove,cells,count,sectionCounts,confirmed,scope,scopes,duplicate,removed:false});
  }
  const scroll=element('div','exam-queue-table-scroll');scroll.append(table);root.append(scroll);
  const limits=element('div','exam-queue-actions'),limitFields={};for(const [key,label]of [['maxQuestions','시험지별 최대 발견 문항'],['maxRetries','호출 전 통신오류 자동 재시도 (최대 2)']]){const l=element('label','',label),input=element('input');input.type='number';input.value=snapshot.limits[key];l.append(input);limits.append(l);limitFields[key]=input;}root.append(limits,element('p','editor-hint',`대기열 누적 기록 ${snapshot.usage.calls}회 / ${snapshot.usage.tokens.toLocaleString()} 보고 토큰 (계정 사용률과 별개)`),element('p','review-notice','정상 문항은 자동 등록 후 검수 대기입니다. 누락·도형·선택지·번호가 불명확한 문항은 확인 대상으로 남깁니다. 전체 성공 및 총수 확인 후 실제 원본을 원래 폴더의 「완료된 시험지」로 이동합니다.'));
  root.append(element('p','editor-hint','동시 처리 수: '+snapshot.limits.aiConcurrency+'개 · AI 설정 사이드바에서 변경할 수 있습니다.'));
  const go=button('정보 확인 · 처리 시작','button primary',guarded(async()=>{if(submitting||removing.size)return;submitting=true;syncMetadata(snapshot);try{for(const e of editors.filter(e=>!e.removed)){const metadata=Object.fromEntries(Object.entries(e.cells).map(([key,input])=>[key,input.value]));metadata.numbering={...e.item.metadata.numbering,total:e.count.value===''?null:Number(e.count.value),...Object.fromEntries(Object.entries(e.sectionCounts).map(([k,input])=>[k,input.value===''?null:Number(input.value)])),confirmed:e.confirmed.checked};const chosen=e.scopes.find(p=>p.id===e.scope.value);await api.examQueueEdit({id:e.item.id,patch:{metadata,scope:chosen?.scope||null,scopeConfirmed:!!chosen,...(e.duplicate.value?{duplicateDecision:e.duplicate.value}:{})}});}await api.examQueueAction({action:'limits',value:Object.fromEntries(Object.entries(limitFields).map(([k,i])=>[k,Number(i.value)]))});await ready();draw(await api.examQueueAction({action:'start'}));document.getElementById('mainDialog').close();void run();}finally{submitting=false;syncMetadata(snapshot);}}));go.id='examQueueConfirmStart';root.append(go);
  syncMetadata=data=>{
   if(!root.contains(table))return;
   const current=new Map(data.items.map(item=>[item.id,item]));
   for(const editor of editors){if(!current.has(editor.item.id)){editor.removed=true;editor.row.remove();}else editor.remove.disabled=removing.has(editor.item.id);}
   const count=editors.filter(editor=>!editor.removed).length;metadataCount.textContent='정보 입력 대상 '+count+'개';go.disabled=submitting||removing.size>0||count===0;
  };syncMetadata(snapshot);
 }
 async function pageImage(page){let source=state.image;if(state.pdf){const rendered=createPdfRender(await state.pdf.getPage(page),3);await rendered.task.promise;source=rendered.canvas;}const canvas=element('canvas'),w=source.naturalWidth||source.width,h=source.naturalHeight||source.height,scale=Math.min(1,2400/Math.max(w,h));canvas.width=Math.ceil(w*scale);canvas.height=Math.ceil(h*scale);canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
  while(canvas.toDataURL('image/png').length>5*1024*1024&&canvas.width>800){const smaller=element('canvas');smaller.width=Math.ceil(canvas.width*.8);smaller.height=Math.ceil(canvas.height*.8);smaller.getContext('2d').drawImage(canvas,0,0,smaller.width,smaller.height);canvas.width=smaller.width;canvas.height=smaller.height;canvas.getContext('2d').drawImage(smaller,0,0);}return {source,imageDataUrl:canvas.toDataURL('image/png')};}
 function crop(source,r){const canvas=element('canvas'),w=source.naturalWidth||source.width,h=source.naturalHeight||source.height,f=Math.min(1,4000/Math.max(w*r.width,h*r.height));canvas.width=Math.max(1,Math.ceil(w*r.width*f));canvas.height=Math.max(1,Math.ceil(h*r.height*f));canvas.getContext('2d').drawImage(source,w*r.x,h*r.y,w*r.width,h*r.height,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');}
 const keepGoing=id=>snapshot?.mode==='running'&&(!id||snapshot.items.some(i=>i.id===id&&i.status!=='cancelled'));
 async function run(){if(running)return;running=true;state.queueRunning=true;progress.update(snapshot,true);progress.show();renderAll();
  try{for(;;){const item=await api.examQueueNext();if(!item)break;
    try{await loadProject(await api.examQueuePrepare({id:item.id}));await api.examQueueDiscovery({id:item.id,pages:state.pages});
     for(let page=1;page<=state.pages&&keepGoing(item.id);page++){
      const image=await pageImage(page),result=await api.examQueueRegions({id:item.id,page,imageDataUrl:image.imageDataUrl,provider:getProvider()});if(result.stopped)break;if(result.held){await api.examQueueDiscovery({id:item.id,issue:page+'쪽: '+result.reason});continue;}
      for(const [index,r]of result.result.regions.entries()){if(!keepGoing(item.id))break;const {order,...coords}=r;try{state.project=await api.examQueueCapture({id:item.id,page,index,region:coords,imageDataUrl:crop(image.source,r),hint:result.result.hints?.[index]});}catch(error){draw(await api.examQueueDiscovery({id:item.id,issue:page+'쪽 영역 '+(index+1)+': '+error.message}));}}
     }
     const projectId=item.projectId||state.project.id,provider=getProvider();
     await globalThis.ExamQuestionWorkers.runQuestions({problems:[...state.project.problems],limit:snapshot.limits.aiConcurrency||5,keepGoing:()=>keepGoing(item.id),step:(p,stage)=>api.examQueueStep({id:item.id,problemId:p.id,stage,provider})});
     state.project=await api.openProject(projectId);renderAll();
     if(keepGoing(item.id))draw(await api.examQueueFinish({id:item.id}));
    }catch(error){if(!snapshot.items.some(i=>i.id===item.id))continue;draw(await api.examQueueDiscovery({id:item.id,issue:String(error.message)}));toast(String(error.message),true);}
    if(!keepGoing())break;
   }}catch(error){toast(String(error.message),true);draw(await api.examQueueAction({action:'pause'}));}
  finally{running=false;state.queueRunning=false;draw(await api.examQueueStatus());renderAll();}
 }
 api.onEvent(event=>{if(event.type==='exam-queue')draw(event.snapshot);});void api.examQueueStatus().then(draw).catch(error=>toast(String(error.message),true));
}
