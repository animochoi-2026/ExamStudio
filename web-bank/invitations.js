const TOKEN_KEY='bank-pending-invite';
const TOKEN_RE=/^[A-Za-z0-9_-]{43}$/;
const labelStatus={active:'전달·수락 대기',requested:'승인 대기',accepted:'참여 완료',cancelled:'취소됨'};
const $=id=>document.getElementById(id);

export function captureInvitation(){
 const match=location.hash.match(/^#invite\/([A-Za-z0-9_-]{43})$/);
 if(match){sessionStorage.setItem(TOKEN_KEY,match[1]);history.replaceState({},'',location.pathname+location.search);}
 return sessionStorage.getItem(TOKEN_KEY);
}
export function pendingInvitation(){const token=sessionStorage.getItem(TOKEN_KEY);return TOKEN_RE.test(token||'')?token:null;}
export function forgetInvitation(){sessionStorage.removeItem(TOKEN_KEY);}
export function invitationLink(token){return location.origin+location.pathname+'#invite/'+token;}
export async function newInvitationSecret(){
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 const token=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 return {token,hash};
}
export async function hashInvitation(token){
 if(!TOKEN_RE.test(token||''))throw Error('초대 링크가 올바르지 않습니다.');
 const base64=token.replace(/-/g,'+').replace(/_/g,'/')+'=';
 const bytes=Uint8Array.from(atob(base64),x=>x.charCodeAt(0));
 if(bytes.length!==32)throw Error('초대 링크가 올바르지 않습니다.');
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}

export async function inviteMail(client,id,token){
 const {data,error}=await client.functions.invoke('bank-invite-mail',{body:{inviteId:id,token}});
 if(error){let detail='';try{detail=(await error.context?.json?.())?.error||'';}catch{}throw Error(detail||error.message||'메일 발송 요청 실패');}
 return data;
}

export function showInviteWelcome({node,action,login,logout,client,rpc,session,message,user}){
 const token=pendingInvitation();if(!token)return false;
 $('welcome').hidden=false;$('welcome').replaceChildren();const box=node('section','','invite-welcome');
 box.append(node('h2','문제공방 공동 문제은행 초대'),node('p','선생님이 자기 Google 계정으로 참여하는 비공개 문제은행입니다. 링크를 여는 것만으로 가입되지 않습니다.'));
 if(!user){
  box.append(node('p','초대받은 이메일이 지정되었다면 그 계정으로 로그인하세요. 카카오톡 안에서 로그인이 막히면 아래 링크를 복사해 Chrome·Safari 등 외부 브라우저에서 여세요.','hint'),action('내 Google 계정으로 로그인',login,true));
 }else{
  box.append(node('p','현재 계정: '+user.email,'hint'),action('참여하기 / 승인 신청',async()=>{
   const result=await rpc('bank_invite_accept',{token_digest:await hashInvitation(token)});
   const state=result?.status;
   if(state==='joined'||state==='already_member'){forgetInvitation();message(state==='joined'?'참여가 완료됐습니다.':'이미 참여 중인 계정입니다.');await session();return;}
   const info={pending:'관리자 승인 신청이 접수됐습니다. 승인 전에는 문항을 볼 수 없습니다.',email_mismatch:'초대받은 이메일과 현재 계정이 다릅니다. 계정을 바꿔 로그인하세요.',blocked:'이용이 중지된 계정입니다. 관리자에게 문의하세요.',claimed:'이미 다른 계정의 신청이 진행 중입니다. 관리자에게 문의하세요.',unavailable:'초대가 만료·취소됐거나 이미 사용됐습니다. 새 링크를 요청하세요.',rate_limited:'시도 횟수가 많습니다. 15분 뒤 다시 시도하세요.'}[state]||'초대 상태를 다시 확인하세요.';
   message(info,state!=='pending');
  },true),action('승인 상태 다시 확인',session),action('다른 계정으로 로그인',logout));
 }
 box.append(action('초대 링크 복사',async()=>{await navigator.clipboard.writeText(invitationLink(token));message('초대 링크를 복사했습니다. 외부 브라우저에 붙여넣을 수 있습니다.');}));
 $('welcome').append(box);return true;
}

export async function showMemberManager({client,config,member,clear,node,field,action,rpc,rows,message,navigate}){
 if(member?.role!=='owner')throw Error('관리자 전용입니다.');
 const root=clear('멤버 관리');root.append(node('p','참여 중인 교사와 초대·신청 상태를 관리합니다. 새 링크는 7일간 한 사람에게만 유효합니다.','lead'));
 const form=node('section','','panel invite-form');form.append(node('h3','초대하기'));
 const name=field(form,'이름 또는 관리 메모 (선택)'),email=field(form,'참여 이메일 (선택)','', 'email');
 const methodWrap=node('label'),method=node('select');methodWrap.append(node('span','전달 방식'));for(const [value,label] of [['copy','링크 복사 · 카카오톡 등'],['email','이메일 발송']]){const option=node('option',label);option.value=value;method.append(option);}methodWrap.append(method);form.append(methodWrap);
 form.append(node('p','이메일을 지정하면 그 Google 계정만 즉시 참여합니다. 비워 두면 신청 후 관리자 승인으로 참여합니다. 신규 역할은 일반 교사입니다.','hint'));
 const result=node('div','','invite-result');form.append(action('초대 링크 만들기',async()=>{
  const address=email.value.trim().toLowerCase();if(method.value==='email'&&!address)throw Error('이메일 발송에는 받을 이메일이 필요합니다.');
  const {token,hash}=await newInvitationSecret();const id=await rpc('bank_invite_create',{s:config.spaceId,token_digest:hash,email_address:address||null,note_text:name.value.trim()||null});
  await created({client,id,token,email:address,result,node,action,message,send:method.value==='email',onChange:refreshLists});await refreshLists();
 },true),result);const listing=node('div');root.append(form,listing);
 async function refreshLists(){listing.replaceChildren();
 const [members,invites]=await Promise.all([rows('bank_members',{space_id:config.spaceId}),rows('bank_invitations',{space_id:config.spaceId})]);
 const active=members.filter(m=>m.enabled&&m.user_id),waiting=members.filter(m=>m.enabled&&!m.user_id),blocked=members.filter(m=>!m.enabled);
 const ownerCount=members.filter(m=>m.enabled&&m.role==='owner').length;
 async function changeRole(m,next){
  if(!Number.isSafeInteger(m.role_version))throw Error('권한 변경 기능을 사용할 수 없습니다. 관리자에게 문의하세요.');
  const label={owner:'관리자',reviewer:'검수자',teacher:'일반 교사'};
  const impact=next==='owner'?'현재 관리자와 같은 권한으로 멤버 승인·차단과 역할 변경, 공동 검수, 일괄 유지보수를 할 수 있습니다.':'변경 후 '+label[next]+' 권한이 적용됩니다.';
  if(!confirm(`대상: ${m.email}\n${label[m.role]} → ${label[next]}\n${impact}\n이 변경은 감사 기록에 남습니다. 적용할까요?`))return;
  await rpc('bank_change_member_role',{s:config.spaceId,email_address:m.email,new_role:next,expected_version:m.role_version,confirmation_email:m.email});
  message(m.email+' 계정의 역할을 '+label[next]+'로 변경했습니다.');await navigate('members',{replace:true});
 }
 function section(title,items,render,empty){const section=node('section','','member-section');section.append(node('h3',`${title} · ${items.length}`));if(!items.length)section.append(node('p',empty,'hint'));for(const item of items)section.append(render(item));listing.append(section);}
 function memberRow(m){const row=node('div','','member-row');row.append(node('strong',[m.display_name,m.email].filter(Boolean).join(' · ')),node('small',`${({owner:'관리자',reviewer:'검수자',teacher:'일반 교사'})[m.role]||m.role} · ${m.enabled?'이용 가능':'이용 중지'} · ${m.joined_at?new Date(m.joined_at).toLocaleDateString('ko-KR'):'참여 날짜 기록 없음'}`));
  if(m.role!=='owner'){
   const controls=node('div','','actions');controls.append(action(m.enabled?'이용 중지':'이용 재개',async()=>{if(!confirm(`${m.email}의 공동 문제은행 이용 상태를 바꿀까요?`))return;await rpc('bank_invite',{s:config.spaceId,email_address:m.email,enabled_value:!m.enabled});await navigate('members',{replace:true});}));
   if(m.enabled){controls.append(action(m.role==='reviewer'?'일반 교사로 변경':'검수자로 지정',()=>changeRole(m,m.role==='reviewer'?'teacher':'reviewer')));if(m.user_id)controls.append(action('관리자로 지정',()=>changeRole(m,'owner')));}row.append(controls);
  }else if(ownerCount>1&&m.email!==member.email){row.append(action('관리자 권한 해제',()=>changeRole(m,'reviewer')));}
  else if(ownerCount===1)row.append(node('small','마지막 관리자의 권한은 해제할 수 없습니다.','hint'));
  return row;}
 section('참여 중인 교사',active,memberRow,'아직 참여한 교사가 없습니다.');
 section('이메일 직접 승인 · 첫 로그인 대기',waiting,memberRow,'기존 승인 목록에 대기 중인 계정이 없습니다.');
 section('승인 대기 신청',invites.filter(i=>i.status==='requested'&&Date.parse(i.expires_at)>Date.now()),i=>inviteRow(i,true),'승인을 기다리는 신청이 없습니다.');
 section('전달·수락 대기',invites.filter(i=>i.status==='active'&&Date.parse(i.expires_at)>Date.now()),i=>inviteRow(i),'사용 가능한 초대가 없습니다.');
 section('만료·취소·참여 완료',invites.filter(i=>i.status==='cancelled'||i.status==='accepted'||Date.parse(i.expires_at)<=Date.now()),i=>inviteRow(i),'지난 초대가 없습니다.');
 section('이용 중지 회원',blocked,memberRow,'이용이 중지된 회원이 없습니다.');
 }
 await refreshLists();
 function inviteRow(i,approval=false){const row=node('div','','member-row'),expired=Date.parse(i.expires_at)<=Date.now(),state=expired&&i.status!=='accepted'&&i.status!=='cancelled'?'만료':labelStatus[i.status];
  row.append(node('strong',[i.note,i.invited_email||i.claimed_email||'이메일 미지정'].filter(Boolean).join(' · ')),node('small',`일반 교사 · ${state} · 생성 ${new Date(i.created_at).toLocaleDateString('ko-KR')} · 만료 ${new Date(i.expires_at).toLocaleDateString('ko-KR')}`));
  if(i.email_attempts)row.append(node('small',`메일 발송 요청 ${i.email_attempts}회 · ${{provider_accepted:'발송 업체 접수',failed:'발송 실패',sending:'발송 중'}[i.last_email_state]||'발송 안 함'} (수신 확인과 별개)`));
  const controls=node('div','','actions');if(approval)controls.append(action('승인',async()=>{await rpc('bank_invite_decide',{invite_id:i.id,approve:true});await navigate('members',{replace:true});},true),action('거절',async()=>{await rpc('bank_invite_decide',{invite_id:i.id,approve:false});await navigate('members',{replace:true});}));
  if(i.status==='active'||i.status==='requested')controls.append(action('초대 취소',async()=>{if(!confirm('이 링크를 취소할까요? 취소한 링크는 다시 사용할 수 없습니다.'))return;await rpc('bank_invite_cancel',{invite_id:i.id});await navigate('members',{replace:true});}));
  if(i.status!=='accepted')controls.append(action(i.invited_email?'새 링크 발급·메일 다시 보내기':'새 링크 발급',async()=>{
   if(!confirm('이전 링크를 폐기하고 새 링크를 만들까요?'))return;
   const {token,hash}=await newInvitationSecret();const id=await rpc('bank_invite_reissue',{invite_id:i.id,token_digest:hash});await created({client,id,token,email:i.invited_email||'',result,node,action,message,send:!!i.invited_email,onChange:refreshLists});await refreshLists();
   result.scrollIntoView({block:'nearest'});
  }));row.append(controls);return row;}
 return root;
}

async function created({client,id,token,email,result,node,action,message,send,onChange}){
 const link=invitationLink(token),guide=`문제공방 공동 문제은행에 초대합니다.\n7일 안에 아래 링크를 열고 본인 Google 계정으로 참여해 주세요.${email?'\n참여 계정: '+email:''}\n${link}`;
 result.replaceChildren(node('h3','초대 링크가 만들어졌습니다.'),node('p','아직 회원 가입이 완료된 것은 아닙니다. 링크를 안전하게 전달하세요.','hint'));
 const linkField=node('input');linkField.value=link;linkField.readOnly=true;linkField.setAttribute('aria-label','생성된 초대 링크');result.append(linkField);
 const controls=node('div','','actions');controls.append(action('링크 복사',async()=>{await navigator.clipboard.writeText(link);message('초대 링크를 복사했습니다.');}),action('안내문과 링크 복사',async()=>{await navigator.clipboard.writeText(guide);message('안내문과 링크를 복사했습니다.');}));
 if(email)controls.append(action('이메일로 보내기',async()=>{const data=await inviteMail(client,id,token);result.append(node('p',data?.status==='provider_accepted'?'발송 업체가 요청을 접수했습니다. 실제 수신 여부는 별도로 확인하세요.':'메일 발송 설정이 없습니다. 링크를 복사해 직접 전달할 수 있습니다.',data?.status==='provider_accepted'?'hint':'error'));}));
 controls.append(action('초대 취소',async()=>{const {error}=await client.rpc('bank_invite_cancel',{invite_id:id});if(error)throw Error(error.message);result.replaceChildren(node('p','초대를 취소했습니다. 이전 링크는 사용할 수 없습니다.'));await onChange?.();}));result.append(controls);
 if(send)try{const data=await inviteMail(client,id,token);result.append(node('p',data?.status==='provider_accepted'?'발송 업체가 요청을 접수했습니다. 실제 수신 여부는 별도로 확인하세요.':'메일 발송 설정이 없습니다. 링크를 복사해 직접 전달하세요.','hint'));}catch(e){result.append(node('p','발송 실패: '+e.message+' · 링크 복사는 계속 사용할 수 있습니다.','error'));}
}
