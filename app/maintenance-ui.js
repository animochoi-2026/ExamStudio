export function installMaintenanceUI({api,state,element,button,openDialog,guarded,toast,loadProject,renderAll,blocked}) {
 const entry=button('데이터 관리 · 백업 / 복구','button outline compact',guarded(show));entry.id='dataMaintenance';document.getElementById('promptSettingsButton').before(entry);
 const size=n=>n>=1024*1024?(n/1024/1024).toFixed(1)+' MB':Math.ceil(n/1024)+' KB';
 async function show(){
  if(blocked()||state.editor){toast('진행 중인 작업과 문구 편집을 마친 뒤 데이터 관리를 열어 주세요.');return;}
  const root=openDialog('데이터 관리','기존 문제와 대화는 보존합니다');
  root.append(element('p','','누락 자료를 다시 연결하거나 작업 전체를 백업할 수 있습니다. 정리는 선택한 항목만 처리하며, 먼저 전체 작업을 data/backups에 복사합니다. 백업 폴더를 data/projects 아래로 복사하면 복원할 수 있습니다.'));
  const select=element('select'),area=element('div');select.id='maintenanceProject';root.append(select,area);
  let info=await api.maintenanceInfo(),chosen=state.project?.id;
  for(const p of info.projects){const o=element('option','',p.title+(p.error?' · 읽기 오류':''));o.value=p.id;select.append(o);}select.value=info.projects.some(p=>p.id===chosen)?chosen:info.projects[0]?.id||'';
  async function draw(){
   area.replaceChildren();const p=info.projects.find(p=>p.id===select.value);if(!p){area.append(element('p','','저장된 작업이 없습니다.'));return;}
   if(p.error){area.append(element('p','review-notice','작업을 읽지 못했습니다. 원본 파일은 보존되어 있습니다. '+p.error));return;}
   for(const missing of p.missing){const row=element('p','review-notice',missing.name+' · 자료 누락 ');row.append(button('자료 다시 연결','button compact outline',guarded(async()=>{
    await mutate({action:'reconnect',projectId:p.id,name:missing.name});
   })));area.append(row);}
   const summary=element('p'),history=element('input'),unused=element('input');history.type=unused.type='checkbox';history.id='cleanupHistories';unused.id='cleanupAssets';
   for(const [input,text] of [[history,'이전 인식·수정 이력과 삭제한 유사문제 보관분 정리'],[unused,'현재 내용과 남길 이력에서 사용하지 않는 영역 이미지 정리']]){const label=element('label','batch-choice');label.append(input,document.createTextNode(text));area.append(label);}
   area.append(element('p','editor-hint','현재 원문·풀이·유사문제·대화·규칙·실행 요청 기록은 유지합니다. 체크하지 않은 항목은 정리하지 않습니다.'),summary);
   const details=element('details');details.append(element('summary','','정리 대상 파일 보기'));const listing=element('pre','request-preview');details.append(listing);area.append(details);
   const consent=element('input');consent.type='checkbox';consent.id='cleanupConsent';const consentLabel=element('label','batch-choice');consentLabel.append(consent,document.createTextNode('위 목록을 확인했으며 백업 후 선택 항목을 정리합니다.'));area.append(consentLabel);
   let preview,revision=0;
   const clean=button('백업 후 선택 항목 정리','button primary',guarded(async()=>{if(!consent.checked||!preview)return;await mutate({action:'cleanup',projectId:p.id,options:preview.options,token:preview.token});}));clean.id='cleanupProject';
   async function refresh(){const rev=++revision;clean.disabled=true;consent.checked=false;const result=await api.maintenanceInfo({projectId:p.id,options:{histories:history.checked,unusedAssets:unused.checked}});if(rev!==revision)return;preview=result.plan;summary.textContent=`작업 용량 ${size(preview.totalBytes)} · 보관 이력 ${preview.historyCount}건 · 미사용 이미지 ${preview.unused.length}개 (${size(preview.cleanupBytes)} 정리 예정)`;listing.textContent=unused.checked?preview.unused.map(f=>`${f.name} · ${size(f.bytes)}`).join('\n')||'정리할 이미지 없음':'이미지 정리를 선택하지 않았습니다.';}
   history.onchange=unused.onchange=guarded(refresh);consent.onchange=()=>clean.disabled=!consent.checked||(!history.checked&&!unused.checked);
   area.append(button('현재 작업 전체 백업','button outline',guarded(()=>mutate({action:'backup',projectId:p.id}))),clean);
   await refresh();
  }
  async function mutate(params){
   if(blocked()||state.editor)return;state.saving=true;renderAll();for(const n of root.querySelectorAll('button,input,select'))n.disabled=true;
   try{const result=await api.maintainProject(params);if(!result)return;
    if(result.project?.id===state.project?.id)await loadProject(result.project);
    const saved=result.backup||result;const message='백업 위치: '+saved.path+(result.warnings?.length?'\n일부 파일을 정리하지 못했습니다: '+result.warnings.join('\n'):'');toast('데이터 관리 작업을 완료했습니다.');root.append(element('p','review-notice',message));
    info=await api.maintenanceInfo();
   }finally{state.saving=false;renderAll();select.disabled=false;await draw();}
  }
  select.onchange=guarded(draw);await draw();
 }
}
