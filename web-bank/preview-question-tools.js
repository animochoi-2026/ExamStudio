// Presentation only: movement and replacement remain owned by the existing editor.
export function previewQuestionTools({node,action,question,pages,index,items,move,replace,message}){
 const group=node('div','','drag-handle mock-question-tools');group.setAttribute('role','group');group.setAttribute('aria-label',(index+1)+'번 문항 편집');
 const handle=node('button','⠿ 이동','mock-question-move');handle.type='button';handle.setAttribute('aria-label',(index+1)+'번 문항 끌어서 이동');handle.title='끌어서 이동 · 키보드 Alt+위/아래';
 let drag=null,scrollFrame=0;
 const clear=()=>{cancelAnimationFrame(scrollFrame);scrollFrame=0;question.classList.remove('moving-question');for(const t of pages.querySelectorAll('.drop-target'))t.classList.remove('drop-target');};
 const targetAt=e=>document.elementFromPoint(e.clientX,e.clientY)?.closest('.print-question,.exam-column');
 const scroll=()=>{if(!drag?.moved)return;const viewport=pages.closest('.exam-viewport'),rect=viewport?.getBoundingClientRect(),y=drag.y;if(rect){if(y<rect.top+55)viewport.scrollTop-=14;else if(y>rect.bottom-55)viewport.scrollTop+=14;}if(y<65)window.scrollBy(0,-12);else if(y>innerHeight-65)window.scrollBy(0,12);scrollFrame=requestAnimationFrame(scroll);};
 handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();question.draggable=false;drag={id:e.pointerId,x:e.clientX,startY:e.clientY,y:e.clientY,moved:false};handle.setPointerCapture(e.pointerId);};
 handle.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;drag.y=e.clientY;if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.startY)<6)return;if(!drag.moved){drag.moved=true;question.classList.add('moving-question');scroll();}for(const t of pages.querySelectorAll('.drop-target'))t.classList.remove('drop-target');const target=targetAt(e);if(target&&target!==question&&pages.contains(target))target.classList.add('drop-target');};
 const stop=()=>{const old=drag;drag=null;clear();question.draggable=matchMedia('(pointer:fine)').matches;if(old&&handle.hasPointerCapture(old.id))handle.releasePointerCapture(old.id);return old;};
 handle.onpointerup=e=>{const target=targetAt(e),old=stop();if(!old?.moved)return;if(!target||target===question||!pages.contains(target))return;const at=Number(question.dataset.index),first=target.classList.contains('print-question')?target:target.querySelector('.print-question');void move(at,first?Number(first.dataset.index):items.length-1,target.classList.contains('exam-column')?(target.dataset.column==='0'?'page':'column'):undefined).catch(e=>message(e.message,true));};
 handle.onpointercancel=handle.onlostpointercapture=()=>{if(drag)stop();};
 handle.onkeydown=e=>{if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();void move(index,Math.max(0,Math.min(items.length-1,index+(e.key==='ArrowUp'?-1:1)))).catch(e=>message(e.message,true));}if(e.key==='Escape'&&drag)stop();};
 group.append(handle);if(replace){const b=action('교체',replace);b.setAttribute('aria-label',(index+1)+'번 문항 교체');group.append(b);}question.prepend(group);return group;
}
