import replacement from './replacement-model.cjs';
import model from '../app/bank-exam-model.cjs';
import {sourceLabel} from './presentation.js';
export async function replacementPopup({node,action,reader,rpc,config,draft,item,originalsOnly,onReplace,filterCandidate=()=>true,contextText='',mockExamId=null}){
 const dialog=node('dialog','','question-replacement'),title=node('h2','문제교체'),current=node('section','','replacement-current'),list=node('section'),pager=node('div','','actions'),notice=node('p','','hint'),expandRow=node('div','','actions');
 const rules={...replacement.searchRules(draft,{originalsOnly}),...(mockExamId?{mockExamId}:{})},originalId=item.questionId,revision=item.revisionId;
 let page=0,expanded=false,version=null,epoch=0,closed=false,selected=null;
 dialog.setAttribute('aria-label','문제교체');
 const close=()=>dialog.close();dialog.append(title,action('닫기',close),current,expandRow,notice,list,pager);document.body.append(dialog);dialog.addEventListener('close',()=>{closed=true;epoch++;dialog.remove();},{once:true});dialog.showModal();
 if(contextText)current.append(node('p',contextText,'replacement-context'));
 current.append(node('h3','현재 문제'),node('p','유형·단원 비교 기준입니다. 난이도는 후보 제한·정렬에 사용하지 않습니다.','hint'));
 let startedOutside=false;const outside=e=>{const r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
 dialog.addEventListener('pointerdown',e=>{startedOutside=e.target===dialog&&outside(e);});
 dialog.addEventListener('click',e=>{if(startedOutside&&e.target===dialog&&outside(e))close();startedOutside=false;});
 try{const r=await reader.render(revision,{answers:false});if(!closed)current.append(r.element);}catch(e){notice.textContent=e.message;return;}
 async function query(extra={}){return rpc('bank_replacement_page',{s:config.spaceId,current_revision:revision,rules,selected:draft.items.map(x=>x.questionId),page,expanded,expected_version:version,candidate:null,...extra});}
 async function load(){const request=++epoch;selected=null;notice.textContent='대체문항을 불러오는 중입니다.';list.replaceChildren();pager.replaceChildren();
  try{let result=await query();if(closed||request!==epoch)return;
   if(result.changed){version=null;page=0;result=await query();if(closed||request!==epoch)return;notice.textContent='후보 정보가 변경되어 첫 페이지부터 다시 표시합니다.';}else notice.textContent='후보를 선택해 전체 내용을 확인한 뒤 교체를 확정하세요.';
   version=result.version;expandRow.replaceChildren();const expand=action(expanded?'타학교 포함 중':'타학교 문제까지 보기',async()=>{expanded=true;page=0;await load();});expand.disabled=expanded||!result.extraCount;expandRow.append(expand,node('span',`타학교 후보 ${result.extraCount}개 추가 · 전체 ${result.baseCount+result.extraCount}개`));
   if(!result.items.length)list.append(node('p','현재 조건에 맞는 대체문항이 없습니다.','empty'));
   for(const c of result.items.filter(filterCandidate)){const box=node('article','','replacement-candidate'),preview=node('div'),confirm=action('이 문제로 교체',async()=>{
     if(selected!==c.question_id)throw Error('먼저 후보의 전체 내용을 확인하세요.');
     if(!draft.items.some(x=>x.questionId===originalId&&x.revisionId===revision))throw Error('교체 대상이 변경되었습니다. 팝업을 다시 열어 주세요.');
     const validated=await query({candidate:c.question_id,page:0});if(validated.changed||validated.items[0]?.revision_id!==c.revision_id)throw Error('후보 또는 조건이 변경되었습니다. 목록을 다시 확인하세요.');
     const full=await reader.render(c.revision_id,{answers:true});if(!filterCandidate(full.catalog))throw Error('모든 대상 시험지에 적용할 수 없는 후보입니다.');await onReplace(full.catalog);close();
    },true);confirm.disabled=true;
    box.append(node('h3',replacement.reasons(c)+' · 난이도 '+(model.numericScore(c)?.toFixed(1)??'점수 없음')),node('p',sourceLabel(c),'hint'));
    const body=node('div','문제 모습을 불러오는 중입니다.','replacement-body');box.append(body);
    const showBody=async()=>{try{const r=await reader.render(c.revision_id,{answers:false});if(!closed&&request===epoch)body.replaceChildren(r.element);}catch(e){if(!closed&&request===epoch)body.replaceChildren(node('p','미리보기 실패: '+e.message,'error'),action('미리보기 다시 시도',showBody));}};
    // Only the current server page (at most ten questions) is read, never the bank.
    void showBody();
    const select=action('후보 선택 · 전체 내용 확인',async()=>{selected=null;confirm.disabled=true;preview.textContent='문제·정답·풀이를 불러오는 중입니다.';
     const r=await reader.render(c.revision_id,{answers:true});if(closed||request!==epoch)return;if(r.element.dataset.incomplete)throw Error('그림이 누락되어 교체할 수 없습니다.');
     selected=c.question_id;for(const b of list.querySelectorAll('[data-confirm]'))b.disabled=true;preview.replaceChildren(r.element);confirm.disabled=false;
    });confirm.dataset.confirm='true';box.append(select,preview,confirm);list.append(box);
   }
   const pages=Math.max(1,Math.ceil(result.total/10)),previous=action('이전페이지',async()=>{page--;await load();}),next=action('다음페이지',async()=>{page++;await load();});previous.disabled=page===0;next.disabled=page+1>=pages;pager.append(previous,node('span',`${page+1} / ${pages} 페이지 · 전체 후보 ${result.total}개`),next);
  }catch(e){if(!closed&&request===epoch){notice.textContent='조회 실패: '+e.message;list.append(action('다시 조회',()=>{version=null;page=0;return load();}));}}
 }
 await load();
}
