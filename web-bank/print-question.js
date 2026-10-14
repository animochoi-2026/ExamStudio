// Shared DOM for web and the desktop print window. Asset loading stays with
// each platform; content order, choice columns and math use one renderer.
import {mathText} from './math-text.js';
import structure from '../app/structured-layout.js';
import presentation from '../app/question-presentation.js';
import textTools from '../app/question-text.cjs';
export function questionContent(question,figures=[]){
 if(!document.getElementById('question-structure-styles')){const style=document.createElement('style');style.id='question-structure-styles';style.textContent=structure.css;document.head.append(style);}
 const q=structure.forOutput(question),root=document.createElement('div');root.className='native-question';
 const state=structure.status(q);if(state.missing)throw Error(state.message);
 if(state.active){
  const byId=new Map(figures.flatMap(f=>[f.measureStructureId,f.structureId,f.id].filter(Boolean).map(id=>[id,f.node])));
  const content=document.createElement('div');content.innerHTML=structure.html(q,{math:t=>mathText(t).innerHTML,figure:n=>(byId.get(n.id)||byId.get(n.figureId))?.outerHTML});root.append(content);
  if(q.bodyBorder)content.className='statement-box';
  for(const warning of q._outputFragment?[]:structure.warnings(q)){const p=document.createElement('p');p.className='question-review-warning';p.textContent=warning;root.append(p);}
 }else{
  const content=q.bodyBorder?document.createElement('div'):root;if(q.bodyBorder){content.className='statement-box body-border-content';root.append(content);}
  const attach=slot=>{if(q.statementBox?.length&&presentation.boxSlot(q)===slot){const box=document.createElement('div');box.className='statement-box';q.statementBox.forEach(t=>box.append(mathText(t)));content.append(box);}for(const f of figures)if(presentation.figureSlot(q,f.id)===slot)content.append(f.node);};
  for(const part of presentation.flowParts(q.body)){attach(part.slot);content.append(mathText(part.text));}attach('after');
 }
 const choices=document.createElement('div');choices.className=q.choiceLayout==='vertical'||q.webChoiceColumns===1?'choices vertical':'choices';
 (q.choices||[]).forEach((v,i)=>choices.append(mathText(`${'①②③④⑤⑥⑦⑧'[i]||i+1} ${String(v).replace(/^[①②③④⑤⑥⑦⑧]\s*/, '')}`)));root.append(choices);
 return root;
}
export function questionArticle(element,{index,number,points,source,fontSize=10,fontFamily='Noto Sans KR',labels=false,kind}={}){
 // Prepared render nodes can be reused after automatic ordering. Remove only
 // labels added by this renderer before numbering them again.
 // Review notices stay in question detail, never in the student paper.
 for(const label of element.querySelectorAll('.question-number,.source-points,.question-review-warning'))label.remove();
 const q=document.createElement('article');q.className='print-question';q.style.fontSize=fontSize+'pt';q.style.fontFamily=`"${fontFamily}",sans-serif`;q.dataset.index=index;
 const printed=String(number??index+1),label=document.createElement('strong');label.className='question-number';label.textContent=printed+(/^\d+$/.test(printed)?'.':'');q.append(element);
 let first=element.querySelector('[data-structure-id]:not([data-structure-id^="set-common-"])')||element.firstElementChild;
 while(first&&(!first.className||first.classList.contains('structured-content')))first=first.firstElementChild;
 // Prefix only ordinary prose. A leading figure, condition box or display
 // equation retains its separate block and original position.
 if(first?.matches('.question-text,.structure-paragraph')&&!first.firstElementChild?.matches('.katex-display'))first.prepend(label,document.createTextNode(' '));
 else q.prepend(label);
 if(points!=null){const p=document.createElement('span');p.className='source-points';p.textContent=` (${points})`;const last=[...element.querySelectorAll(':scope > .question-text,:scope > .body-border-content > .question-text')].at(-1);if(last)last.append(p);else element.prepend(p);}
 if(source){const n=document.createElement('small');n.className='print-source';n.textContent=source;q.append(n);}
 if(labels){const n=document.createElement('small');n.textContent=kind==='original'?'원본문제':'유사문제';q.prepend(n);}
 return q;
}
