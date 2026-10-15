import downloadSecurity from '../app/download-security.cjs';
import {renderPdfMath,pdfMathTargets} from './pdf-math.js';
import {readyForExport,exportContainer,canvasOptions,pngBytes} from './export-resources.js';
export const PDF_ENGINE='browser-image-png3-v1';
export async function prepareImagePdf(pages,title,status,{download=false,securityWatermark,questionCount,answerWatermarks=false,section='all'}={}){
 const started=performance.now(),signal=status.pdfSignal,progress=status.pdfProgress||(()=>{});signal?.throwIfAborted();
 const sheets=[...pages.querySelectorAll('.exam-page')].filter(page=>section==='all'||page.classList.contains('answer-page')===(section==='answers')).map(page=>page.cloneNode(true));
 if(section!=='all')title+=' · '+(section==='answers'?'정답·해설':'학생용 문제');
 const [{jsPDF},{default:html2canvas}]=await Promise.all([import('jspdf'),import('html2canvas')]);
 const pdf=new jsPDF({unit:'mm',format:'a4',compress:true}),clone=exportContainer();
 const endings=new Map(),answerEnds=new Set();if(securityWatermark!==undefined){downloadSecurity.identifier(securityWatermark);pdf.setProperties({author:securityWatermark});if(!answerWatermarks){for(const [pageIndex,page]of sheets.entries())for(const q of page.querySelectorAll('.print-question[data-index]'))endings.set(q.dataset.index,{pageIndex,q});if(endings.size!==questionCount)throw Error('출력 문항 수를 확인하지 못했습니다.');}}

 try{if(!sheets.length)throw Error('출력할 페이지가 없습니다.');
  progress({stage:'pages',done:0,total:sheets.length});
  for(const [i,page]of sheets.entries()){signal?.throwIfAborted();
   clone.replaceChildren(page);progress({stage:'resources',done:i,total:sheets.length});await readyForExport(page);signal?.throwIfAborted();
   if(page.scrollHeight>page.clientHeight+2)throw Error(`${i+1}쪽 내용이 페이지를 넘습니다. 배치를 조정하세요.`);
   status.textContent=`PDF 생성 중 ${i+1}/${sheets.length} · 수식 확인`;
   let canvas;
   try{canvas=await html2canvas(page,{...canvasOptions(clone),onclone:doc=>{for(const e of pdfMathTargets(doc.querySelector('.export-pages')))e.style.visibility='hidden';}});
    const mathCount=await renderPdfMath(canvas,page);if(status.dataset)status.dataset.pdfMathCount=String(mathCount);signal?.throwIfAborted();if(i)pdf.addPage();pdf.addImage(await pngBytes(canvas),'PNG',0,0,210,297,undefined,'FAST');
    if(securityWatermark!==undefined){const bounds=page.getBoundingClientRect();pdf.setFontSize(1);pdf.setTextColor(255,255,255);for(const item of endings.values())if(item.pageIndex===i){const r=item.q.getBoundingClientRect(),x=(r.left-bounds.left+2)/bounds.width*210,y=(r.bottom-bounds.top-2)/bounds.height*297;if(!Number.isFinite(y)||y<0||y>297)throw Error('출력 위치를 확인하지 못했습니다.');pdf.text(securityWatermark,x,y);}
     for(const marker of page.querySelectorAll('.answer-watermark[data-index]')){const r=marker.getBoundingClientRect(),frame=marker.closest('.solution-flow-frame')?.getBoundingClientRect()||bounds;if(r.left<frame.left-1||r.right>frame.right+1||r.top<frame.top-1||r.bottom>frame.bottom+1)continue;if(answerEnds.has(marker.dataset.index))throw Error('정답지 문항 위치가 중복되었습니다.');answerEnds.add(marker.dataset.index);pdf.text(securityWatermark,(r.left-bounds.left)/bounds.width*210,(r.bottom-bounds.top)/bounds.height*297);}
    }

   }finally{if(canvas){canvas.width=0;canvas.height=0;}page.remove();sheets[i]=null;for(const [key,value]of endings)if(value.pageIndex===i)endings.delete(key);}
   progress({stage:'pages',done:i+1,total:sheets.length});await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(securityWatermark!==undefined&&answerWatermarks&&answerEnds.size!==questionCount)throw Error('정답지의 전체 문항 위치를 확인하지 못했습니다.');
  signal?.throwIfAborted();progress({stage:'assemble',done:sheets.length,total:sheets.length});
  const file={name:title+'.pdf',blob:pdf.output('blob'),pageCount:sheets.length,timings:{imagePdfMs:performance.now()-started}};if(!download)return file;const url=URL.createObjectURL(file.blob),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='인쇄용 PDF 생성 완료 (약 288dpi 이미지 기반). 본문·수식 편집은 DOCX를 사용하세요.';
 }finally{clone.remove();}
}
