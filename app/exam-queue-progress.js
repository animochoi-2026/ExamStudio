const stageNames={regions:'영역 찾기',recognition:'문제·도형 인식',solve:'풀이·단원·유형·난이도 생성 (통합 요청)',analysis:'단원·유형·난이도 결과 확인',upload:'문제은행 업로드'};
export function progressView(data){
 const items=data.items||[],active=items.find(i=>Object.values(i.steps||{}).some(s=>s.status==='running'))||items.find(i=>i.status==='running')||items.find(i=>i.status==='pending')||items.at(-1);
 const step=active&&Object.entries(active.steps||{}).find(([,s])=>s.status==='running'),s=active?.summary;
 const issueCount=items.reduce((n,i)=>n+(i.summary.failedQuestions||0)+(i.summary.heldQuestions||0)+(i.summary.unknownQuestions||0)+(i.discoveryIssues?.length||0),0);
 const settled=data.mode!=='running'&&items.length>0&&items.every(i=>['complete','held','cancelled'].includes(i.status));
 const state=data.mode==='paused'?'일시정지':data.mode==='cancelled'?'취소':settled?(issueCount||items.some(i=>i.status!=='complete'||!i.summary.whole)?'처리 종료 · 확인 필요':'처리·업로드 완료 · 검수 대기'):data.mode==='running'?'처리 중':'대기';
 const reasons=[data.reason,...(active?.discoveryIssues||[]),active?.reason,active?.move?.reason,...Object.values(active?.steps||{}).filter(v=>['failed','held','unknown'].includes(v.status)).map(v=>v.reason)].filter(Boolean);
 const counts=Object.fromEntries(Object.keys(stageNames).map(kind=>[kind,Object.values(active?.steps||{}).filter(v=>v.kind===kind&&v.status==='complete').length]));
 return {active,index:active?items.indexOf(active)+1:0,queueTotal:items.length,state,stage:step?stageNames[step[1].kind]||step[1].kind:data.mode==='running'?'다음 단계 준비':state,page:step?.[0].startsWith('page:')?step[0].slice(5):null,number:step?.[0].startsWith('page:')?null:s?.activeProblem,total:s?.confirmedTotal??null,discovered:s?.discovered||0,counts,reasons:[...new Set(reasons)],settled,issueCount};
}
export function installQueueProgress({element,button,onPause,onResume,onCancel,onResults}){
 const existing=document.getElementById('examQueueProgress');if(existing)return existing.queueProgress;
 const popup=element('dialog','exam-queue-progress');popup.id='examQueueProgress';popup.setAttribute('aria-labelledby','examQueueProgressTitle');
 const title=element('h2','','시험지 처리 진행');title.id='examQueueProgressTitle';
 const state=element('strong'),file=element('p'),stage=element('p','queue-progress-stage'),counts=element('div','queue-progress-counts'),issues=element('p','review-notice'),note=element('p','editor-hint','팝업 닫기는 실행 상태를 바꾸지 않습니다. 진행 중 작업은 계속됩니다. 일시정지·취소는 실행 중 단계 결과를 저장한 뒤 후속 처리를 멈춥니다. 처리·등록 완료는 정확함이나 검수 완료를 뜻하지 않습니다.'),actions=element('div','exam-queue-actions');
 let snapshot=null,executing=false,dismissed=false;
 const pause=button('일시정지','button outline',onPause),resume=button('재개','button outline',onResume),cancel=button('후속 작업 취소','button quiet',onCancel),results=button('결과·오류 요약 열기','button outline',()=>{if(!snapshot)return;popup.close();onResults(progressView(snapshot).active);}),close=button('닫기 · 작업 계속','button quiet',()=>{dismissed=true;popup.close();});
 pause.id='examQueueProgressPause';resume.id='examQueueProgressResume';cancel.id='examQueueProgressCancel';results.id='examQueueProgressResults';close.id='examQueueProgressClose';actions.append(pause,resume,cancel,results,close);popup.append(title,state,file,stage,counts,issues,note,actions);document.body.append(popup);
 popup.addEventListener('cancel',event=>{event.preventDefault();dismissed=true;popup.close();});
 function show(){dismissed=false;if(!popup.open&&!document.querySelector('dialog[open]:not(#examQueueProgress)'))popup.show();}
 function update(data,busy=false){snapshot=data;executing=busy;const v=progressView(data);state.textContent=v.state;file.textContent=v.active?`${v.index}/${v.queueTotal}번째 시험지 · ${v.active.name}`:'대기열에 시험지를 추가하세요.';stage.textContent=`현재 단계: ${v.stage}${v.page?' · '+v.page+'페이지':v.number?' · 원본 '+v.number+'번':''}`;
  counts.replaceChildren();const denominator=v.total==null?`총수 미확정 · 탐색 중/발견 ${v.discovered}`:`확인 총수 ${v.total} · 발견 ${v.discovered}`;counts.append(element('p','',denominator));
  if(data.aiRequests)counts.append(element('p','',`전체 AI 요청 ${data.aiRequests.active} / ${data.aiRequests.limit} · 시작 대기 ${data.aiRequests.waiting} · 실행 단계 ${(data.activeStages||[]).length}`));
  if(data.usage)counts.append(element('p','queue-progress-usage',`AI 요청 누적 ${data.usage.calls}회 · 보고 토큰 ${data.usage.tokenReports?data.usage.tokens.toLocaleString():'미제공'}${data.retryAt>Date.now()?' · 재시도 가능 '+new Date(data.retryAt).toLocaleTimeString():''}`));
  for(const [kind,label]of Object.entries(stageNames)){const total=kind==='regions'?v.active?.pages:v.total;counts.append(element('p','',`${label}: 완료 ${v.counts[kind]}${total!=null?' / '+total:''}`));}
  if(v.active)counts.append(element('p','',`처리 완료 ${v.active.summary.complete} · 업로드 완료 ${v.active.summary.uploaded} · 검수 완료 ${v.active.summary.reviewed} · 실패 ${v.active.summary.failedQuestions} · 보류 ${v.active.summary.heldQuestions} · 결과불명 ${v.active.summary.unknownQuestions}`));
  const waiting=data.mode==='paused'&&Object.values(v.active?.steps||{}).some(s=>s.status==='running');issues.textContent=[waiting?'실행 중 단계 응답을 기다립니다. 완료 후 후속 요청을 멈춥니다.':null,...v.reasons].filter(Boolean).join('\n');issues.hidden=!issues.textContent;pause.disabled=data.mode!=='running';resume.disabled=executing||data.mode==='running'||!v.active||['complete','cancelled'].includes(v.active.status);cancel.disabled=!v.active||['complete','cancelled'].includes(v.active.status);results.disabled=executing||!v.active?.projectId;
  if(!dismissed&&data.mode==='running'&&!popup.open)show();
 }
 const controller={show,update};popup.queueProgress=controller;return controller;
}
