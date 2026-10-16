import {sourceBrowser} from './source-browser.js';
import {compareSchools,regionLabel,schoolMatches} from './school-regions.js';
import inventoryTools from '../app/source-inventory.cjs';
import {loadSourceDifficulty} from './source-difficulty.js';
const loads=new WeakMap();
let loadingId=0;
const REQUEST_TIMEOUT_MS=30_000;
export function cancelOriginalExams(root){loads.get(root)?.cancel();}
export function originalLoading({root,node,action,isCurrent=()=>root.isConnected,onCancel=()=>{},titleText='기출문제 불러오는 중',statusText='등록 자료를 불러오는 중…'}){
 loads.get(root)?.cancel();
 const dialog=node('dialog','','original-loading preview-dialog'),title=node('h2',titleText),status=node('p',statusText,'original-loading-status'),progress=node('progress','','original-loading-progress'),error=node('p','','original-loading-error error');
 const id='original-loading-'+(++loadingId);title.id=id;status.id=id+'-status';dialog.setAttribute('aria-labelledby',title.id);dialog.setAttribute('aria-describedby',status.id);status.setAttribute('role','status');status.setAttribute('aria-live','polite');progress.setAttribute('aria-label','기출자료 준비 진행');error.hidden=true;
 const controller=new AbortController();
 let cancelled=false,settled=false,timedOut=false;
 const close=action('닫기',()=>dialog.close(),true);close.className='original-loading-close';close.hidden=true;
 const load={cancel(){if(cancelled)return;cancelled=true;controller.abort();if(!settled&&isCurrent())onCancel();if(dialog.open)dialog.close();dialog.remove();if(loads.get(root)===load)loads.delete(root);}};
 loads.set(root,load);dialog.append(title,status,progress,error,close);document.body.append(dialog);
 dialog.addEventListener('cancel',()=>load.cancel());dialog.addEventListener('close',()=>load.cancel());dialog.showModal();
 const current=()=>{if(cancelled||loads.get(root)!==load||!dialog.open||!isCurrent()){load.cancel();return false;}return true;};
 const fail=text=>{if(!current())return;settled=true;status.textContent='기출자료 불러오기를 완료하지 못했습니다.';progress.hidden=true;error.textContent=text;error.hidden=false;close.hidden=false;close.focus();};
 const timeoutMessage='기출자료 응답 시간이 30초를 넘었습니다. 연결 상태를 확인한 뒤 다시 진입해 주세요.';
 // Bound every request, including transports/mocks that do not acknowledge abort.
 const wait=task=>new Promise((resolve,reject)=>{
  const deadline=new AbortController();let finished=false,timer;
  const finish=(ok,value)=>{if(finished)return;finished=true;clearTimeout(timer);controller.signal.removeEventListener('abort',abort);(ok?resolve:reject)(value);};
  const abort=()=>{deadline.abort();finish(false,Error('기출자료 조회 취소'));};
  if(controller.signal.aborted){abort();return;}
  controller.signal.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>{timedOut=true;deadline.abort();finish(false,Object.assign(Error(timeoutMessage),{code:'timeout'}));controller.abort();},REQUEST_TIMEOUT_MS);
  Promise.resolve().then(()=>finished?undefined:typeof task==='function'?task(deadline.signal):task).then(value=>finish(true,value),cause=>finish(false,cause));
 });

 Object.assign(load,{dialog,status,progress,current,fail,wait,timeoutMessage,stage(text,count,total){if(!current())return;status.textContent=text;if(total!=null){progress.max=Math.max(1,total);progress.value=count||0;}else progress.removeAttribute('value');},complete(){if(!current())return;settled=true;load.cancel();}});
 Object.defineProperty(load,'timedOut',{get:()=>timedOut});return load;
}
export async function originalExams(options){return sourceBrowser({...options,mode:'papers'});}

// The restoration entry has its own read lifecycle; the list dialog ends before this starts.
export async function restoreOriginalExam({root,node,action,rpc,rows,reader,isCurrent},open){
 const load=originalLoading({root,node,action,isCurrent,titleText:'기출 시험지 복원 중',statusText:'원본 문항 목록을 불러오는 중…'});
 const pending=new Set();let reading=true,collecting=true,failure=null,received=0,readingIndex=0;
 const track=task=>{const p=load.wait(task);pending.add(p);p.then(()=>pending.delete(p),e=>{pending.delete(p);failure||=e;});return p;};
 const scopedRpc=async(name,args)=>{if(!reading)return rpc(name,args);if(!load.current())throw Error('기출자료 조회 취소');if(name==='bank_source_progress_get'){collecting=false;load.stage('원본 시험지의 등록 상태를 확인하는 중…');}else if(name==='bank_source_exams')load.stage('복원 화면의 원본 자료 목록을 확인하는 중…');else if(name==='bank_exam_candidates')load.stage('복원 화면의 문항 정보를 확인하는 중…');const value=await track(signal=>rpc(name,args,{signal}));if(!load.current())throw Error('기출자료 조회 취소');if(collecting&&name==='bank_source_questions'&&args.source_key===root.dataset.sourceExam){received+=value.filter(c=>!c.metadata?.relations?.originalQuestionId).length;load.stage('원본 문항 목록을 불러오는 중… 실제 '+received+'문항 확인');}return value;};
 const scopedRows=(table,filters)=>reading?track(signal=>rows(table,filters,{signal})):rows(table,filters);
 const scopedReader={...reader,render:async(...args)=>{if(!reading)return reader.render(...args);if(!load.current())throw Error('기출자료 조회 취소');load.stage('전체 '+received+'문항 중 '+(++readingIndex)+'번째 문항의 본문·그림을 불러오는 중…',readingIndex-1,received);const value=await track(()=>reader.render(...args));if(!load.current())throw Error('기출자료 조회 취소');return value;}};
 try{const rendered=await open({rpc:scopedRpc,rows:scopedRows,reader:scopedReader,initialLoad:{isValid:load.current,awaitPending:p=>track(()=>p),onProgress:(text,count,total)=>load.stage(text+(total!=null?' 전체 '+total+'문항 중 '+count+'문항 완료':''),count,total)}});while(pending.size){await Promise.all([...pending]);if(!load.current())return;}if(!load.current())return;if(failure)throw failure;if(rendered===false)throw Error(root.querySelector('.exam-render-status')?.textContent||'문항 미리보기 준비를 완료하지 못했습니다.');reading=false;load.complete();}catch(e){if(load.current())load.fail(load.timedOut?load.timeoutMessage:'기출 시험지 복원을 완료하지 못했습니다. '+e.message);}
}
