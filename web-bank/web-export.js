import {paperFormPages} from './paper-form-export.js';
import {nativeHeaderFontPt} from './exam-form.js';
import {blobDownload} from './exam-editor.js';
import textTools from '../app/question-text.cjs';
import originalQuestion from './original-question.cjs';
import structure from '../app/structured-layout.js';
import {sourceInfo,sourceLabel} from './presentation.js';
import solutionPrint from './solution-print.cjs';
import {renderPdfMath,pdfMathTargets} from './pdf-math.js';
import {readyForExport,exportContainer,canvasOptions,pngBytes} from './export-resources.js';
export function exportDocx(options){return exportEditable(options,'docx');}
export function exportHwpx(options){return exportEditable(options,'hwpx');}
async function exportEditable({draft,loaded,layout,status,pages},format){
 draft=structuredClone(draft);loaded=loaded.map((r,i)=>({...r,question:draft.preserveOriginalOrder?originalQuestion.forOutput(structuredClone(r.question),draft.items[i].originalNumber):structuredClone(r.question),figures:r.figures.slice()}));layout={pages:layout.pages.map(p=>({columns:p.columns.map(c=>c.map(q=>({questionId:q.questionId,...(q.fragment?{fragmentIndex:q.fragmentIndex,fragment:q.fragment}:{})})))}))};
 const assets=[],questions=[],figureSizePt={};
 for(const [i,r]of loaded.entries()){
  const q={...r.question,id:draft.items[i].questionId,sourceId:r.question.sourceId||draft.items[i].questionId,include:true,body:textTools.splitSourcePoints(r.question.body).body,answer:r.question.answer||'',solution:solutionPrint.printableSolution(r.question.solution),workspaceMm:draft.items[i].workspaceMm||0,printedNumber:draft.preserveOriginalOrder?originalQuestion.printedTitle(draft.items[i].originalNumber):null,originalPoints:draft.showOriginalPoints?(draft.items[i].originalPoints??sourceInfo(r.catalog).points??structure.sourcePoints(r.question)??null):null,pointsAtBodyEnd:true,sourceCaption:draft.showSourceOnPaper?(draft.items[i].sourceCaption||sourceLabel(r.catalog)):null,materialPaths:[],materialIds:[]};
  const choices=r.element?.querySelector(':scope > .choices');q.webChoiceColumns=choices&&!choices.classList.contains('vertical')?2:1;
  q.layoutDocument=structure.forOutput(q).layoutDocument;q.structureFigurePaths={};
  for(const [j,f]of r.figures.entries()){
   if(f.node.tagName!=='IMG')throw Error(`${i+1}번 그림 생성 실패`);const img=f.node;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.naturalWidth||800;canvas.height=img.naturalHeight||600;canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve));const name=`figure-${i}-${j}.png`;assets.push({name,bytes:await blob.arrayBuffer()});const visibleId=f.measureStructureId||f.structureId,visible=visibleId?r.element.querySelector('[data-structure-id="'+CSS.escape(visibleId)+'"] img')||img:img,style=getComputedStyle(visible),fit=Math.min(parseFloat(style.width)/canvas.width,parseFloat(style.height)/canvas.height);if(!Number.isFinite(fit)||fit<=0)throw Error((i+1)+'번 그림의 출력 크기를 확인하지 못했습니다.');figureSizePt['/tmp/'+name]={width:canvas.width*fit*.75,height:canvas.height*fit*.75};if(f.structureId)q.structureFigurePaths[f.structureId]='/tmp/'+name;else if(f.id==='diagram')q.diagramPath='/tmp/'+name;else{q.materialPaths.push('/tmp/'+name);q.materialIds.push(f.id);}
  }questions.push(q);
 }
 const snapshot={title:draft.title,settings:{bodyFont:'맑은 고딕',bodyFontSize:draft.bodyFontSize??10,figureSizePt,solutionFontSize:9,wrapSolutionMath:true,workspaceLines:0,showQuestionLabels:false,showStudentNameLine:true,quadrantLayout:true,solutionGuideMode:'text',answerMode:draft.answerMode,measuredPages:layout.pages.map(p=>p.columns.map(c=>c.map(q=>q.fragment?{questionId:q.questionId,fragmentIndex:q.fragmentIndex}:q.questionId))),questionFragments:Object.fromEntries(questions.map(q=>[q.id,layout.pages.flatMap(p=>p.columns.flat()).filter(p=>p.questionId===q.id&&p.fragment).map(p=>p.fragment)]).filter(([,parts])=>parts.length))},questions};
 if(pages){if(!pages)throw Error('출력할 시험지 폼이 없습니다.');snapshot.paperFormPages=await paperFormPages(pages,assets);snapshot.settings.showStudentNameLine=false;}
 snapshot.settings.nativeHeaderFontPt=nativeHeaderFontPt(draft.title,snapshot.settings.bodyFont);
 snapshot.settings.paperForm=structuredClone(draft.paperForm);snapshot.settings.units=(draft.rules.units||[]).slice();snapshot.settings.figureScalePercent=draft.figureScalePercent;
 const worker=new Worker('./export-worker.js');try{const bytes=await new Promise((resolve,reject)=>{worker.onerror=e=>reject(Error(e.message));worker.onmessage=({data})=>{if(data.progress)status.textContent=data.progress;else if(data.error)reject(Error(data.error));else resolve(data.bytes);};worker.postMessage({snapshot,assets,format});});blobDownload(draft.title+'.'+format,new Blob([bytes],{type:format==='hwpx'?'application/hwp+zip':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));status.textContent=format==='hwpx'?'HWPX 생성 완료. 본문·수식·표는 편집 가능하며 그림은 PNG입니다. 실제 한글 열기·편집·인쇄 및 최종 쪽/단 배치는 아직 검증되지 않았습니다.':'편집 가능한 DOCX 생성 완료. Word·한글의 글꼴에 따른 최종 줄바꿈은 파일에서 확인하세요.';}finally{worker.terminate();}
}
export async function exportPdf(pages,title,status){
 const sheets=[...pages.querySelectorAll('.exam-page')].map(page=>page.cloneNode(true));
 const [{jsPDF},{default:html2canvas}]=await Promise.all([import('jspdf'),import('html2canvas')]);
 const pdf=new jsPDF({unit:'mm',format:'a4',compress:true}),clone=exportContainer();
 try{if(!sheets.length)throw Error('출력할 페이지가 없습니다.');
  for(const [i,page]of sheets.entries()){
   clone.replaceChildren(page);await readyForExport(page);
   if(page.scrollHeight>page.clientHeight+2)throw Error(`${i+1}쪽 내용이 페이지를 넘습니다. 배치를 조정하세요.`);
   status.textContent=`PDF 생성 중 ${i+1}/${sheets.length} · 수식 확인`;
   let canvas;
   try{canvas=await html2canvas(page,{...canvasOptions(clone),onclone:doc=>{for(const e of pdfMathTargets(doc.querySelector('.export-pages')))e.style.visibility='hidden';}});
    status.dataset.pdfMathCount=String(await renderPdfMath(canvas,page));if(i)pdf.addPage();pdf.addImage(await pngBytes(canvas),'PNG',0,0,210,297,undefined,'FAST');
   }finally{if(canvas){canvas.width=0;canvas.height=0;}page.remove();}
  }
  blobDownload(title+'.pdf',pdf.output('blob'));status.textContent='인쇄용 PDF 생성 완료 (약 288dpi 이미지 기반). 본문·수식 편집은 DOCX를 사용하세요.';
 }finally{clone.remove();}
}
