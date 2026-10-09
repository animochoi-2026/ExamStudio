// Crop the stored source at its original resolution. No AI call or geometry mutation.
export async function showSourceFigurePicker({p,q,api,projectId,openDialog,element,button,onSave,onError}){
 const root=openDialog('원본 그림 그대로 사용','그림 부분을 드래그해 선택하세요');
 root.append(element('p','','원본 그림만 선택해 주세요. 선택 영역의 인쇄·필기는 그대로 들어갑니다. 본문·정답·풀이는 바뀌지 않습니다.'));
 const action=element('select');action.setAttribute('aria-label','원본 그림 추가 방식');
 for(const [value,label] of [['replace','기존 그림 대신 사용 (기존 그림 모두 대체)'],['add','별도 그림 추가 (기존 그림 유지)']]){const o=element('option','',label);o.value=value;action.append(o);}root.append(action);
 root.append(element('p','','그림이 여러 개면 각각 선택하여 「별도 그림 추가」로 저장하세요. 저장 후 그림의 위치 메뉴나 끌어 이동으로 본문 사이에 배치할 수 있습니다.'));
 const selector=element('select');selector.setAttribute('aria-label','그림을 가져올 원본 영역');
 p.cropPaths.forEach((_,i)=>{const o=element('option','',`원본 영역 ${i+1}`);o.value=String(i);selector.append(o);});root.append(selector);
 const stage=element('div','source-figure-crop'),img=element('img'),box=element('div','source-figure-selection');
 img.alt='그림 부분을 선택할 원본';img.draggable=false;box.hidden=true;stage.append(img,box);root.append(stage);
 const preview=element('canvas','source-figure-preview');preview.hidden=true;root.append(preview);
 const status=element('p','','그림의 모서리에서 반대 모서리까지 드래그하세요.');root.append(status);
 let bounds=null,start=null,ready=false,saving=false,loadId=0;
 const save=button('선택한 원본 그림 사용','button',async()=>{
  if(!bounds||!ready||saving)return;saving=true;save.disabled=true;selector.disabled=true;
  try{onSave(await api.setPresentation({projectId,problemId:p.id,targetIds:[q.id],diagramMode:'source',sourceFigureAction:action.value,sourceFigure:{regionIndex:Number(selector.value),bounds}}));}
  catch(e){onError(e);saving=false;save.disabled=false;selector.disabled=false;}
 });save.id='saveSourceFigure';save.disabled=true;root.append(save);
 const point=e=>{const r=img.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
 function paint(){if(!bounds)return;box.hidden=false;Object.assign(box.style,{left:bounds.x*100+'%',top:bounds.y*100+'%',width:bounds.width*100+'%',height:bounds.height*100+'%'});}
 stage.addEventListener('pointerdown',e=>{if(!ready||saving||e.button!==0)return;e.preventDefault();start=point(e);bounds=null;save.disabled=true;preview.hidden=true;box.hidden=true;stage.setPointerCapture(e.pointerId);});
 stage.addEventListener('pointermove',e=>{if(!start)return;const end=point(e);bounds={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(start.x-end.x),height:Math.abs(start.y-end.y)};paint();});
 stage.addEventListener('pointerup',e=>{if(!start)return;start=null;if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);if(!bounds||bounds.width*img.naturalWidth<5||bounds.height*img.naturalHeight<5){bounds=null;box.hidden=true;return;}
  preview.width=Math.max(1,Math.round(bounds.width*img.naturalWidth));preview.height=Math.max(1,Math.round(bounds.height*img.naturalHeight));preview.getContext('2d').drawImage(img,bounds.x*img.naturalWidth,bounds.y*img.naturalHeight,bounds.width*img.naturalWidth,bounds.height*img.naturalHeight,0,0,preview.width,preview.height);preview.hidden=false;save.disabled=false;status.textContent='아래 미리보기를 확인한 뒤 저장하세요.';
 });
 stage.addEventListener('pointercancel',()=>{start=null;bounds=null;box.hidden=true;save.disabled=true;});
 async function load(){const id=++loadId;ready=false;bounds=null;start=null;save.disabled=true;box.hidden=true;preview.hidden=true;try{const asset=await api.readAsset(p.cropPaths[Number(selector.value)]);if(id!==loadId||!root.isConnected)return;img.src=asset.dataUrl;await img.decode();if(id===loadId)ready=true;}catch(e){if(id===loadId)onError(e);}}
 selector.addEventListener('change',load);await load();
}
