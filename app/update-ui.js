export function installUpdateUI({api,state,element,button,openDialog,blocked,saveProject}){
 let running=false;
 document.getElementById('checkUpdates').addEventListener('click',async()=>{
  if(running)return;
  const root=openDialog('문제공방 업데이트','GitHub 공식 배포');
  const status=element('p','','버전 목록을 확인하고 있습니다.');root.append(status);
  root.append(element('p','editor-hint','작업·대화·프롬프트와 결과물은 보존합니다. 설치할 때 프로그램을 닫고 선택한 버전으로 다시 실행합니다.'));
  root.append(element('p','editor-hint','최근 정식 배포 버전 3개를 버전 번호로 표시합니다. 현재보다 낮은 버전을 선택하면 롤백할 수 있습니다. 이 목록과 현재 설치 버전에 해당하지 않는 로컬 업데이트 파일·백업은 자동 정리하며, 설치 실패·미완료 복구 파일은 보존합니다.'));
  root.append(button('GitHub 배포 페이지','button outline',()=>api.openUpdatePage()));
  try{
   const info=await api.checkUpdate();if(!root.isConnected)return;
   status.textContent=`현재 설치: v${info.current} · 최신 배포: ${info.latest?'v'+info.latest:'아직 없음'}`;
   if(info.cleanup?.removed)root.append(element('p','editor-hint',`보관 대상이 아닌 업데이트 파일·백업 ${info.cleanup.removed}개를 정리했습니다.`));
   if(info.cleanup?.skipped)root.append(element('p','editor-hint','사용 중이거나 안전하게 정리할 수 없는 파일은 보존했습니다. 다음 확인 때 다시 정리합니다.'));
   const label=element('label','','설치할 버전 '),select=element('select');select.id='updateVersion';select.setAttribute('aria-label','설치할 버전');label.append(select);root.append(label);
   for(const choice of info.choices){const tags=[choice.latest?'최신':'',choice.installed?'현재 사용 중':'',choice.rollback?'롤백 가능':''].filter(Boolean);const option=element('option','',`v${choice.version}${tags.length?' · '+tags.join(' · '):''}`);option.value=choice.version;option.disabled=!choice.installable;select.append(option);}
   if(!info.choices.length){const option=element('option','','공개된 배포 버전이 없습니다.');option.disabled=true;select.append(option);select.disabled=true;}
   select.value=info.choices.find(c=>c.installable)?.version||'';
   const notes=element('pre','request-preview');root.append(notes);
   const download=button('선택한 버전 설치','button primary',async()=>{
    if(running)return;
    const choice=info.choices.find(c=>c.version===select.value);if(!choice?.installable)return;
    if(blocked()||state.documentBusy||state.editor){status.textContent='진행 중인 작업을 마치고 문구 편집을 저장한 뒤 다시 눌러 주세요.';return;}
    running=true;download.disabled=true;select.disabled=true;status.textContent=`${choice.version} 다운로드 중…`;
    const unsubscribe=api.onEvent(e=>{if(e.type==='update-progress')status.textContent=`${choice.version} 다운로드 중 · ${Math.floor(e.received/e.total*100)}%`;});
    try{
     await api.downloadUpdate(choice.version);status.textContent='파일 검증 완료. 현재 작업을 저장하고 재시작합니다…';
     if(blocked()||state.documentBusy||state.editor)throw Error('다운로드 중 시작한 작업이 있습니다. 작업을 마친 뒤 업데이트를 다시 눌러 주세요.');
     if(state.project)await saveProject();await api.installUpdate();
    }catch(e){status.textContent=String(e.message||e);download.disabled=false;}finally{unsubscribe();running=false;select.disabled=false;}
   });download.id='installSelectedUpdate';root.append(download);
   const refresh=()=>{const c=info.choices.find(c=>c.version===select.value);notes.textContent=c?.notes||'이 버전의 배포 설명이 없습니다.';download.disabled=!info.packaged||!c?.installable;download.textContent=c?.installed?`v${c.version} 다시 설치`:c?.rollback?`v${c.version}로 롤백`:c?`v${c.version} 설치`:'설치할 버전 없음';};
   select.addEventListener('change',refresh);refresh();
   if(!info.packaged)root.append(element('p','','개발본은 자동 교체·정리하지 않습니다. GitHub 배포판에서 사용할 수 있습니다.'));
  }catch(e){status.textContent='버전 목록을 확인하지 못했습니다. '+String(e.message||e);}
 });
}
