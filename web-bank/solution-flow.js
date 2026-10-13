import {answerHeader,fitFormTitles} from './exam-form.js';
import solutionPrint from './solution-print.cjs';
import originalQuestion from './original-question.cjs';
import {solutionFragments} from './solution-fragments.js';
// Native columns determine the line breaks. Each output page owns only its
// fragments, so detailed previews/PDFs grow with content, not content × pages.
export async function appendSolutionPages({pages,title='',compositionText='',loaded,items,node,mathText,height,paddingTop=null,isValid=()=>true,markAnswers=false}){
 const measured=node('section','','exam-page answer-page');measured.style.cssText='position:fixed;left:-10000px;top:0;visibility:hidden';
 const frame=node('div','','solution-flow-frame'),stream=node('div','','solution-flow');stream.style.height=height+'px';frame.append(stream);measured.append(frame);document.body.append(measured);
 try{
  stream.append(node('h4','빠른 정답','solution-heading'));if(compositionText)stream.append(node('p',compositionText,'answer-composition'));
  for(const [i,r]of loaded.entries()){const number=originalQuestion.answerTitle(items[i].originalNumber||String(i+1));stream.append(mathText(`${number}번  ${r.question.answer||'정답·풀이 미생성'}`));}
  stream.append(node('h4','상세 풀이','solution-heading solution-detail-heading'));
  for(const [i,r]of loaded.entries()){
   const entry=node('div','','solution-entry'),heading=mathText(`${originalQuestion.answerTitle(items[i].originalNumber||String(i+1))}번 정답  ${r.question.answer||'정답·풀이 미생성'}`);heading.classList.add('solution-number');entry.append(heading,mathText(solutionPrint.printableSolution(r.question.solution)||'정답·풀이 미생성'));if(markAnswers){const mark=node('span','\u200b','answer-watermark');mark.dataset.index=i;entry.append(mark);}stream.append(entry);
   if(i%4===3){await new Promise(resolve=>setTimeout(resolve,0));if(!isValid())return false;}
  }
  await document.fonts.ready;if(!isValid())return false;
  const width=frame.getBoundingClientRect().width,gap=parseFloat(getComputedStyle(stream).columnGap),columnWidth=(width-gap)/2;
  if(!(height>0&&width>0&&gap>=0))throw Error('상세 풀이의 단 크기를 확인하지 못했습니다.');
  for(const e of stream.querySelectorAll('.katex-display,img'))if(e.getBoundingClientRect().height>height||e.getBoundingClientRect().width>columnWidth+1)throw Error('상세 풀이의 수식 또는 그림이 한 단보다 큽니다. 크기를 확인하세요.');
  const count=Math.max(1,Math.ceil((stream.scrollWidth+gap-1)/(width+gap)));
  const fragments=solutionFragments(stream,frame,columnWidth,gap);
  for(let i=0;i<count;i++){
   const sheet=node('section','','exam-page answer-page solution-flow-page');if(paddingTop!==null)sheet.style.paddingTop=paddingTop+'px';sheet.append(answerHeader(node,title,'정답 및 해설'));
   const viewport=node('div','','solution-flow-frame');
   for(const part of fragments.filter(p=>Math.floor(p.column/2)===i)){
    const copy=node('div','','solution-flow');copy.style.cssText=`position:absolute;column-count:auto;width:${part.width}px;left:${part.left-i*(width+gap)}px;top:${part.top}px`;
    copy.append(part.element);viewport.append(copy);
   }
   sheet.append(viewport);pages.append(sheet);fitFormTitles(sheet);
   await new Promise(resolve=>setTimeout(resolve,0));if(!isValid())return false;
  }
  return true;
 }finally{measured.remove();}
}
