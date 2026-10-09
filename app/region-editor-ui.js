import './region-geometry.js';
import {createPdfRender} from './pdf-rendering.js';
const {uniqueRegions,transformRegion}=globalThis.ExamRegionGeometry;
export function installRegionEditor({api,state,$,element,button,openDialog,guarded,toast,errorText,blocked,updateControls,renderAll,renderRegions,selectProblem,cropRegion,ready,getProvider}){
 let running=null,drag=null;
 const place=(box,r)=>{for(const [css,key] of [['left','x'],['top','y'],['width','width'],['height','height']])box.style[css]=`${r[key]*100}%`;};
 async function remove(problem,index){
  if(blocked())return;
  if(!window.confirm(problem.regions.length===1?'이 문제 영역을 삭제할까요? 인식한 내용·대화·유사문제가 있다면 함께 삭제됩니다.':'선택한 영역을 삭제할까요? 나머지 영역은 유지됩니다.'))return;
  state.loading=true;updateControls();
  try{state.project=await api.removeRegion({projectId:state.project.id,problemId:problem.id,regionIndex:index});if(!state.project.problems.some(p=>p.id===state.selectedId))state.selectedId=state.project.problems[0]?.id||null;}
  finally{state.loading=false;renderAll();}
 }
 function bind(box,problem,index){
  box.dataset.problemId=problem.id;box.dataset.regionIndex=index;
  box.title='박스 안쪽: 이동 · 테두리 점: 크기 조절 · 겹치는 새 영역 추가: Shift+드래그';
  const r=problem.regions[index];
  if(state.selectedId===problem.id&&!blocked()&&!state.replacement){
   for(const dir of ['nw','n','ne','e','se','s','sw','w']){const h=element('span',`region-handle handle-${dir}`);h.dataset.handle=dir;h.title='드래그하여 크기 조절';box.append(h);}
   const del=button('×','region-delete',guarded(()=>remove(problem,index)));del.title='이 영역 삭제';del.setAttribute('aria-label','이 영역 삭제');del.addEventListener('pointerdown',e=>e.stopPropagation());box.append(del);
  }
  box.addEventListener('pointerdown',e=>{
   if(e.shiftKey||state.append||state.replacement)return;
   e.stopPropagation();if(e.button!==0||blocked()||drag)return;
   e.preventDefault();const bounds=$('selectionLayer').getBoundingClientRect();
   drag={box,problem,index,r,startX:e.clientX,startY:e.clientY,bounds,handle:e.target.dataset.handle||'move',next:r,moved:false,pointerId:e.pointerId};
   box.setPointerCapture(e.pointerId);box.classList.add('dragging');
  });
  box.addEventListener('pointermove',e=>{
   if(!drag||drag.box!==box||drag.pointerId!==e.pointerId)return;
   e.stopPropagation();const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;
   if(Math.abs(dx)+Math.abs(dy)<4&&!drag.moved)return;
   drag.moved=true;drag.next=transformRegion(r,drag.handle,dx/drag.bounds.width,dy/drag.bounds.height,20/state.sourceSize.width,20/state.sourceSize.height);place(box,drag.next);
  });
  box.addEventListener('pointerup',guarded(async e=>{
   if(!drag||drag.box!==box||drag.pointerId!==e.pointerId)return;
   e.stopPropagation();const completed=drag;drag=null;box.classList.remove('dragging');box.releasePointerCapture(e.pointerId);
   if(!completed.moved){await selectProblem(problem.id);return;}
   if((problem.recognition||problem.original)&&!window.confirm('인식한 문제의 영역을 변경하면 다시 인식이 필요합니다. 영역을 변경할까요?')){renderRegions();return;}
   state.loading=true;updateControls();
   try{const imageDataUrl=await cropRegion(completed.next);state.project=await api.replaceRegion({projectId:state.project.id,problemId:problem.id,regionIndex:index,region:completed.next,imageDataUrl});state.selectedId=problem.id;}
   finally{state.loading=false;renderAll();}
  }));
  box.addEventListener('pointercancel',()=>{if(drag?.box===box){drag=null;renderRegions();}});
 }
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){const previous=drag;drag=null;if(previous.box.hasPointerCapture(previous.pointerId))previous.box.releasePointerCapture(previous.pointerId);renderRegions();}});
 async function pageImage(page){
  const canvas=document.createElement('canvas');let source=state.image;
  if(state.pdf){const rendered=createPdfRender(await state.pdf.getPage(page),3);await rendered.task.promise;source=rendered.canvas;}
  const width=source.naturalWidth||source.width,height=source.naturalHeight||source.height,scale=Math.min(1,2400/Math.max(width,height));canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
  // Keep the provider image below its size limit even for noisy camera photos.
  while(canvas.toDataURL('image/png').length>5*1024*1024&&canvas.width>800){const smaller=document.createElement('canvas');smaller.width=Math.round(canvas.width*.8);smaller.height=Math.round(canvas.height*.8);smaller.getContext('2d').drawImage(canvas,0,0,smaller.width,smaller.height);canvas.width=smaller.width;canvas.height=smaller.height;canvas.getContext('2d').drawImage(smaller,0,0);}
  return {preview:canvas,capture:source};
 }
 function cropCanvas(canvas,r){const out=document.createElement('canvas'),width=canvas.naturalWidth||canvas.width,height=canvas.naturalHeight||canvas.height,scale=Math.min(1,4000/Math.max(r.width*width,r.height*height));out.width=Math.max(1,Math.ceil(r.width*width*scale));out.height=Math.max(1,Math.ceil(r.height*height*scale));out.getContext('2d').drawImage(canvas,r.x*width,r.y*height,r.width*width,r.height*height,0,0,out.width,out.height);return out.toDataURL('image/png');}
 async function cancel(){if(!running)return;running.cancelled=true;const status=$('regionDetectionStatus');if(status)status.textContent='중지 중… 완료된 페이지의 영역은 유지됩니다.';if(running.requestId)await api.cancelChat({problemId:running.requestId});}
 async function run(all){
  if(blocked())return;await ready();if(blocked()||!state.project||!state.sourceSize)return;
  if(state.editor){toast('편집 내용을 저장하거나 편집을 닫은 뒤 실행하세요.');return;}
  const task={cancelled:false,requestId:null};running=task;const projectId=state.project.id,sourceId=state.activeSourceId,pages=all?Array.from({length:state.pages},(_,i)=>i+1):[state.page];
  $('collectRegions').checked=true;state.append=false;state.replacement=null;state.contextCapture=false;
  state.busy={problemId:'regions-pending',status:'문제영역 찾기',stream:'',canceling:false};renderAll();
  const body=openDialog('문제영역 자동 찾기','완료 후 박스를 확인하고 전체 인식을 눌러 주세요');
  const status=element('p','','');status.id='regionDetectionStatus';const preview=element('img','region-detection-preview');preview.alt='현재 문제영역을 찾는 페이지';
  const stop=button('전체 중지','button outline',guarded(cancel));stop.id='stopRegionDetection';body.append(status,preview,stop);
  const dialog=$('mainDialog'),onClose=()=>{if(running===task)void cancel().catch(()=>{});};dialog.addEventListener('close',onClose);
  let added=0,duplicates=0,completed=0;const failures=[];
  try{
   for(const [i,page] of pages.entries()){
    if(task.cancelled)break;
    status.textContent=`${i+1} / ${pages.length} 페이지 · 원본 ${page}쪽의 문제영역을 찾고 있습니다…`;
    try{
     const {preview:canvas,capture}=await pageImage(page);if(task.cancelled)break;const imageDataUrl=canvas.toDataURL('image/png');preview.src=imageDataUrl;
     task.requestId='regions-'+crypto.randomUUID();state.busy.problemId=task.requestId;
     const result=await api.detectRegions({projectId,sourceId,page,imageDataUrl,provider:getProvider(),requestId:task.requestId});
     task.requestId=null;if(task.cancelled)break;
     const existing=state.project.problems.flatMap(p=>p.regions).filter(r=>(r.sourceId||'primary')===sourceId&&r.page===page&&r.role!=='context');
     const regions=uniqueRegions(result.regions,existing);duplicates+=result.regions.length-regions.length;
     for(const r of regions){if(task.cancelled)break;const {order,...coords}=r;state.project=await api.addRegion({projectId,region:{...coords,sourceId,page,detectedBounds:{...coords}},imageDataUrl:cropCanvas(capture,r)});added++;if(!state.selectedId)state.selectedId=state.project.problems.at(-1).id;}
     if(!task.cancelled)completed++;renderAll();
    }catch(error){if(task.cancelled)break;failures.push(`${page}쪽: ${errorText(error)}`);if(completed===0&&added===0)break;}
   }
  }finally{
   dialog.removeEventListener('close',onClose);running=null;state.busy=null;renderAll();
  }
  const root=openDialog(task.cancelled?'문제영역 찾기 중지':failures.length?(completed?'일부 페이지 찾기 실패':'문제영역 찾기 실패'):'문제영역 찾기 완료',added?'박스를 확인한 후 전체 인식':failures.length?'오류 내용을 확인해 주세요':'영역 찾기 결과');
  root.append(element('p','',`${completed} / ${pages.length} 페이지 처리 · ${added}개 영역 추가${duplicates?` · 기존·중복 영역 ${duplicates}개 제외`:''}`));
  root.append(element('p','','박스를 선택해 안쪽을 끌면 이동하고, 테두리의 점을 끌면 크기가 바뀝니다. 빈 곳을 드래그하면 문제를 추가하고, 기존 박스와 겹치는 곳은 Shift+드래그로 추가합니다. 선택한 박스의 ×로 삭제할 수 있습니다. 순서는 「문제 순서 관리」에서 바꿀 수 있습니다. 확인 후 하단의 「전체 인식」을 누르세요.'));
  if(!added&&!failures.length)root.append(element('p','','새로 찾은 문제가 없습니다. 필요한 영역은 직접 드래그해서 추가해 주세요.'));
  for(const message of failures)root.append(element('p','error-explanation',message));
  const close=button(added?'박스 확인하기':'닫기','button primary',()=>dialog.close());close.id='confirmDetectedRegions';root.append(close);
 }
 $('detectRegions').addEventListener('click',()=>{
  if(blocked()||!state.project||!state.sourceSize)return;
  const root=openDialog('문제영역 자동 찾기','찾을 페이지 선택');
  root.append(element('p','','현재 선택한 AI로 문제의 위치만 찾습니다. 기존 영역은 유지하고 새 영역은 읽는 순서대로 뒤에 추가합니다. 문제 내용 인식과 풀이는 박스를 확인한 뒤 진행합니다.'));
  const scope=element('select');scope.id='regionDetectionScope';scope.setAttribute('aria-label','문제영역 찾을 페이지');for(const [value,label] of [['current',`현재 페이지 (${state.page}쪽)`],['all',`현재 파일 전체 페이지 (${state.pages}쪽)`]]){const option=element('option','',label);option.value=value;scope.append(option);}
  const start=button('자동 찾기 시작','button primary',guarded(()=>run(scope.value==='all')));start.id='startRegionDetection';root.append(scope,start);
 });
 return {bind,cancel,isRunning:()=>!!running};
}
