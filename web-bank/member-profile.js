import {groupMembersPopup} from './group-members.js';
export function profileFields({node,rpc,initial={}}){
 const element=node('div','','profile-fields'),fields={};
 for(const [key,label,max]of [['display_name','이름',60],['academy_name','학원명',120]]){const wrap=node('label',label+' (필수)'),input=node('input');input.required=true;input.maxLength=max;input.autocomplete=key==='display_name'?'name':'organization';input.value=initial[key]||'';wrap.append(input);element.append(wrap);fields[key]=input;}
 const save=async()=>{const name=fields.display_name.value.trim(),academy=fields.academy_name.value.trim();if(!name||!academy)throw Error('이름과 학원명을 모두 입력해 주세요.');await rpc('bank_profile_set',{full_name:name,academy});};
 return {element,save,fields};
}
export async function profilePopup({node,action,rpc,message}){
 const initial=await rpc('bank_profile_get',{}),d=node('dialog','','membership-dialog'),form=profileFields({node,rpc,initial});d.setAttribute('aria-label','내 프로필');d.append(node('h2','내 프로필'),form.element,action('프로필 저장',async()=>{await form.save();message('이름과 학원명을 저장했습니다.');d.close();},true),action('닫기',()=>d.close()));document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();
}
export async function groupManager(ctx){
 const {root,node,action,rpc,config,member}=ctx,section=node('section','','panel group-management');root.append(section);
 async function render(){const groups=await rpc('bank_groups_list',{s:config.spaceId});section.replaceChildren();section.append(node('h3','소속 그룹'),node('p','학원명과 그룹은 별개입니다. 그룹 이동 시 기존 모의고사는 생성 당시 그룹에 남습니다.','hint'));
 for(const g of groups){const row=node('div','','member-row');row.append(node('strong',g.name),node('span',`회원 ${g.memberCount}명 · 모의고사 ${g.mockCount}개`));if(member.role==='owner'){row.append(action('그룹원 지정',()=>groupMembersPopup(ctx,g,render)),action('그룹 이름 변경',async()=>{const name=prompt('그룹 이름',g.name);if(name===null)return;await rpc('bank_group_save',{s:config.spaceId,g:g.id,group_name:name});await ctx.navigate('admin');}),action('그룹 삭제',async()=>{if(!confirm(g.name+' 그룹을 삭제할까요? 회원·모의고사·유효한 초대가 남아 있으면 삭제할 수 없습니다.'))return;await rpc('bank_group_delete',{s:config.spaceId,g:g.id});await ctx.navigate('admin');}));}section.append(row);}
 if(!groups.length)section.append(node('p','소속 그룹이 없습니다. 그룹 배정은 오너에게 요청하세요.','hint'));
 if(member.role==='owner')section.append(action('그룹 만들기',async()=>{const name=prompt('새 그룹 이름');if(name===null)return;await rpc('bank_group_save',{s:config.spaceId,g:null,group_name:name});await ctx.navigate('admin');}));
 }
 await render();
}
