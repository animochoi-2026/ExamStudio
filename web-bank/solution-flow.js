import {answerHeader,fitFormTitles} from './exam-form.js';
import solutionPrint from './solution-print.cjs';
import originalQuestion from './original-question.cjs';
// Use the browser's native column fragmentation for detailed solutions only.
// The same clipped page elements feed the existing PDF exporter.
export async function appendSolutionPages({pages,title='',loaded,items,node,mathText,height,paddingTop=null,isValid=()=>true}){
 const measured=node('section','','exam-page answer-page');measured.style.cssText='position:fixed;left:-10000px;top:0;visibility:hidden';
 const frame=node('div','','solution-flow-frame'),stream=node('div','','solution-flow');stream.style.height=height+'px';frame.append(stream);measured.append(frame);document.body.append(measured);
 try{
  stream.append(node('h4','빠른 정답','solution-heading'));
  for(const [i,r]of loaded.entries()){const number=originalQuestion.answerTitle(items[i].originalNumber||String(i+1));stream.append(mathText(`${number}번  ${r.question.answer||'정답·풀이 미생성'}`));}
  stream.append(node('h4','상세 풀이','solution-heading solution-detail-heading'));
  for(const [i,r]of loaded.entries()){
   const entry=node('div','','solution-entry'),heading=mathText(`${originalQuestion.answerTitle(items[i].originalNumber||String(i+1))}번 정답  ${r.question.answer||'정답·풀이 미생성'}`);heading.classList.add('solution-number');entry.append(heading,mathText(solutionPrint.printableSolution(r.question.solution)||'정답·풀이 미생성'));stream.append(entry);
  }
  await document.fonts.ready;if(!isValid())return false;
  const width=frame.getBoundingClientRect().width,gap=parseFloat(getComputedStyle(stream).columnGap),columnWidth=(width-gap)/2;
  if(!(height>0&&width>0&&gap>=0))throw Error('상세 풀이의 단 크기를 확인하지 못했습니다.');
  for(const e of stream.querySelectorAll('.katex-display,img'))if(e.getBoundingClientRect().height>height||e.getBoundingClientRect().width>columnWidth+1)throw Error('상세 풀이의 수식 또는 그림이 한 단보다 큽니다. 크기를 확인하세요.');
  const count=Math.max(1,Math.ceil((stream.scrollWidth+gap-1)/(width+gap)));
  for(let i=0;i<count;i++){
   const sheet=node('section','','exam-page answer-page solution-flow-page');if(paddingTop!==null)sheet.style.paddingTop=paddingTop+'px';sheet.append(answerHeader(node,title,'정답 및 해설'));
   const viewport=node('div','','solution-flow-frame'),copy=stream.cloneNode(true);copy.style.transform=`translateX(${-i*(width+gap)}px)`;viewport.append(copy);sheet.append(viewport);pages.append(sheet);fitFormTitles(sheet);
  }
  return true;
 }finally{measured.remove();}
}
