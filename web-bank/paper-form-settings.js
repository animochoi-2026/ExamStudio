import model from './exam-form-model.cjs';
import forms from '../app/paper-form-model.cjs';
import {defaultLogo} from './exam-form-logo.js';
import {fitFormTitles,formControls,isMock,formHeader,formIntro,formFooter,measureForm,defaultScoreNote,formName,logoPosition} from './exam-form.js';
import {examSession} from './exam-session.js';
import {setEditGuard} from './edit-guard.js';

const key=(config,user,suffix)=>model.profileKey(config.spaceId,user.id)+':'+suffix;
const defaultForm=()=>({template:'mock',logo:defaultLogo,minutes:45,scoreNote:defaultScoreNote});
export function savedPaperForm(config,user){
 const text=localStorage.getItem(key(config,user,'saved-form'));
 if(!text)return null;const form=JSON.parse(text);return {...form,id:form.id||'saved:legacy',name:form.name||'저장한 폼',version:form.version||1};
}
export function paperFormCatalog(config,user){
 const saved=JSON.parse(localStorage.getItem(key(config,user,'forms'))||'[]');
 if(!Array.isArray(saved))throw Error('저장된 폼 목록 형식이 올바르지 않습니다.');
 return forms.catalog(saved,savedPaperForm(config,user));
}
export function beginFormEdit({config,user,draft,returnRoute}){
 const draftKey=draft.version===0?'new':draft.id;
 // Keep the complete working paper before bypassing the normal leave dialog.
 examSession.write(user.id,draftKey,draft);
 sessionStorage.setItem(key(config,user,'return'),JSON.stringify({draftKey,draftId:draft.id,returnRoute,title:draft.title,units:draft.rules.units||[],paperForm:draft.paperForm}));
 setEditGuard(null);
}
export function formLoader({controls,getDraft,node,action,persist,render,message,config,user,edit,onChange=()=>{}}){
 getDraft().paperForm??={...defaultForm(),...forms.builtin('standard')};
 const box=node('section','','paper-form-loader'),select=node('select'),buttons=node('div','','actions');box.setAttribute('aria-label','시험지 폼');select.setAttribute('aria-label','시험지 폼 선택');box.append(node('h4','시험지 폼'),select,buttons);
 let choices=paperFormCatalog(config,user),current=getDraft().paperForm,id=forms.selectedId(current,choices);
 if(!id){id='embedded';choices.push({...structuredClone(current),id,name:current.name||'현재 시험지의 '+formName(current)});}
 for(const form of choices){const option=node('option',form.name);option.value=form.id;select.append(option);}select.value=id;
 select.onchange=async()=>{try{const form=choices.find(f=>f.id===select.value);getDraft().paperForm={...defaultForm(),...structuredClone(form)};onChange(getDraft().paperForm);persist();await render();}catch(e){message('폼을 적용하지 못했습니다. '+e.message,true);}};
 buttons.append(action('수정',edit));controls.append(box);return box;
}
export async function paperFormSettings({root,config,user,node,action,field,message,navigate,fromExam=false}){
 let context=null;
 if(fromExam){try{context=JSON.parse(sessionStorage.getItem(key(config,user,'return'))||'null');}catch{}if(!context)message('돌아갈 시험지가 없어 내 폼 설정을 엽니다.');}
 let saved;try{saved=savedPaperForm(config,user);}catch(e){message('저장된 폼을 읽지 못했습니다. '+e.message,true);}
 const draft={title:context?.title||'시험지 제목',rules:{units:context?.units||['m2-u6','m2-u7']},items:[],paperForm:structuredClone(context?.paperForm||saved||defaultForm())};
 const layout=node('div','','paper-form-settings-layout'),controls=node('div','','panel'),previewPanel=node('section','','paper-form-preview-panel'),viewport=node('div','','exam-viewport paper-form-preview'),surface=node('div','','paper-form-preview-surface'),pages=node('div','','exam-pages');
 root.classList.add('paper-form-settings-page');root.append(node('p','양식을 선택하고 로고와 시험 안내 사항을 설정하세요. 폼을 저장하면 다음 새 시험지에도 기본으로 적용됩니다.','lead'),node('p','시험지 제목·시험범위·배점은 시험지 생성 시 입력한 내용으로 채워집니다. 저장한 폼은 이 브라우저의 내 계정에서 유지됩니다.','hint'),layout);
 const previewHeading=node('div','','paper-form-preview-heading');previewHeading.append(node('h3','폼 미리보기'));previewPanel.append(previewHeading);surface.append(pages);viewport.append(surface);previewPanel.append(viewport);layout.append(controls,previewPanel);
 let serial=0,baseline;
 const dirty=()=>JSON.stringify(draft.paperForm)!==baseline;
 const scale=()=>{const zoom=Math.min(1,Math.max(.2,(viewport.clientWidth-24)/(210*96/25.4)));pages.style.transform=`scale(${zoom})`;surface.style.width=210*96/25.4*zoom+'px';surface.style.height=297*96/25.4*zoom+'px';};
 const resize=new ResizeObserver(scale);resize.observe(viewport);const lifecycle=new MutationObserver(()=>{if(!root.isConnected||!root.contains(layout)){resize.disconnect();lifecycle.disconnect();serial++;}});lifecycle.observe(document.body,{childList:true,subtree:true});
 const enableLogoDrag=sheet=>{
  const logo=sheet.querySelector('.mock-logo');if(!logo)return;
  logo.tabIndex=0;logo.setAttribute('aria-label','학원 로고 위치: 드래그 또는 방향키로 이동');
  const move=(x,y)=>{const position=logoPosition({...draft.paperForm,logoXmm:x,logoYmm:y});draft.paperForm.logoXmm=position.x;draft.paperForm.logoYmm=position.y;logo.style.left=position.x+'mm';logo.style.top=position.y+'mm';};
  let drag=null;
  logo.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();logo.focus({preventScroll:true});drag={id:e.pointerId,x:e.clientX,y:e.clientY,position:logoPosition(draft.paperForm),pixelsPerMm:sheet.getBoundingClientRect().width/210};logo.setPointerCapture(e.pointerId);};
  logo.onpointermove=e=>{if(drag&&drag.id===e.pointerId)move(drag.position.x+(e.clientX-drag.x)/drag.pixelsPerMm,drag.position.y+(e.clientY-drag.y)/drag.pixelsPerMm);};
  logo.onpointerup=logo.onpointercancel=e=>{if(drag?.id===e.pointerId){drag=null;if(logo.hasPointerCapture(e.pointerId))logo.releasePointerCapture(e.pointerId);}};
  logo.onlostpointercapture=()=>{drag=null;};
  logo.onkeydown=e=>{const deltas={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},delta=deltas[e.key];if(!delta)return;e.preventDefault();const position=logoPosition(draft.paperForm),step=e.shiftKey?5:1;move(position.x+delta[0]*step,position.y+delta[1]*step);};
 };
 async function render(){const token=++serial;try{const geometry=isMock(draft)?await measureForm(node,draft,{placeholders:true}):null;if(token!==serial||!root.isConnected)return;const sheet=node('section','','exam-page'+(geometry?' exam-form-mock':''));if(geometry)sheet.append(formHeader(node,draft,0,{placeholders:true}),formFooter(node,0,1));else{const header=node('header','','exam-page-header');header.append(node('span','시험지 제목 영역','exam-header-title mock-title-placeholder'),node('span','이름: __________________','exam-name-line'));sheet.append(header,node('span','1','page-number'));}const cols=node('div','','exam-columns'),left=node('div','','exam-column'),right=node('div','','exam-column');if(geometry){cols.style.height=geometry.firstHeight+'px';left.append(formIntro(node,draft,{placeholders:true}));}left.append(node('p','문항이 배치되는 영역','paper-form-sample-question'));cols.append(left,right);sheet.append(cols);pages.replaceChildren(sheet);fitFormTitles(sheet);scale();enableLogoDrag(sheet);}catch(e){if(token===serial)message('폼 미리보기: '+e.message,true);}}
 formControls({controls,getDraft:()=>draft,node,action,field,user,config,persist:()=>{},render,message});baseline=JSON.stringify(draft.paperForm);
 const saveState=node('span','','paper-form-save-state');saveState.setAttribute('role','status');
 const save=async()=>{try{const result=forms.saveForm(paperFormCatalog(config,user),draft.paperForm,'saved:'+crypto.randomUUID());localStorage.setItem(key(config,user,'forms'),JSON.stringify(result.forms));localStorage.setItem(key(config,user,'saved-form'),JSON.stringify(result.saved));draft.paperForm=result.saved;baseline=JSON.stringify(draft.paperForm);saveState.textContent='저장됨 · 다음 새 시험지에 기본 적용';message('폼을 저장했습니다. 다음 새 시험지부터 이 양식을 기본으로 사용합니다.');return true;}catch(e){message('폼 저장 실패: '+e.message,true);return false;}};
 setEditGuard({dirty,save,discard:()=>{}});
 const saveButton=action('폼 저장',save,true);saveButton.classList.add('primary','paper-form-save-button');previewHeading.append(saveButton);previewPanel.insertBefore(saveState,viewport);
 const buttons=node('div','','actions paper-form-save-actions');
 if(context){buttons.append(action('저장하고 시험지에 적용',async()=>{
  const working=examSession.read(user.id,context.draftKey);if(!working||working.id!==context.draftId)return message('작성 중인 시험지를 찾지 못했습니다. 폼 저장 후 시험지를 다시 열어 주세요.',true);
  if(!await save())return;
  try{working.paperForm=structuredClone(draft.paperForm);examSession.write(user.id,context.draftKey,working);}catch(e){message('시험지에 적용하지 못했습니다. '+e.message,true);return;}
  await navigate(context.returnRoute);
 }),action('시험지로 돌아가기',()=>navigate(context.returnRoute)));}else buttons.append(action('홈으로',()=>navigate('home')));
 controls.append(buttons);await render();return {draft};
}
