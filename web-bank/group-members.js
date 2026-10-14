import {listPagination} from './list-pagination.js';
export async function groupMembersPopup(ctx,group,onSaved){
 const {member,node,action,rpc,config}=ctx;if(member.role!=='owner')throw Error('그룹원 지정은 오너만 할 수 있습니다.');
 const d=node('dialog','','membership-dialog group-members-dialog'),heading=node('div','','member-dialog-heading'),body=node('div'),footer=node('div','','group-member-footer'),notice=node('p','','hint');
 d.setAttribute('aria-label',group.name+' 그룹원 지정');let saving=false,sequence=0,offset=0;const edits=new Map();
 const cancel=action('취소',()=>{if(!saving)d.close();});heading.append(node('h3',group.name+' · 그룹원 지정'),cancel);
 const search=node('input');search.type='search';search.placeholder='이름·학원명·이메일 검색';search.setAttribute('aria-label',search.placeholder);
 const save=action('변경사항 저장',async()=>{
  if(saving||!edits.size)return;
  const changes=[...edits.values()],moves=changes.filter(c=>c.selected&&c.expectedGroupId&&c.expectedGroupId!==group.id);
  if(moves.length&&!confirm(moves.map(c=>`${c.name||c.email}: ${c.groupName} → ${group.name}`).join('\n')+'\n기존 그룹에서는 제외됩니다. 이동할까요?'))return;
  saving=true;cancel.disabled=true;body.inert=true;search.disabled=true;notice.textContent='그룹원 변경사항을 저장하고 있습니다.';
  let committed=false;try{await rpc('bank_group_members_save',{s:config.spaceId,g:group.id,changes:changes.map(c=>({userId:c.userId,expectedGroupId:c.expectedGroupId,selected:c.selected,confirmMove:moves.includes(c)}))});committed=true;edits.clear();await onSaved();d.close();}
  catch(e){notice.className='error';notice.textContent=(committed?'저장은 완료했지만 회원 수 새로고침에 실패했습니다. 창을 닫고 다시 확인하세요. ':'저장하지 못했습니다. ')+e.message;}
  finally{saving=false;cancel.disabled=false;body.inert=false;search.disabled=false;save.disabled=!edits.size;}
 },true);save.disabled=true;footer.append(notice,save);d.append(heading,node('p','현재 그룹원부터 표시합니다. 체크 변경은 저장할 때만 적용됩니다.','hint'),search,body,footer);document.body.append(d);
 d.addEventListener('cancel',e=>{if(saving)e.preventDefault();});d.addEventListener('close',()=>{sequence++;edits.clear();d.remove();},{once:true});d.showModal();
 let timer;search.oninput=()=>{clearTimeout(timer);sequence++;body.inert=true;timer=setTimeout(()=>{offset=0;load();},250);};
 function changed(){notice.className='hint';notice.textContent=`저장 전 변경 ${edits.size}명`;save.disabled=!edits.size;}
 async function load(){clearTimeout(timer);
  const request=++sequence;body.inert=false;body.replaceChildren(node('p','회원 목록을 불러오는 중입니다.','hint'));body.setAttribute('aria-busy','true');
  try{const data=await rpc('bank_members_page',{s:config.spaceId,filters:{text:search.value.trim()},start_at:offset,target_group:group.id});if(!d.open||sequence!==request)return;offset=data.startAt;body.replaceChildren(node('p',`전체 ${data.total}명 · ${data.items.length}명 표시`,'hint'));
   for(const m of data.items){const row=node('label','','group-member-choice'),check=node('input'),info=node('span');check.type='checkbox';check.checked=edits.get(m.userId)?.selected??m.groupId===group.id;check.setAttribute('aria-label',(m.name||m.email)+' 그룹원 선택');info.append(node('strong',`${m.name||'이름 미입력'} · ${m.academy||'학원명 미입력'}`),node('span',m.email),node('small','현재 소속: '+(m.groupName||'미배정')));check.onchange=()=>{if(check.checked===(m.groupId===group.id))edits.delete(m.userId);else edits.set(m.userId,{userId:m.userId,expectedGroupId:m.groupId,selected:check.checked,name:m.name,email:m.email,groupName:m.groupName});changed();};row.append(check,info);body.append(row);}
   if(!data.total)body.append(node('p','조건에 맞는 회원이 없습니다.','empty'));
   body.append(listPagination({node,action,total:data.total,offset,onPage:async value=>{offset=value;await load();}}));changed();
  }catch(e){if(d.open&&sequence===request)body.replaceChildren(node('p','회원 목록 조회 실패: '+e.message,'error'),action('다시 불러오기',load));}
  finally{if(sequence===request)body.setAttribute('aria-busy','false');}
 }
 await load();
}
