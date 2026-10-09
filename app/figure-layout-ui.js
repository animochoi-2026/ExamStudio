// Arrange existing figures; never redraw their geometry or edit question text.
export function questionFlow({question:q,materials=[],editable=false,onMove,onDelete,blocked=()=>false,element,mathInto,diagramNode,statementBoxNode,number}){
 const structure=globalThis.ExamStructuredLayout,state=structure.status(q);
 if(state.active){const root=element('div','question-flow'+(q.bodyBorder?' question-flow-bordered':''));const images=new Map(materials.map(m=>[m.id,m.dataUrl]));
  root.innerHTML=structure.html(q,{number,math:text=>{const node=mathInto(element('span'),text);return node.innerHTML;},figure:n=>{if(n.diagram)return globalThis.ExamDiagramLayout.diagramSvg(n.diagram,structure.diagramOptions(q,n));const img=element('img');img.src=n.figureId==='diagram'?q.sourceFigureDataUrl:images.get(n.figureId)||'';img.alt='원본 그림 · 필기 잔존 가능성';if(n.figureId==='diagram'&&diagramNode){img.dataset.liveSourceDiagram='true';return img.outerHTML;}if(!img.getAttribute('src')){const pending=element('span','editor-hint','원본 그림 불러오는 중 · 영역 확인 필요');return pending.outerHTML;}return img.outerHTML;}});
  const source=root.querySelector('[data-live-source-diagram]');if(source&&diagramNode)source.replaceWith(diagramNode);
  return root;
 }
 if(state.missing){const root=element('div','question-flow');root.append(element('p','editor-hint',state.message));return root;}
 const {flowParts,figureSlot,boxSlot,placementOptions}=globalThis.ExamQuestionPresentation;
 const root=element('div','question-flow'+(q.bodyBorder?' question-flow-bordered':'')),body=element('div','question-body'),parts=flowParts(q.body),figures=[];
 const options=placementOptions(q.body);let moving=false,drag=null;
 function resetDrag(){drag=null;root.classList.remove('is-figure-dragging');root.querySelectorAll('.active,.dragging').forEach(n=>n.classList.remove('active','dragging'));}
 function drop(slot){
  if(!editable)return;
  const one=figures.length===1&&slot!=='before'&&slot!=='after'&&figureSlot(q,figures[0].id)!==slot;
  const zone=element(one?'button':'div','figure-drop-zone'+(one?' figure-placement-action':''),one?'↳ 여기에 그림 놓기':options.find(o=>o.value===slot)?.label+'에 놓기');zone.dataset.figureSlot=slot;
  if(one){zone.type='button';zone.disabled=blocked();zone.addEventListener('click',async()=>{if(blocked()||moving)return;moving=true;try{await onMove(figures[0].id,slot);}finally{moving=false;}});}
  return zone;
 }
 function targetAt(event){return document.elementFromPoint(event.clientX,event.clientY)?.closest('.figure-drop-zone');}
 function figure(id,node,label){
  if(q.hiddenFigureIds?.includes(id))return;
  const frame=element('figure','figure-object');frame.dataset.figureId=id;
  if(editable){
   const controls=element('figcaption','figure-controls'),handle=element('button','figure-drag-handle',`${label} · 끌어서 이동`);handle.type='button';handle.disabled=blocked();controls.append(handle);
   // Pointer capture avoids the native Windows image-drag loop and supports touch.
   frame.draggable=false;frame.title='문제 위·아래 또는 소문항 사이로 끌어 놓으세요.';
   frame.addEventListener('dragstart',e=>e.preventDefault());
   frame.addEventListener('pointerdown',e=>{
    if(e.button!==0||blocked()||moving||e.target.closest('select,.figure-delete'))return;
    e.preventDefault();e.stopPropagation();handle.focus({preventScroll:true});
    drag={id,pointerId:e.pointerId,x:e.clientX,y:e.clientY,active:false};frame.setPointerCapture(e.pointerId);
   });
   frame.addEventListener('pointermove',e=>{
    if(!drag||drag.pointerId!==e.pointerId)return;
    if(!drag.active&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<5)return;
    drag.active=true;root.classList.add('is-figure-dragging');frame.classList.add('dragging');
    root.querySelectorAll('.figure-drop-zone').forEach(n=>n.classList.remove('active'));
    const zone=targetAt(e);if(zone&&root.contains(zone))zone.classList.add('active');
    const scroller=root.closest('#workContent');
    if(scroller){const bounds=scroller.getBoundingClientRect();if(e.clientY<bounds.top+36)scroller.scrollTop-=18;else if(e.clientY>bounds.bottom-36)scroller.scrollTop+=18;}
   });
   frame.addEventListener('pointerup',async e=>{
    if(!drag||drag.pointerId!==e.pointerId)return;
    const zone=drag.active?targetAt(e):null,slot=zone&&root.contains(zone)?zone.dataset.figureSlot:null;
    if(frame.hasPointerCapture(e.pointerId))frame.releasePointerCapture(e.pointerId);resetDrag();
    if(!slot||blocked()||moving||figureSlot(q,id)===slot)return;
    moving=true;try{await onMove(id,slot);}finally{moving=false;}
   });
   frame.addEventListener('pointercancel',resetDrag);
   frame.addEventListener('lostpointercapture',resetDrag);
   frame.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){if(frame.hasPointerCapture(drag.pointerId))frame.releasePointerCapture(drag.pointerId);resetDrag();}});
   {
    const picker=element('select');picker.setAttribute('aria-label',label+' 위치');picker.disabled=blocked();
    for(const o of options){const item=element('option','',o.label);item.value=o.value;picker.append(item);}picker.value=figureSlot(q,id);
    picker.addEventListener('change',async()=>{if(!blocked())await onMove(id,picker.value);});controls.append(picker);
   }
   if(onDelete){const remove=element('button','button compact quiet figure-delete','그림 삭제');remove.type='button';remove.disabled=blocked();remove.addEventListener('click',()=>{if(!blocked())onDelete(id,label);});controls.append(remove);}
   frame.append(controls);
  }
  frame.append(node);figures.push({id,node:frame});
 }
 for(const [i,m] of materials.entries()){
  const img=element('img');img.src=m.dataUrl;img.alt=m.label||'공통 자료';img.draggable=false;
  figure(m.id||`material-${i}`,img,m.label||`공통 자료 ${i+1}`);
 }
 if(diagramNode)figure('diagram',diagramNode,'도형');
 const box=q.statementBox?.length?statementBoxNode(q.statementBox):null;
 function insert(parent,slot){const zone=drop(slot);if(zone)parent.append(zone);if(box&&boxSlot(q)===slot)parent.append(box);for(const f of figures)if(figureSlot(q,f.id)===slot)parent.append(f.node);}
 insert(root,'before');
 parts.forEach((part,index)=>{
  if(index)insert(body,part.slot);
  const paragraph=mathInto(element('div','subquestion-part'+(index?' subquestion-following':'')),part.text);
  if(index===0&&number!=null)paragraph.prepend(element('span','question-number',`${number}. `));body.append(paragraph);
 });
 root.append(body);insert(root,'after');
 return root;
}
