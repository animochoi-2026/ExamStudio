export async function securityPage({member,root,rpc,config,node,action,field}){
 if(member?.role!=='owner')throw Error('접근할 수 없습니다.');
 let start=0;
 const filters=node('section','','panel'),results=node('div');
 const email=field(filters,'사용자 ID (선택)','','text'),code=field(filters,'식별자 (선택)','','text'),revision=field(filters,'문항 버전 ID (선택)','','text'),from=field(filters,'시작 날짜','','date'),to=field(filters,'종료 날짜 (미포함)','','date');
 root.append(node('p','공식 다운로드의 파일 저장 승인 기록입니다. 기기의 저장 완료를 확인한 기록은 아닙니다. 미리보기·열람은 집계하지 않습니다.','hint'),filters,results);
 filters.append(action('조회',()=>{start=0;return load();}));
 async function load(){
  const data=await rpc('bank_security_overview',{s:config.spaceId,start_at:start,target_user:email.value.trim()||null,watermark_code:code.value.trim()||null,revision:revision.value.trim()||null,from_at:from.value?new Date(from.value).toISOString():null,to_at:to.value?new Date(to.value).toISOString():null});
  results.replaceChildren();const settings=node('section','','panel'),threshold=field(settings,'자동 차단 비율 (%)',data.settings.threshold,'number'),enabled=node('input');enabled.type='checkbox';enabled.checked=data.settings.enabled;
  const label=node('label','자동 차단 사용 ');label.append(enabled);settings.append(label,node('p',`현재 공개 원본 시험지 ${data.sourceTotal}개 기준. 발췌 문항도 연결된 원본 시험지 1개로 계산합니다. 누적 기록은 초기화하지 않습니다. 오너는 자동 차단에서 제외합니다.`,'hint'),action('설정 저장',async()=>{await rpc('bank_security_configure',{s:config.spaceId,threshold_percent:Number(threshold.value),active:enabled.checked,expected:data.settings.version});await load();}));results.append(settings);
  for(const u of data.users){const box=node('section','','panel');box.append(node('h3',u.email||'계정 삭제됨'),node('p',`식별자 ${u.identifier} · 승인 요청 ${u.downloads}회 · 원본 ${u.sources}/${data.sourceTotal}개 (${data.sourceTotal?(100*u.sources/data.sourceTotal).toFixed(1):'0'}%) · ${u.blocked?'이용 제한':'정상'}`));box.append(action('이 사용자 기록',()=>{email.value=u.userId;start=0;return load();}));if(u.blocked){const extra=field(box,'추가 허용 원본 시험지 수',1,'number'),reason=field(box,'해제 사유','','text');box.append(action('차단 해제',async()=>{if(!confirm('기록을 보존하고 지정한 추가 시험지 수까지 허용할까요?'))return;await rpc('bank_security_unblock',{s:config.spaceId,target_user:u.userId,extra_sources:Number(extra.value),reason_text:reason.value});await load();}));}results.append(box);}
  const states={requested:'파일 생성 대기',authorized:'파일 저장 승인',failed:'생성 실패·만료',blocked:'차단'};
  results.append(node('h3','다운로드 기록'));
  for(const d of data.downloads){const row=node('details','','panel');row.append(node('summary',`${new Date(d.requested_at).toLocaleString('ko-KR')} · ${d.format.toUpperCase()} · ${states[d.state]||d.state}`),node('p','사용자: '+d.user_id),node('p','시험지: '+(d.exam_id||'미저장 구성')),node('p','원본 시험지: '+d.source_ids.join(', ')),node('p','문항: '+d.question_ids.join(', ')),node('p','문항 버전: '+d.revision_ids.join(', ')));results.append(row);}
  if(!data.downloads.length)results.append(node('p','조건에 맞는 기록이 없습니다.'));
  const previous=action('이전 50개',()=>{start=Math.max(0,start-50);return load();}),next=action('다음 50개',()=>{start+=50;return load();});previous.disabled=start===0;next.disabled=data.downloads.length<50;results.append(previous,node('span',` ${start/50+1}페이지 `),next,node('h3','최근 설정·차단 처리'));
  for(const e of data.events||[])results.append(node('p',`${new Date(e.created_at).toLocaleString('ko-KR')} · ${e.event} · ${e.user_id||''} · ${JSON.stringify(e.details)}`));
 }
 await load();
}
