import replacement from './replacement-model.cjs';
import model from '../app/bank-exam-model.cjs';
import responseFormat from '../app/response-format.cjs';
import {sourceLabel} from './presentation.js';
export async function replacementPopup({node,action,reader,rpc,config,draft,item,originalsOnly,onReplace,filterCandidate=()=>true,contextText='',mockExamId=null,getSelected=()=>draft.items.map(x=>x.questionId),targetScopes=[]}){
 const dialog=node('dialog','','question-replacement'),current=node('section','','replacement-current'),base=node('section','','replacement-preferred'),other=node('section','','replacement-other'),expandRow=node('div','','actions'),status=node('p','','hint');
 const rules={...replacement.searchRules(draft,{originalsOnly}),targetScopes,...(mockExamId?{mockExamId}:{})},originalId=item.questionId,revision=item.revisionId;
 let closed=false,expanded=false,selected=null,confirming=false,selectionEpoch=0,targetFormat=null;
 const states={preferred_school:{box:base,epoch:0,version:null,page:0},other_schools:{box:other,epoch:0,version:null,page:0}};
 const close=()=>{if(!confirming)dialog.close();};
 dialog.setAttribute('aria-label','문제교체');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 dialog.append(node('h2','문제교체'),action('닫기',close),current,status,base,expandRow,other,action('취소',close));document.body.append(dialog);
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);void e.target.loadPreview?.();}},{root:dialog,rootMargin:'200px'}):null;
 dialog.addEventListener('close',()=>{closed=true;selectionEpoch++;observer?.disconnect();dialog.remove();},{once:true});dialog.addEventListener('cancel',e=>{if(confirming)e.preventDefault();});dialog.showModal();
 if(contextText)current.append(node('p',contextText,'replacement-context'));
 current.append(node('h3','현재 문제'),node('p','현재 문항과 같은 객관식·서술형만 표시합니다. 지정 학교는 시험범위 전체에서 찾습니다. 타학교는 직접 확대하면 같은 세부 단원에서 난이도 높은 순으로 표시합니다.','hint'));
 let startedOutside=false;const outside=e=>{const r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
 dialog.addEventListener('pointerdown',e=>{startedOutside=e.target===dialog&&outside(e);});dialog.addEventListener('click',e=>{if(startedOutside&&e.target===dialog&&outside(e))close();startedOutside=false;});
 const disableConfirms=()=>{for(const b of dialog.querySelectorAll('[data-confirm]'))b.disabled=true;};
 const query=(stage,extra={})=>rpc('bank_replacement_candidates',{s:config.spaceId,current_revision:revision,rules,selected:getSelected(),stage,page:states[stage].page,expected_version:states[stage].version,candidate:null,...extra});
 const expand=action('타학교 문제까지 확대',async()=>{if(expanded)return;expanded=true;expand.hidden=true;await load('other_schools');});
 expandRow.append(expand);expand.disabled=true;
 function card(c,stage,epoch){
  const state=states[stage],box=node('article','','replacement-candidate'),body=node('div',c.content?.body||'스크롤하면 문제 미리보기를 불러옵니다.','replacement-body'),preview=node('div'),score=model.numericScore(c);
  box.dataset.questionId=c.question_id;
  box.append(node('h3',(stage==='preferred_school'?'지정 학교':'타학교 · 같은 세부 단원')+' · 난이도 '+(score?.toFixed(1)??'미확인')),node('p',sourceLabel(c),'hint'),body);
  const valid=()=>!closed&&epoch===state.epoch&&box.isConnected;
  body.loadPreview=async()=>{try{const r=await reader.render(c.revision_id,{answers:false});if(valid())body.replaceChildren(r.element);}catch(e){if(valid())body.replaceChildren(node('p','미리보기 실패: '+e.message,'error'),action('다시 보기',body.loadPreview));}};
  const confirm=action('이 문제로 교체',async()=>{
   if(confirming||selected!==c.question_id)return;
   confirming=true;disableConfirms();status.textContent='교체 확정 중 · 최신 사용 기록을 확인합니다.';
   try{
    if(!draft.items.some(x=>x.questionId===originalId&&x.revisionId===revision))throw Error('교체 대상이 변경되었습니다. 팝업을 다시 열어 주세요.');
    const validated=await query(stage,{candidate:c.question_id,page:0,expected_version:null});
    if(validated.items[0]?.revision_id!==c.revision_id)throw Error('후보 또는 사용 상태가 변경되었습니다. 다른 문제를 선택하세요.');
    const full=await reader.render(c.revision_id,{answers:true});if(full.element.dataset.incomplete)throw Error('그림이 누락되어 교체할 수 없습니다.');
    if(!targetFormat||responseFormat.fromMetadata(full.catalog.metadata)!==targetFormat)throw Error('원래 문항과 객관식·서술형이 달라 교체할 수 없습니다. 목록을 다시 열어 주세요.');
    if(!filterCandidate(full.catalog))throw Error('모든 대상 시험지에 적용할 수 없는 후보입니다.');
    await onReplace(full.catalog);confirming=false;close();
   }catch(e){status.textContent='교체 차단: '+e.message;selected=null;}finally{confirming=false;}
  },true);confirm.disabled=true;confirm.dataset.confirm='true';
  const select=action('후보 선택 · 전체 내용 확인',async()=>{
   if(confirming)return;const selection=++selectionEpoch;selected=null;disableConfirms();preview.textContent='문제·정답·풀이를 불러오는 중입니다.';
   try{const r=await reader.render(c.revision_id,{answers:true});if(!valid()||selection!==selectionEpoch)return;
    if(r.element.dataset.incomplete)throw Error('그림이 누락되어 교체할 수 없습니다.');selected=c.question_id;preview.replaceChildren(r.element);confirm.disabled=false;status.textContent='내용을 확인한 뒤 이 문제로 교체를 눌러 주세요.';
   }catch(e){if(valid())preview.textContent='미리보기 실패: '+e.message;}
  });
  box.append(select,preview,confirm);if(observer)observer.observe(body);else void body.loadPreview();return box;
 }
 async function load(stage){
  const state=states[stage],epoch=++state.epoch;selected=null;selectionEpoch++;disableConfirms();
  const label=stage==='preferred_school'?'지정 학교':'타학교 같은 단원';state.box.replaceChildren(node('h3',label+' 문제'),node('p',label+' 문제 로딩 중…','hint'));
  try{
   let result=await query(stage);if(closed||epoch!==state.epoch)return;
   if(result.changed){state.version=null;state.page=0;result=await query(stage);if(closed||epoch!==state.epoch)return;status.textContent='후보 정보가 변경되어 타학교 첫 페이지부터 다시 표시합니다.';}
   state.version=result.version;state.box.replaceChildren(node('h3',`${label} · ${result.total}문제`));
   if(result.needsSchool)state.box.append(node('p','시험지 설정에서 학교를 먼저 선택하세요. 학교를 지정하지 않고 찾으려면 아래 타학교 확대를 직접 눌러 주세요.','empty'));
   else if(!result.items.length)state.box.append(node('p',label+'의 사용 가능한 문제가 없습니다.','empty'));
   for(const c of result.items)state.box.append(card(c,stage,epoch));
   if(stage==='other_schools'){
    const pager=node('div','','actions'),previous=action('이전 20문제',async()=>{state.page--;await load(stage);}),next=action('다음 20문제',async()=>{state.page++;await load(stage);});
    previous.disabled=state.page===0;next.disabled=!result.hasMore;pager.append(previous,node('span',`${state.page+1} / ${Math.max(1,Math.ceil(result.total/20))} 페이지${result.hasMore?'':' · 마지막 목록'}`),next);state.box.append(pager);
   }
  }catch(e){if(!closed&&epoch===state.epoch)state.box.replaceChildren(node('p',label+' 조회 실패: '+e.message,'error'),action('다시 조회',()=>{state.version=null;state.page=0;return load(stage);}));}
  finally{if(stage==='preferred_school'&&!closed)expand.disabled=false;}
 }
 try{const r=await reader.render(revision,{answers:false});targetFormat=responseFormat.fromMetadata(r.catalog.metadata);if(!closed)current.append(r.element);}catch(e){status.textContent='현재 문제 미리보기 실패: '+e.message;}
 if(!closed)await load('preferred_school');
}
