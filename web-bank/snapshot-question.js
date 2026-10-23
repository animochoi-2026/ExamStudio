import {questionContent,questionArticle} from './print-question.js';
import {formatSourcePoints} from './presentation.js';
import modern from '../app/modern-minimal.cjs';
export function snapshotQuestion(q,index,settings={}){
 const figures=(q.printAssets||[]).map(a=>{const node=document.createElement('img');node.src=a.dataUrl;node.alt='문항 그림';if(a.path)node.dataset.exportPath=a.path;if(a.sizePt){node.dataset.printMeasured='true';node.style.width=a.sizePt.width+'pt';node.style.height=a.sizePt.height+'pt';node.style.objectFit='contain';}return {...a,node};});
 const element=questionContent(modern.isModern({settings})?{...q,showOriginalPoints:false}:q,figures);
 const article=questionArticle(element,{index,number:q.printedNumber,points:q.originalPoints!=null?formatSourcePoints(q.originalPoints):null,source:q.sourceCaption,fontSize:modern.bodySize({settings}),fontFamily:settings.bodyFont||'Noto Sans KR',labels:settings.showQuestionLabels!==false,kind:q.kind});
 article.classList.add('question');article.dataset.questionIndex=index;article.dataset.layout=q.layout||'auto';article.dataset.breakBefore=q.breakBefore||'';
 const space=q.workspaceMm!=null?Number(q.workspaceMm)*96/25.4:Math.max(0,Math.min(6,Number(settings.workspaceLines??2)))*24;
 article.dataset.workspacePx=space;
 return {article,element,figures,question:q};
}
