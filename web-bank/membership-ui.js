const managed=role=>role==='owner'||role==='admin';
export async function signupStatus({root,node,action,rpc,config,session}){
 const state=await rpc('bank_signup_request',{s:config.spaceId,submit:false});
 if(state.status==='blocked'){root.append(node('p','서비스 이용 권한이 회수된 계정입니다. 반복 신청이나 재로그인으로 이용이 재개되지 않습니다.','error'));return;}
 if(state.status==='approved'){root.append(action('승인된 계정으로 계속하기',session,true));return;}
 if(state.status==='pending')root.append(node('p','가입 신청이 접수되었습니다. 관리자 승인 후 이용할 수 있습니다.','hint'));
 else root.append(action('현재 Google 계정으로 가입신청하기',async()=>{await rpc('bank_signup_request',{s:config.spaceId,submit:true});await session();},true));
 root.append(action('승인 상태 다시 확인',session));
}
export async function requestList({root,node,action,rpc,config,onChange=()=>{}}){
 const list=await rpc('bank_signup_list',{s:config.spaceId});root.replaceChildren(node('h3',`가입 승인 대기 · ${list.length}명`));
 if(!list.length)root.append(node('p','승인을 기다리는 가입 신청이 없습니다.','hint'));
 for(const r of list){const row=node('div','','member-row');row.append(node('span',r.email),node('small',new Date(r.createdAt).toLocaleString('ko-KR')+' · 승인 대기'),action('일반강사로 승인',async()=>{
  if(!confirm(r.email+' 계정의 가입을 일반강사로 승인할까요?'))return;
  if(r.kind==='invite')await rpc('bank_invite_decide',{invite_id:r.id,approve:true});else await rpc('bank_signup_approve',{s:config.spaceId,target_user:r.userId});
  await requestList({root,node,action,rpc,config,onChange});await onChange();
 }));root.append(row);}
 return list;
}
const shown=new Map();
export function resetRequestNotices(){shown.clear();}
export async function pendingPopup(ctx){if(!managed(ctx.member.role))return;const list=await ctx.rpc('bank_signup_list',{s:ctx.config.spaceId}),key=ctx.user.id+':'+ctx.config.spaceId,signature=list.map(x=>x.kind+':'+(x.id||x.userId)).sort().join('|');if(!signature||shown.get(key)===signature)return;shown.set(key,signature);const d=ctx.node('dialog','','membership-dialog'),body=ctx.node('div');d.append(ctx.action('닫기',()=>d.close()),body,ctx.action('회원 관리에서 확인',()=>{d.close();ctx.navigate('members');}));document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});await requestList({...ctx,root:body});d.showModal();}
export async function membershipPage(ctx){const {member,clear,node,action,rpc,config}=ctx;if(!managed(member.role))throw Error('회원 관리 권한이 없습니다.');const root=clear('회원 관리'),requests=node('section'),members=node('section');root.append(node('p',member.role==='owner'?'가입 승인과 회원 권한을 관리합니다. 고정 오너 지정은 회원 관리에서 변경할 수 없습니다.':'가입 승인과 일반강사 이용 권한 회수만 할 수 있습니다.','hint'),requests,members);
 async function loadMembers(){members.replaceChildren(node('h3','회원 목록'));const list=await rpc('bank_members_manage',{s:config.spaceId});for(const m of list){const row=node('div','','member-row'),controls=node('div','','actions');row.append(node('span',m.email),node('small',({owner:'오너',admin:'관리자',teacher:'일반강사'})[m.role]+' · '+(m.enabled?'이용 가능':'이용 중지')));
 if(m.enabled&&m.userId&&m.role!=='owner'){controls.append(action('이용 권한 회수',async()=>{if(!confirm(m.email+'의 서비스 이용 권한을 회수할까요? 문항·시험지·이력은 보존됩니다.'))return;await rpc('bank_member_revoke',{s:config.spaceId,target_user:m.userId,expected_version:m.roleVersion});await loadMembers();}));
 if(member.role==='owner')controls.append(action(m.role==='admin'?'일반강사로 변경':'관리자로 지정',async()=>{const next=m.role==='admin'?'teacher':'admin';if(!confirm(m.email+'의 역할을 '+(next==='admin'?'관리자':'일반강사')+'로 변경할까요?'))return;await rpc('bank_change_member_role',{s:config.spaceId,email_address:m.email,new_role:next,expected_version:m.roleVersion,confirmation_email:m.email});await loadMembers();}));}
 row.append(controls);members.append(row);}}
 await requestList({...ctx,root:requests,onChange:loadMembers});await loadMembers();root.append(action('새로고침',()=>membershipPage(ctx)));return root;
}
