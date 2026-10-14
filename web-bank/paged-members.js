import {listPagination} from './list-pagination.js';
export async function pagedMembers(ctx){
 const {member,node,action,rpc,config}=ctx;
 if(!['owner','admin'].includes(member.role))throw Error('회원 관리 권한이 없습니다.');
 const existing=document.querySelector('dialog.member-list-dialog');if(existing?.open){existing.focus();return;}
 const dialog=node('dialog','','membership-dialog member-list-dialog'),heading=node('div','','member-dialog-heading'),title=node('h3','회원 목록'),body=node('div','','member-dialog-body'),filters=node('div','','member-list-filters');
 title.id='member-list-title';dialog.setAttribute('aria-labelledby',title.id);const close=action('닫기',()=>dialog.close());heading.append(title,close);dialog.append(heading,filters,body);document.body.append(dialog);
 let sequence=0,offset=0,timer;dialog.addEventListener('close',()=>{sequence++;clearTimeout(timer);dialog.remove();},{once:true});dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});dialog.showModal();close.focus();
 const search=node('input');search.type='search';search.placeholder='이름·학원명·이메일 검색';search.setAttribute('aria-label',search.placeholder);const group=node('select');group.setAttribute('aria-label','회원 그룹 필터');
 filters.append(search,group);for(const [id,name]of [['','전체 그룹'],['unassigned','미배정']]){const o=node('option',name);o.value=id;group.append(o);}
 search.oninput=()=>{clearTimeout(timer);sequence++;body.inert=true;timer=setTimeout(()=>{offset=0;load();},250);};group.onchange=()=>{offset=0;load();};
 async function load(){clearTimeout(timer);const request=++sequence;body.inert=false;body.setAttribute('aria-busy','true');body.replaceChildren(node('p','회원 목록을 불러오는 중입니다.','hint'));
  try{const data=await rpc('bank_members_page',{s:config.spaceId,filters:{text:search.value.trim(),group:group.value},start_at:offset});if(!dialog.open||request!==sequence)return;offset=data.startAt;title.textContent=`회원 목록 · ${data.total}명`;body.replaceChildren();
   for(const m of data.items){const row=node('article','','member-row member-compact'),top=node('div','','member-compact-top'),controls=node('div','','member-compact-actions');top.append(node('strong',`${m.name||'이름 미입력'} · ${m.academy||'학원명 미입력'}`));
    if(member.role==='owner'&&m.userId)top.append(action('프로필 수정',async()=>{const name=prompt('이름',m.name||'');if(name===null)return;const academy=prompt('학원명',m.academy||'');if(academy===null)return;await rpc('bank_member_profile_set',{s:config.spaceId,target_user:m.userId,full_name:name,academy});await load();}));
    row.append(top,node('span',m.email,'member-email'),node('small',`${({owner:'오너',admin:'관리자',teacher:'일반강사'})[m.role]} · ${m.enabled?'이용 가능':'이용 중지'} · 소속 그룹: ${m.groupName||'미배정'}`));
    if(m.enabled&&m.userId&&m.role!=='owner'&&(member.role==='owner'||m.role==='teacher')){
     controls.append(action('이용 권한 회수',async()=>{if(!confirm(m.email+'의 서비스 이용 권한을 회수할까요? 문항·시험지·이력은 보존됩니다.'))return;await rpc('bank_member_revoke',{s:config.spaceId,target_user:m.userId,expected_version:m.roleVersion});await load();}));
     if(member.role==='owner')controls.append(action(m.role==='admin'?'일반강사로 변경':'관리자로 지정',async()=>{const next=m.role==='admin'?'teacher':'admin';if(!confirm(m.email+'의 역할을 '+(next==='admin'?'관리자':'일반강사')+'로 변경할까요?'))return;await rpc('bank_change_member_role',{s:config.spaceId,email_address:m.email,new_role:next,expected_version:m.roleVersion,confirmation_email:m.email});await load();}));
    }
    if(controls.childElementCount)row.append(controls);body.append(row);
   }
   if(!data.total)body.append(node('p','조건에 맞는 회원이 없습니다.','empty'));
   body.append(listPagination({node,action,total:data.total,offset,onPage:async next=>{offset=next;await load();}}));
  }catch(e){if(dialog.open&&request===sequence)body.replaceChildren(node('p','회원 목록 조회 실패: '+e.message,'error'),action('다시 불러오기',load));}
  finally{if(request===sequence)body.setAttribute('aria-busy','false');}
 }
 try{const groups=await rpc('bank_groups_list',{s:config.spaceId});if(!dialog.open)return;for(const g of groups){const o=node('option',g.name);o.value=g.id;group.append(o);}}catch(e){filters.append(node('p','그룹 필터 조회 실패: '+e.message,'error'));}
 await load();
}
