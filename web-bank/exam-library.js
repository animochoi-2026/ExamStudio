import {confirmDelete} from './confirm-delete.js';
import {examSession} from './exam-session.js';
// This list contains only explicitly saved server documents.
export async function examLibrary({root,user,config,rpc,preview,navigate,message,node,action}){
 root.append(node('p','모바일에서 서버 저장을 마친 시험지는 같은 계정으로 PC에서도 이어 편집할 수 있습니다.','lead'));
 const openNew=action('새 시험지 만들기',()=>navigate('exam/new'),true);
 root.append(openNew,node('p','저장 상태가 ‘서버 저장 완료’일 때 다른 기기에서 보입니다.','hint'));
 const list=node('div','','exam-library'),more=action('다음 시험지',load);root.append(node('h3','내 시험지'),list,more);let offset=0;
 async function load(){const exams=await rpc('bank_exam_list',{s:config.spaceId,start_at:offset});for(const e of exams){const card=node('article','','exam-library-card'),image=node('div','','exam-library-preview');if(e.preview?.id){preview(e.preview,image).catch(()=>image.replaceChildren(node('span','미리보기를 불러오지 못했습니다.','hint')));}else image.append(node('span','미리보기 없음','hint'));
   const info=node('div');info.append(node('strong',e.title),node('p',`${e.status==='completed'?'완성':'초안'} · ${e.item_count}문항 · ${new Date(e.updated_at).toLocaleString('ko-KR')} 수정 · v${e.version}`,'hint'));
   const buttons=node('div','','actions');buttons.append(action('이어 편집',()=>navigate('exam/'+e.id)),action('다운로드·미리보기',()=>navigate('exam/'+e.id+'/download')),
    action('복사해서 새 시험지',async()=>{const source=await rpc('bank_exam_get',{s:config.spaceId,e:e.id}),id=crypto.randomUUID(),doc={...source.document,id,version:0,status:'draft',title:source.title+' 복사본',copiedFrom:{id:e.id,version:source.version}};examSession.write(user.id,'new',doc);message('편집할 사본을 열었습니다. 저장 버튼으로 저장하세요.');await navigate('exam/new');}));
   if(e.status!=='completed')buttons.append(action('완성으로 표시',async()=>{if(!confirm('완성 표시를 내 시험지에 저장할까요?'))return;const source=await rpc('bank_exam_get',{s:config.spaceId,e:e.id});await rpc('bank_exam_save',{s:config.spaceId,e:e.id,expected:source.version,doc:{...source.document,id:e.id,status:'completed'}});message('완성본을 저장했습니다. 이전 상태는 버전 이력에 남습니다.');await navigate('exam');}));
   buttons.append(action('시험지 실제 삭제',async()=>{if(!await confirmDelete({node,title:e.title,exam:true,description:'시험지와 버전 이력이 삭제됩니다. 문항 원본은 유지됩니다.'}))return;await rpc('bank_exam_delete',{s:config.spaceId,e:e.id,expected:e.version,title_confirmation:e.title});examSession.clear(user.id,e.id);message('시험지와 버전 이력을 삭제했습니다.');await navigate('exam');}));
   info.append(buttons);card.append(image,info);list.append(card);
  }offset+=exams.length;more.hidden=exams.length<30;if(!offset)list.append(node('p','서버에 저장한 시험지가 없습니다. 새 시험지를 만들어 저장하세요.','empty'));}
 await load();
 const archived=await rpc('bank_exam_archived_list',{s:config.spaceId});if(archived.length){const restore=node('details','','panel');restore.append(node('summary',`이전 보관 시험지 · ${archived.length}건`));for(const e of archived){
  const row=node('div','','archived-exam-card'),title=node('strong',`${e.title} · 이전 보관본`,'archived-exam-title'),buttons=node('div','','archived-exam-actions');title.title=title.textContent;
  buttons.append(action('영구 삭제',async()=>{if(!await confirmDelete({node,title:e.title,exam:true,description:'이 시험지 1개의 이전 보관본과 버전 이력을 영구 삭제합니다. 문항 원본과 다른 시험지는 유지됩니다.'}))return;await rpc('bank_exam_delete',{s:config.spaceId,e:e.id,expected:e.version,title_confirmation:e.title});await navigate('exam');}),action('복구',async()=>{await rpc('bank_exam_archive',{s:config.spaceId,e:e.id,expected:e.version,archived_value:false});message('시험지를 내 목록에 복구했습니다.');await navigate('exam');}));
  row.append(title,buttons);restore.append(row);
 }root.append(restore);}
}
