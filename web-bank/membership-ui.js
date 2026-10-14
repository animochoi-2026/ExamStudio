import {pagedMembers} from './paged-members.js';
import {profileFields,groupManager} from './member-profile.js';
const managed=role=>role==='owner'||role==='admin';
export async function signupStatus({root,node,action,rpc,config,session}){
 const state=await rpc('bank_signup_request',{s:config.spaceId,submit:false});
 if(state.status==='blocked'){root.append(node('p','서비스 이용 권한이 회수된 계정입니다. 반복 신청이나 재로그인으로 이용이 재개되지 않습니다.','error'));return;}
 if(state.status==='approved'){root.append(action('승인된 계정으로 계속하기',session,true));return;}
 if(state.status==='pending')root.append(node('p','가입 신청이 접수되었습니다. 관리자 승인 후 이용할 수 있습니다.','hint'));
 else {const profile=profileFields({node,rpc,initial:await rpc('bank_profile_get',{})});root.append(profile.element);root.append(action('현재 Google 계정으로 가입신청하기',async()=>{await profile.save();await rpc('bank_signup_request',{s:config.spaceId,submit:true});await session();},true));}
 root.append(action('승인 상태 다시 확인',session));
}
export async function requestList({root,node,action,rpc,config,onChange=()=>{},initialList}){
 root.replaceChildren(node('p','가입 신청을 불러오고 있습니다.','hint'));
 let list;
 try{list=initialList??await rpc('bank_signup_list',{s:config.spaceId});}
 catch(e){root.replaceChildren(node('p','가입 신청을 불러오지 못했습니다. '+(e.message||e),'error'),action('다시 불러오기',()=>requestList({root,node,action,rpc,config,onChange})));return;}
 root.replaceChildren(node('h3',`가입 승인 대기 · ${list.length}명`));
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
export async function pendingPopup(ctx){
 if(!managed(ctx.member.role))return;
 const list=await ctx.rpc('bank_signup_list',{s:ctx.config.spaceId}),key=ctx.user.id+':'+ctx.config.spaceId,signature=list.map(x=>x.kind+':'+(x.id||x.userId)).sort().join('|');
 if(!signature||shown.get(key)===signature)return;
 const d=ctx.node('dialog','','membership-dialog member-list-dialog'),heading=ctx.node('div','','member-dialog-heading'),body=ctx.node('div');
 d.setAttribute('aria-label','가입 신청 알림');heading.append(ctx.node('h3','새 가입 신청'),ctx.action('닫기',()=>d.close()));
 d.append(heading,body,ctx.action('회원 관리에서 확인',()=>{d.close();ctx.navigate('members');}));document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});
 d.showModal();shown.set(key,signature);
 // Reuse the list that triggered this notice: a second fetch could fail before showModal.
 await requestList({...ctx,root:body,initialList:list});
}
export const memberListPopup=pagedMembers;
export function managementTools({member,root,node,action,security,invitations,maintenance}){
 if(member.role!=='owner')return;
 const section=node('section','','panel owner-management-tools'),links=node('div','','owner-management-links');section.append(node('h3','관리 도구'));
 for(const [label,description,handler]of [['보안 로그·설정','다운로드 기록과 이용 제한 확인',security],['초대 링크 관리','가입 초대 링크 발급·관리',invitations],['문항 관리 · 일괄 업데이트','문항 일괄 작업과 처리 기록 확인',maintenance]]){const button=action(label,handler);button.append(node('small',description));links.append(button);}
 section.append(links);root.append(section);
}
export async function membershipPage(ctx){
 const {member,clear,node,action}=ctx;if(!managed(member.role))throw Error('회원 관리 권한이 없습니다.');
 const root=clear('회원 관리'),requests=node('section','','panel membership-requests'),toolbar=node('div','','member-page-actions');
 root.append(node('p',member.role==='owner'?'가입 승인과 회원 권한을 관리합니다. 고정 오너 지정은 회원 관리에서 변경할 수 없습니다.':'소속 그룹의 회원 초대·승인·이용 권한 회수와 모의고사 삭제를 할 수 있습니다.','hint'));
 toolbar.append(action('회원 목록 보기',()=>memberListPopup(ctx)),action('가입 신청 새로고침',()=>requestList({...ctx,root:requests})));root.append(toolbar,requests);
 await groupManager({...ctx,root});await requestList({...ctx,root:requests});return root;
}
