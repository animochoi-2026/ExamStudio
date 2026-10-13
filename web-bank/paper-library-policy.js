export const retentionText=e=>`생성 ${e.created_at?new Date(e.created_at).toLocaleDateString('ko-KR'):'날짜 미확인'} · 삭제 예정 ${e.expires_at?new Date(e.expires_at).toLocaleDateString('ko-KR'):'날짜 미확인'}`;
export function mockDescription(e){return `${e.group_name||'개인 보관'} · ${e.creator_name||'이름 미입력'} · ${e.variant_count}개 시험지 · ${retentionText(e)}`;}
export function mockDeleteButton(e,{node,action,rpc,config,onDeleted}){
 if(!e.can_delete)return null;
 return action('모의고사 삭제',async()=>{
  if(!confirm(`${e.title}\n생성자: ${e.creator_name||'이름 미입력'}\n${retentionText(e)}\n삭제하면 복구하기 어렵습니다. 이 모의고사에서만 사용한 문제는 다시 출제할 수 있습니다. 삭제할까요?`))return;
  await rpc('bank_mock_delete',{s:config.spaceId,e:e.id,expected:e.version,title_confirmation:e.title});await onDeleted();
 });
}
export function conflictText(error){let items;try{items=JSON.parse(error.details);}catch{}return error.message+(Array.isArray(items)?'\n'+items.map(x=>`${x.title} · ${x.creator} · 문제 ${x.questionId}`).join('\n'):'');}
