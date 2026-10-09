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
export async function originalExams({root,config,rpc,navigate,node,action,isCurrent=()=>root.isConnected}){
 const difficultyRows=[];const load=originalLoading({root,node,action,isCurrent,onCancel:()=>{for(const entry of difficultyRows)if(!entry.done)entry.element.textContent='난이도 조회 취소';}});
 const {status,progress,current,fail,timeoutMessage}=load;const request=(name,args)=>load.wait(signal=>rpc(name,args,{signal}));
 try{
 root.append(node('p','실제 등록된 학교·시험지만 표시합니다. 원문 번호·배점이 없거나 일부만 등록된 자료는 아래에 알립니다.','hint'));
 const sources=[];for(let start=0;;start+=50){const page=await request('bank_source_exams',{s:config.spaceId,start_at:start});if(!current())return;sources.push(...page);status.textContent=`등록 자료를 불러오는 중… · ${sources.length}개 확인`;if(page.length<50)break;}
 const grouped=new Map();for(const source of sources){const s=source.source||{};if(!s.school)continue;const school=[s.region,s.school].filter(Boolean).join(' · '),grade=s.grade||'학년 미확인',year=s.academicYear?s.academicYear+'학년도':'연도 미확인',exam=[s.semester,s.exam].filter(Boolean).join(' ')||'시험 구분 미확인';
  let level=grouped;for(const key of [school,grade,year]){if(!level.has(key))level.set(key,new Map());level=level.get(key);}level.set(exam+' · '+source.source_id,source);
 }
 function branches(map,parent,depth=0){for(const [label,value]of map){if(value instanceof Map){const details=node('details','','source-tree-level');details.append(node('summary',label));branches(value,details,depth+1);parent.append(details);}else{const s=value.source||{},b=action([s.semester,s.exam].filter(Boolean).join(' ')||'시험 구분 미확인',()=>navigate('exam-source/'+encodeURIComponent(value.source_id)),true);b.className='source-exam-choice';b.append(node('span',' '+inventoryTools.sourceCountLabel(value),'source-count'));const difficulty=node('span','난이도 확인 중…','source-difficulty');b.append(difficulty);difficultyRows.push({id:value.source_id,element:difficulty,summary:value.difficulty});const note=node('small',`등록 ${value.question_count}문항 · 원본 ${value.progress?.status==='complete'?'등록 완료 확인':'일부 또는 완료 여부 미확인'}`,'hint');parent.append(b,note);}}}
 branches(grouped,root);if(!grouped.size)root.append(node('p','학교 기출이 아직 등록되지 않았습니다.','hint'));
 let cursor=0,completed=0,failed=0;const total=difficultyRows.length;progress.max=Math.max(1,total);progress.value=0;status.textContent=`화면을 준비하는 중… · 총 ${total}개 중 0개 난이도 확인`;
 // Source queries arrive in batches; only finished source-level checks count as progress.
 const currentRpc=async(...args)=>{if(!current())throw new Error('기출자료 조회 취소');const value=await request(...args);if(!current())throw new Error('기출자료 조회 취소');return value;};
 await Promise.all(Array.from({length:Math.min(4,total)},async()=>{while(current()&&!load.timedOut&&cursor<total){const entry=difficultyRows[cursor++];try{const value=await loadSourceDifficulty(currentRpc,config.spaceId,entry.id,entry.summary);if(!current())return;entry.element.textContent=value;}catch{if(!current()||load.timedOut)return;entry.element.textContent='난이도 조회 실패';failed++;}entry.done=true;completed++;progress.value=completed;status.textContent=`화면을 준비하는 중… · 총 ${total}개 중 ${completed}개 난이도 확인`;}}));
 if(!current())return;
 if(load.timedOut){for(const entry of difficultyRows)if(!entry.done)entry.element.textContent='난이도 조회 미완료 (시간 초과)';fail(timeoutMessage);return;}
 if(failed){fail(`기출자료는 표시했지만 ${failed}개 자료의 난이도를 불러오지 못했습니다. 닫은 뒤 다시 진입하여 재시도해 주세요.`);return;}
 load.complete();
 }catch(cause){fail(load.timedOut?timeoutMessage:'등록 자료를 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 진입해 주세요. '+(cause?.message||String(cause)));}
}

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
