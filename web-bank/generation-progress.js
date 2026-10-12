import {progressTracker} from './progress-tracker.js';
// One dialog follows a generation from the first click through its final state.
export function generationProgress({node,action,onCancel,returnFocus}){
 const dialog=node('dialog','','preview-dialog generation-progress'),heading=node('h2','시험지 생성 중'),detail=node('p','조건을 확인하고 있습니다.','generation-progress-detail'),count=node('p','','hint'),bar=node('progress'),closingHint=node('p','진행 창을 닫거나 Esc를 누르면 생성을 취소합니다.','hint'),buttons=node('div','','actions');
 const timing=node('p','','hint');const tracker=progressTracker(timing);let phase=null;let busy=true;
 dialog.setAttribute('aria-label','시험지 생성 중');dialog.setAttribute('aria-busy','true');
 detail.setAttribute('role','status');detail.setAttribute('aria-live','polite');detail.setAttribute('aria-atomic','true');count.setAttribute('aria-live','polite');
 bar.setAttribute('aria-label','조건 확인 진행 중');
 const cancel=action('생성 취소',()=>onCancel()),close=action('닫기',()=>dialog.close());buttons.append(cancel,close);dialog.append(heading,detail,count,timing,bar,closingHint,buttons);
 dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();});
 dialog.addEventListener('close',()=>{tracker.stop();if(busy)onCancel();dialog.remove();if(returnFocus?.isConnected)returnFocus.focus();},{once:true});
 document.body.append(dialog);dialog.showModal();cancel.focus();
 return {
  stage(text,completed=null,total=null){if(!busy||!dialog.open)return;if(phase!==text){if(phase!==null)tracker.complete();phase=text;}tracker.update('normal:'+text,completed,total,total||1);detail.textContent=text;count.textContent=completed==null?'':total==null?`${completed}개 확인`:`${completed} / ${total}문항`;bar.setAttribute('aria-label',text);if(total>0&&completed!=null){bar.max=total;bar.value=completed;}else bar.removeAttribute('value');},
  finish(kind,text,{content=null,actions=[]}={}){if(!busy||!dialog.open)return;if(kind==='success')tracker.complete();tracker.stop();busy=false;const title=kind==='success'?'배치 완료':kind==='cancelled'?'시험지 생성 취소':'시험지 생성 실패';heading.textContent=title;dialog.setAttribute('aria-label',title);dialog.setAttribute('aria-busy','false');dialog.classList.toggle('composition-complete',kind==='success');detail.textContent=text;if(content)dialog.insertBefore(content,buttons);if(actions.length)buttons.prepend(...actions);detail.classList.toggle('error',kind==='error');count.textContent='';bar.hidden=true;closingHint.hidden=true;cancel.hidden=true;close.textContent=kind==='success'?'확인':'닫기';if(kind==='error'){heading.tabIndex=-1;heading.focus();}else close.focus();},
  isOpen(){return dialog.open;},
  close(){tracker.stop();busy=false;dialog.close();}
 };
}
export function waitForGeneration(promise,signal){
 if(signal.aborted)return Promise.reject(new DOMException('시험지 생성 취소','AbortError'));
 return new Promise((resolve,reject)=>{const cancel=()=>reject(new DOMException('시험지 생성 취소','AbortError'));signal.addEventListener('abort',cancel,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',cancel));});
}
