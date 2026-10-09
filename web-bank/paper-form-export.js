// Capture only the form. Questions and equations stay with the existing native
// DOCX/HWPX converters; no browser text or math is substituted into those engines.
import {readyForExport,exportContainer,canvasOptions,pngBytes} from './export-resources.js';
export async function paperFormPages(pages,assets){
 const {default:html2canvas}=await import('html2canvas');
 const sheets=[...pages.querySelectorAll('.exam-page:not(.answer-page)')].map(page=>page.cloneNode(true)),clone=exportContainer();
 try{
  const result=[];
  for(const [index,page]of sheets.entries()){
   clone.replaceChildren(page);await readyForExport(page);
   const rect=page.getBoundingClientRect(),columns=page.querySelector('.exam-columns'),col=columns.getBoundingClientRect(),first=columns.querySelector('.print-question'),intro=columns.querySelector('.mock-instructions'),mm=210/rect.width;
   const firstColumn=columns.querySelector('.exam-column'),left=firstColumn.getBoundingClientRect();
   const data={topMm:(col.top-rect.top)*mm,leftMm:(col.left-rect.left)*mm,rightMm:(rect.right-col.right)*mm,bottomMm:(rect.bottom-col.bottom)*mm,gapMm:(col.width-2*left.width)*mm,introMm:intro?(first&&first.parentElement===firstColumn?(first.getBoundingClientRect().top-col.top)*mm:(intro.getBoundingClientRect().height+12)*mm):0,description:[page.querySelector('.mock-title,.exam-header-title')?.textContent,intro?.textContent,page.querySelector('.mock-page-number')?.getAttribute('aria-label')].filter(Boolean).join('\n')};
   const logo=page.querySelector('.mock-logo');
   if(logo){
    const box=logo.getBoundingClientRect(),canvas=document.createElement('canvas');canvas.width=Math.ceil(box.width*3);canvas.height=Math.ceil(box.height*3);
    const ctx=canvas.getContext('2d'),fit=Math.min(canvas.width/logo.naturalWidth,canvas.height/logo.naturalHeight);ctx.globalAlpha=Number(getComputedStyle(logo).opacity);ctx.drawImage(logo,(canvas.width-logo.naturalWidth*fit)/2,(canvas.height-logo.naturalHeight*fit)/2,logo.naturalWidth*fit,logo.naturalHeight*fit);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),name=`paper-logo-${index}.png`;assets.push({name,bytes:await blob.arrayBuffer()});data.logo={path:'/tmp/'+name,xMm:(box.left-rect.left)*mm,yMm:(box.top-rect.top)*mm,widthMm:box.width*mm,heightMm:box.height*mm};logo.remove();
   }
   for(const q of page.querySelectorAll('.print-question'))q.remove();
   // The independent logo sits below this transparent form overlay. A white
   // page bitmap would hide it; the actual document page supplies white paper.
   page.style.background='transparent';data.backgroundTransparent=true;
   const canvas=await html2canvas(page,{...canvasOptions(clone),backgroundColor:null});
   try{const name=`paper-form-${index}.png`;assets.push({name,bytes:(await pngBytes(canvas)).buffer});result.push({...data,backgroundPath:'/tmp/'+name});}finally{canvas.width=0;canvas.height=0;page.remove();}
  }
  return result;
 }finally{clone.remove();}
}
