export function eventText(event){
 const d=event.details||{};
 if(event.event==='deployment_enabled')return `보안 기능을 처음 켰습니다. 자동 차단 기준 ${d.threshold}%`;
 if(event.event==='configure')return `자동 차단을 ${d.enabled?'켰습니다':'껐습니다'}. 기준 ${d.threshold}%`;
 if(event.event==='auto_block')return `다운로드 범위가 기준에 도달해 이용을 제한했습니다. 원본 ${d.projected}/${d.total}개 · 기준 ${d.threshold}%`;
 if(event.event==='unblock')return `이용 제한을 해제했습니다. 누적 원본 ${d.allowUntilCount}개까지 허용 · 사유: ${d.reason||'기록 없음'}`;
 return '보안 처리 기록 (상세 정보 확인 필요)';
}
export function dateBoundary(value,nextDay=false){
 if(!value)return null;
 const [y,m,d]=value.split('-').map(Number);
 return new Date(Date.UTC(y,m-1,d+(nextDay?1:0))-9*60*60*1000).toISOString();
}
const time=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'기록 없음';
export async function securityPage({member,root,rpc,config,node,action,field}){
 if(member?.role!=='owner')throw Error('접근할 수 없습니다.');
 let start=0,sequence=0,latest=null;
 const page=node('div','','security-dashboard'),status=node('p','서버에서 현재 상태를 확인하고 있습니다.','hint'),overview=node('section','','panel'),logs=node('section','','panel'),events=node('section','','panel'),people=node('section','','panel');
 status.setAttribute('role','status');
 const toolbar=node('div','','security-toolbar');toolbar.append(status,action('새로고침',()=>load()));
 page.append(toolbar,overview,node('p','보안 기능을 켠 이후의 새 파일 출력부터 기록합니다. 예전 다운로드와 열람·미리보기는 포함하지 않습니다. 페이지를 열거나 새로고침하면 최신 기록을 조회합니다.','hint'),logs,events,people);
 const filters=node('details','','security-filters'),filterBody=node('div','','security-filter-grid');filters.append(node('summary','기록 찾기 · 사용자 / 날짜 / 식별 숫자'),filterBody);
 const userLabel=node('label'),userSelect=node('select');userLabel.append(node('span','사용자'),userSelect);filterBody.append(userLabel);
 const code=field(filterBody,'문서의 식별 숫자','','text'),from=field(filterBody,'시작 날짜 (한국 시간)','','date'),to=field(filterBody,'종료 날짜 (해당 날짜 포함)','','date');code.inputMode='numeric';code.placeholder='예: 0042';
 const advanced=node('details');advanced.append(node('summary','고급 검색'));const revision=field(advanced,'문항 버전 ID','','text');filterBody.append(advanced);
 const filterActions=node('div','','security-actions');filterActions.append(action('기록 찾기',()=>{start=0;return load();}),action('전체 기록 보기',()=>{userSelect.value='';code.value='';from.value='';to.value='';revision.value='';start=0;return load();}));filters.append(filterActions);
 const logRows=node('div'),pager=node('div','','security-actions');logs.append(node('h3','최근 다운로드'),node('p','파일 제공을 서버에서 허용한 기록입니다. 기기에 저장 완료된 사실을 확인한 것은 아닙니다.','hint'),filters,logRows,pager);
 const settings=node('details','','panel security-settings');settings.append(node('summary','자동 차단 설정 변경'));const settingsBody=node('div');settings.append(settingsBody);page.append(settings);root.append(page);
 function userName(id,users){return users.find(u=>u.userId===id)?.email||'현재 계정 정보를 찾을 수 없음';}
 function technical(row,items){const detail=node('details','','security-technical');detail.append(node('summary','관리용 상세 정보'));for(const [label,value]of items)if(value)detail.append(node('p',label+': '+value));row.append(detail);}
 async function load(){
  const request=++sequence;status.textContent='서버에서 최신 기록을 조회하고 있습니다…';
  try{
   if(from.value&&to.value&&from.value>to.value)throw Error('종료 날짜를 시작 날짜 이후로 선택하세요.');
   const selected=userSelect.value,codeValue=code.value.trim(),rev=revision.value.trim();
   const all=await rpc('bank_security_overview',{s:config.spaceId});
   const filtered=selected||codeValue||rev||from.value||to.value||start;
   const data=filtered?await rpc('bank_security_overview',{s:config.spaceId,start_at:start,target_user:selected||null,watermark_code:codeValue||null,revision:rev||null,from_at:dateBoundary(from.value),to_at:dateBoundary(to.value,true)}):all;
   if(request!==sequence||!page.isConnected)return;
   latest=all;status.textContent=`최근 조회: ${time(new Date())} · 한국 시간`;
   userSelect.replaceChildren();const blank=node('option','전체 사용자');blank.value='';userSelect.append(blank);for(const u of all.users){const option=node('option',u.email||'계정 삭제됨');option.value=u.userId;userSelect.append(option);}userSelect.value=selected;
   const blocked=all.users.filter(u=>u.blocked),successful=all.users.reduce((n,u)=>n+Number(u.downloads||0),0);
   overview.replaceChildren(node('h3','현재 보안 상태'));const grid=node('div','','security-stat-grid');
   for(const [label,value]of [['자동 차단',all.settings.enabled?`켜짐 · ${all.settings.threshold}%`:'꺼짐'],['현재 이용 제한',`${blocked.length}명`],['누적 파일 제공 승인',`${successful}회`],['원본 시험지',`${all.sourceTotal}개`]]){const card=node('div');card.append(node('span',label),node('strong',value));grid.append(card);}overview.append(grid,node('p',blocked.length?'이용 제한된 사용자는 아래 사용자 현황에서 확인하세요.':'현재 보안 기능으로 이용이 제한된 사용자는 없습니다.','hint'));
   logRows.replaceChildren();const states={requested:'파일 생성 요청 · 결과 미확인',authorized:'파일 제공 승인',failed:'파일 생성 실패 또는 요청 만료',blocked:'이용 제한 · 파일 제공 안 함'};
   for(const d of data.downloads){const row=node('article','','security-record');row.append(node('strong',`${userName(d.user_id,all.users)} · ${d.format.toUpperCase()}`),node('p',`${states[d.state]||'처리 상태 확인 필요'} · ${time(d.requested_at)}`),node('p',`${d.question_ids.length}문항 · 원본 시험지 ${d.source_ids.length}개${d.kind==='backup'?' · 원본 보관용 백업':''}`));technical(row,[['저장 시험지 ID',d.exam_id],['원본 시험지 ID',d.source_ids.join(', ')],['문항 ID',d.question_ids.join(', ')],['문항 버전 ID',d.revision_ids.join(', ')]]);logRows.append(row);}
   if(!data.downloads.length)logRows.append(node('p',filtered?'선택한 조건에 맞는 다운로드 기록이 없습니다. 전체 기록 보기로 조건을 해제할 수 있습니다.':'아직 다운로드 요청이 기록되지 않았습니다. 새 버전 웹·앱에서 PDF·DOCX·HWPX 파일을 출력하면 여기에 표시됩니다.','security-empty'));
   pager.replaceChildren();if(start||data.downloads.length===50){const prev=action('이전',()=>{start=Math.max(0,start-50);return load();}),next=action('다음',()=>{start+=50;return load();});prev.disabled=start===0;next.disabled=data.downloads.length<50;pager.append(prev,node('span',`${start/50+1}페이지 · 페이지당 최대 50건`),next);}
   events.replaceChildren(node('h3','최근 설정 변경·차단 처리'),node('p','다운로드 목록과 별개의 보안 설정·이용 제한 기록입니다. 최근 50건을 표시합니다.','hint'));
   for(const e of all.events||[]){const row=node('article','','security-record');row.append(node('p',eventText(e)),node('small',time(e.created_at)));if(e.user_id)row.append(node('p',userName(e.user_id,all.users)));events.append(row);}if(!all.events?.length)events.append(node('p','아직 설정 변경·차단 기록이 없습니다.'));
   people.replaceChildren(node('h3','사용자별 다운로드 현황'));if(!all.users.length)people.append(node('p','첫 다운로드 요청 후 사용자별 누적량과 식별 숫자가 표시됩니다. 가입 회원 전체 목록은 회원 관리에서 확인하세요.'));
   for(const u of [...all.users].sort((a,b)=>Number(b.blocked)-Number(a.blocked))){const row=node('article','','security-record');row.append(node('strong',u.email||'계정 삭제됨'),node('p',`${u.blocked?'이용 제한 중':'이용 가능'} · 파일 제공 승인 ${u.downloads}회 · 원본 ${u.sources}/${all.sourceTotal}개 (${all.sourceTotal?(100*u.sources/all.sourceTotal).toFixed(1):'0'}%)`),node('p',`문서 식별 숫자: ${u.identifier}`),action('이 사용자의 다운로드 보기',()=>{userSelect.value=u.userId;code.value='';revision.value='';from.value='';to.value='';start=0;filters.open=true;logs.scrollIntoView({block:'start'});return load();}));if(u.blocked){const extra=field(row,'추가로 허용할 원본 시험지 수',1,'number'),reason=field(row,'해제 사유','','text');row.append(action('이용 제한 해제',async()=>{if(!confirm('기존 기록을 보존하고 지정한 추가 시험지 수까지 허용할까요?'))return;await rpc('bank_security_unblock',{s:config.spaceId,target_user:u.userId,extra_sources:Number(extra.value),reason_text:reason.value});await load();}));}people.append(row);}
   settingsBody.replaceChildren();const threshold=field(settingsBody,'자동 차단 기준 (%)',all.settings.threshold,'number');threshold.min='0.01';threshold.max='100';threshold.step='0.01';const enabled=node('input');enabled.type='checkbox';enabled.checked=all.settings.enabled;const label=node('label','자동 차단 사용 ');label.append(enabled);settingsBody.append(label,node('p',`현재 공개 원본 시험지 ${all.sourceTotal}개 중 누적 다운로드 비율이 기준 이상이 되면 해당 요청을 제공하지 않고 이용을 제한합니다. 같은 원본은 중복 집계하지 않으며 발췌 문항도 원본 1개로 계산합니다. 오너는 자동 차단에서 제외됩니다.`,'hint'),action('설정 저장',async()=>{if(!confirm(`자동 차단 ${enabled.checked?'사용':'중지'}, 기준 ${threshold.value}%로 저장할까요?`))return;await rpc('bank_security_configure',{s:config.spaceId,threshold_percent:Number(threshold.value),active:enabled.checked,expected:all.settings.version});await load();}));
  }catch(e){if(request!==sequence||!page.isConnected)return;status.textContent=`최신 기록을 불러오지 못했습니다. ${latest?'아래는 직전에 조회한 내용입니다. ':''}새로고침으로 다시 시도하세요. (${e.message||e})`;status.className='error';return;}
  status.className='hint';
 }
 await load();
}
