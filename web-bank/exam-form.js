import model from './exam-form-model.cjs';
import {defaultLogo} from './exam-form-logo.js';
export const isMock = draft => draft.paperForm?.template === 'mock';
export const formClass = draft => isMock(draft)?' exam-form-mock':'';
export const defaultScoreNote = '객관식 1개당 4점.';
export const defaultInstructions = ['문제지에 성명과 반명을 정확히 써넣으세요.','문제지에 답을 정확히 표시하세요.','문항별 배점을 확인하고 문제풀이와 시간 배분에 신경 쓰세요.'].join('\n');
// An explicit empty list means the teacher removed every instruction.
export function instructionItems(form={}) {
 if(Array.isArray(form.instructionItems))return form.instructionItems.map(String);
 const items=(form.instructions??defaultInstructions).split('\n').filter(text=>text.trim());
 const minutes=form.minutes===undefined?45:form.minutes;
 if(minutes)items.push(`시험시간은 ${minutes}분입니다.`);
 return items;
}
export const formName = form => form?.name||(form?.template==='mock'?'실전모의고사 폼':'기본폼');
export function fitFormTitles(container){
 for(const title of container.querySelectorAll('.mock-title,.exam-answer-title')){
  title.style.removeProperty('font-size');
  const style=getComputedStyle(title),max=parseFloat(style.fontSize),width=title.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
  if(!(width>0))continue;
  const range=document.createRange();range.selectNodeContents(title);
  const scale=title.getBoundingClientRect().width/title.offsetWidth||1;
  const fits=()=>range.getBoundingClientRect().width/scale<=width+.1;
  if(fits())continue;
  let lo=0,hi=max;
  for(let i=0;i<20;i++){const mid=(lo+hi)/2;title.style.fontSize=mid+'px';if(fits())lo=mid;else hi=mid;}
  title.style.fontSize=lo+'px';
 }
}
// Native document headers use a 180 mm text area. Measure the actual selected
// font in the same browser that measures questions; never guess from length.
export function nativeHeaderFontPt(title,font='맑은 고딕'){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 ctx.font=`${10*96/72}px "${font}"`;
 return Math.min(10,10*(178*96/25.4)/Math.max(1,ctx.measureText(String(title)).width));
}
const boundedPercent=(value,fallback,min,max)=>{const n=Number(value??fallback);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};
export const logoStyle = form => ({scale:boundedPercent(form?.logoScalePercent,100,50,200),transparency:boundedPercent(form?.logoTransparencyPercent,0,0,100)});
export const logoPosition = form => {const style=logoStyle(form);return {x:boundedPercent(form?.logoXmm,22,0,210-20*style.scale/100),y:boundedPercent(form?.logoYmm,24,0,297-15*style.scale/100)};};
export function answerHeader(node,title,label='빠른 정답') {
 const header=node('header','','exam-answer-header');header.append(node('span',title,'exam-answer-title'),node('small',label));return header;
}
export async function measureAnswer(node,title){
 const sheet=node('section','','exam-page answer-page');sheet.style.cssText='position:fixed;left:-10000px;top:0;visibility:hidden';sheet.append(answerHeader(node,title));document.body.append(sheet);
 try{await document.fonts.ready;fitFormTitles(sheet);const rect=sheet.getBoundingClientRect(),head=sheet.querySelector('header').getBoundingClientRect(),paddingTop=Math.max(20*96/25.4,head.bottom-rect.top+3*96/25.4),height=rect.height-paddingTop-parseFloat(getComputedStyle(sheet).paddingBottom);if(height<100)throw Error('제목이 너무 길어 답지 영역이 부족합니다.');return {paddingTop,height};}finally{sheet.remove();}
}
export function formHeader(node,draft,index,{placeholders=false}={}){
 const header=node('header','','mock-header'+(index===0?' mock-first-header':''));
 if(index===0&&draft.paperForm.logoVisible!==false){const logo=draft.paperForm.logo;if(logo){const style=logoStyle(draft.paperForm),position=logoPosition(draft.paperForm),img=node('img','','mock-logo');img.src=logo;img.alt='학원 로고';img.draggable=false;img.style.width=(20*style.scale/100)+'mm';img.style.height=(15*style.scale/100)+'mm';img.style.opacity=String(1-style.transparency/100);img.style.left=position.x+'mm';img.style.top=position.y+'mm';header.append(img);}}
 header.append(node('div',placeholders?'시험지 제목 영역':draft.title,'mock-title'+(placeholders?' mock-title-placeholder':'')));
 if(index===0){const fields=node('div','','mock-student-fields');for(const label of ['반명','이름']){const cell=node('div','','mock-student-field'),caption=node('span'),image=node('img');image.alt=label;image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="56" height="30" viewBox="0 0 56 30"><text x="28" y="15" text-anchor="middle" dominant-baseline="central" font-family="Malgun Gothic,맑은 고딕,sans-serif" font-size="13.333" font-weight="700">${label}</text></svg>`);caption.append(image);cell.append(caption,node('span','','mock-student-blank'));fields.append(cell);}header.append(fields);}
 return header;
}
export function formIntro(node,draft,{placeholders=false}={}){
 const intro=node('aside','','mock-instructions');
 const bullet=(text,cls='')=>{const row=node('p','','mock-instruction-row '+cls),mark=node('span','◦ ','mock-instruction-marker');mark.setAttribute('aria-hidden','true');row.append(mark,node('span',text,'mock-instruction-text'));return row;};
 for(const text of instructionItems(draft.paperForm))if(text.trim())intro.append(bullet(text,'mock-guidance'));
 if(placeholders){intro.append(bullet('시험범위 영역','mock-scope mock-auto-placeholder'),bullet('배점 영역','mock-score-note mock-auto-placeholder'));return intro;}
 intro.append(bullet('시험범위 : '+(model.scopeLabel(draft.rules.units)||'미지정'),'mock-scope'));
 const scoreNote=draft.paperForm.scoreNote??defaultScoreNote;
 if(scoreNote.trim())intro.append(bullet(scoreNote,'mock-score-note'));
 return intro;
}
export function formFooter(node,index,total){
 const footer=node('div','','mock-footer'),number=node('span','','page-number mock-page-number');number.setAttribute('aria-label',`문제 ${total}쪽 중 ${index+1}쪽`);number.append(node('span',String(index+1)),node('span',String(total)));
 const image=node('img');image.alt='';image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="28" viewBox="0 0 80 28"><rect x=".7" y=".7" width="78.6" height="26.6" rx="2" fill="white" stroke="black" stroke-width="1.2"/><path d="M1 27L79 1" stroke="black"/><g fill="black" font-family="Malgun Gothic,맑은 고딕,sans-serif" font-size="16"><text x="7" y="17">${index+1}</text><text x="72" y="25" text-anchor="end">${total}</text></g></svg>`);number.append(image);footer.append(number);return footer;
}
export async function measureForm(node,draft,options={}){
 const sheet=node('section','','exam-page exam-form-mock');sheet.style.cssText='position:fixed;left:-10000px;top:0;visibility:hidden';document.body.append(sheet);
 try{
  const measure=async index=>{sheet.replaceChildren(formHeader(node,draft,index,options));await document.fonts.ready;fitFormTitles(sheet);await Promise.all([...sheet.querySelectorAll('img')].map(i=>i.decode()));return sheet.querySelector('header').getBoundingClientRect().height;};
  const firstHeader=await measure(0),header=await measure(1),s=getComputedStyle(sheet),height=sheet.getBoundingClientRect().height-parseFloat(s.paddingTop)-parseFloat(s.paddingBottom);
  const intro=formIntro(node,draft,options);intro.style.width='calc((100% - 9mm)/2)';sheet.replaceChildren(intro);const introHeight=intro.getBoundingClientRect().height+12;
  return {firstHeader,header,firstHeight:height-firstHeader-3*96/25.4,height:height-header-3*96/25.4,introHeight};
 }finally{sheet.remove();}
}
async function imageData(file){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('PNG, JPG, WebP 로고를 선택하세요.');
 if(file.size>5*1024*1024)throw Error('로고 파일은 5MB 이하로 선택하세요.');
 const url=URL.createObjectURL(file),img=new Image();
 try{img.src=url;await img.decode();const scale=Math.min(1,720/img.naturalWidth,360/img.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/png');if(data.length>600000)throw Error('로고가 너무 복잡합니다. 더 작은 이미지를 선택하세요.');return data;}finally{URL.revokeObjectURL(url);}
}
export function formControls({controls,getDraft,node,action,field,user,config,persist,render,message}){
 const key=model.profileKey(config.spaceId,user.id);let saved=null;try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch{}
 // Existing saved papers retain their own form and logo, even after defaults change.
 getDraft().paperForm??={template:'standard',logo:saved?.logo??defaultLogo,minutes:45};
 getDraft().paperForm.scoreNote??=defaultScoreNote;
 getDraft().paperForm.instructionItems=instructionItems(getDraft().paperForm);
 getDraft().paperForm.logoVisible??=!!getDraft().paperForm.logo;
 if(!getDraft().paperForm.logo)getDraft().paperForm.logo=saved?.logo||defaultLogo;
 const box=node('fieldset','','paper-form-controls');box.append(node('legend','시험지 폼'));
 const label=node('label','양식'),select=node('select');select.setAttribute('aria-label','시험지 폼');for(const [id,text]of [['standard','기본 폼'],['mock','실전모의고사폼']]){const option=node('option',text);option.value=id;select.append(option);}select.value=getDraft().paperForm.template;label.append(select);box.append(label);
 const settings=node('div','','paper-form-settings'),uploadLabel=node('label','이 시험지의 학원 로고'),upload=node('input');upload.type='file';upload.accept='image/png,image/jpeg,image/webp';upload.setAttribute('aria-label','학원 로고 업로드');uploadLabel.append(upload);settings.append(uploadLabel);
 const preview=node('img','','paper-logo-preview');preview.alt='선택한 학원 로고';settings.append(preview);
 const refresh=()=>{settings.hidden=!isMock(getDraft());preview.hidden=getDraft().paperForm.logoVisible===false;if(getDraft().paperForm.logo)preview.src=getDraft().paperForm.logo;else preview.removeAttribute('src');const style=logoStyle(getDraft().paperForm);preview.style.width=(80*style.scale/100)+'px';preview.style.opacity=String(1-style.transparency/100);for(const [property,slider]of logoSliders){slider.input.value=style[property];slider.output.textContent=style[property]+'%';slider.input.setAttribute('aria-valuetext',style[property]+'%');}};
 const logoSliders=new Map();
 const changed=()=>{refresh();persist();void render();};select.onchange=()=>{getDraft().paperForm.template=select.value;changed();};
 for(const [property,key,label,min,max]of [['scale','logoScalePercent','로고 크기',50,200],['transparency','logoTransparencyPercent','로고 투명도',0,100]]){const wrap=node('label','','logo-slider-control'),caption=node('span',label+' · '),output=node('output'),input=node('input');input.type='range';input.min=min;input.max=max;input.step=1;input.setAttribute('aria-label',label);caption.append(output);wrap.append(caption,input);settings.append(wrap);logoSliders.set(property,{input,output});input.oninput=()=>{getDraft().paperForm[key]=Number(input.value);changed();};}
 settings.append(node('p','크기 100%는 원래 크기입니다. 투명도 0%는 선명하게, 100%는 완전히 투명하게 표시합니다.','hint'));
 upload.onchange=async()=>{try{const file=upload.files?.[0];if(!file)return;getDraft().paperForm.logo=await imageData(file);getDraft().paperForm.logoVisible=true;visible.checked=true;changed();}catch(e){message(e.message,true);}finally{upload.value='';}};
 const visibleLabel=node('label','','logo-visible-control'),visible=node('input');visible.type='checkbox';visible.checked=getDraft().paperForm.logoVisible;visible.setAttribute('aria-label','로고 표시');visibleLabel.append(visible,node('span','로고 표시'));settings.prepend(visibleLabel);visible.onchange=()=>{getDraft().paperForm.logoVisible=visible.checked;changed();};
 settings.append(node('p','미리보기에서 로고를 드래그해 원하는 위치로 옮기세요. 방향키로도 이동할 수 있습니다. 저장한 로고와 위치는 다음에도 유지됩니다.','hint'));
 const instructions=node('fieldset','','instruction-editor'),list=node('div','','instruction-items');instructions.append(node('legend','시험 안내 사항'),node('p','시험시간을 포함한 모든 안내문을 수정하거나 추가·삭제할 수 있습니다. 시험범위와 배점은 시험지에 적용할 때 채워집니다.','hint'),list);
 const renderItems=()=>{list.replaceChildren();getDraft().paperForm.instructionItems.forEach((text,index)=>{const row=node('div','','instruction-editor-row'),label=node('label',`안내 사항 ${index+1}`),input=node('textarea');input.rows=2;input.setAttribute('aria-label',`안내 사항 ${index+1}`);input.value=text;input.oninput=()=>{getDraft().paperForm.instructionItems[index]=input.value;changed();};label.append(input);const remove=action('삭제',()=>{getDraft().paperForm.instructionItems.splice(index,1);renderItems();changed();(list.querySelectorAll('textarea')[Math.min(index,getDraft().paperForm.instructionItems.length-1)]||add).focus();});remove.setAttribute('aria-label',`안내 사항 ${index+1} 삭제`);row.append(label,remove);list.append(row);});if(!getDraft().paperForm.instructionItems.length)list.append(node('p','등록된 안내 사항이 없습니다.','hint'));};
 const add=action('안내 사항 추가',()=>{getDraft().paperForm.instructionItems.push('');renderItems();changed();list.querySelectorAll('textarea')[getDraft().paperForm.instructionItems.length-1].focus();});instructions.append(add);settings.append(instructions);renderItems();
 box.append(settings,node('p','저장한 폼을 시험지 생성에서 불러와 사용하세요.','hint'));controls.append(box);refresh();return box;
}
