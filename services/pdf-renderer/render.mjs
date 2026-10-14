import {PDFDocument} from 'pdf-lib';
export const ENGINE='chromium-vector-v2-noto-1';
export async function renderVectorPdf(browser,input,identity){
 if(input.engine!==ENGINE||!Number.isSafeInteger(input.pageCount)||input.pageCount<1||input.pageCount>250||typeof input.html!=='string'||input.html.length>30*1024*1024)throw Error('PDF request size or version mismatch');
 if(!/^\d{4,12}$/.test(identity))throw Error('PDF watermark identity missing');
 const page=await browser.newPage(),timings={};let phase=performance.now();
 try{
  await page.setViewport({width:1280,height:900,deviceScaleFactor:1});
  await page.setJavaScriptEnabled(false);await page.setRequestInterception(true);
  page.on('request',request=>/^(data:|about:)/.test(request.url())?request.continue():request.abort());
  await page.setContent(input.html,{waitUntil:'load',timeout:45000});timings.htmlMs=performance.now()-phase;phase=performance.now();
  const report=await page.evaluate(async({identity,input})=>{
   document.body.getBoundingClientRect();await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));
   const sheets=[...document.querySelectorAll('.exam-page')];if(sheets.length!==input.pageCount)throw Error('PDF page count mismatch');
   for(const [i,sheet]of sheets.entries()){
    const r=sheet.getBoundingClientRect(),expected=input.geometry[i];
    if(!expected||Math.abs(r.width-expected.width)>1||Math.abs(r.height-expected.height)>1||sheet.scrollHeight>sheet.clientHeight+2)throw Error('PDF layout changed');
   }
   const marks=[...document.querySelectorAll('[data-native-watermark]')];
   const primary=marks.filter(m=>m.dataset.nativeWatermark===(input.answerWatermarks?'answer':'question'));
   if(primary.length!==input.questionCount||new Set(primary.map(m=>m.dataset.index)).size!==input.questionCount)throw Error('PDF watermark count mismatch');
   for(const mark of marks)mark.textContent=identity;
   return {pages:sheets.length,watermarks:marks.length,images:document.images.length};
  },{identity,input:{...input,html:undefined}});
  timings.resourcesMs=performance.now()-phase;phase=performance.now();
  const bytes=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false,margin:{top:0,right:0,bottom:0,left:0},timeout:60000});
  timings.convertMs=performance.now()-phase;phase=performance.now();
  const pdf=await PDFDocument.load(bytes);if(pdf.getPageCount()!==input.pageCount)throw Error('Printed page count mismatch');
  pdf.setAuthor(identity);pdf.setTitle(input.title||'시험지');pdf.setProducer(ENGINE);
  const data=await pdf.save({useObjectStreams:true});timings.finalizeMs=performance.now()-phase;
  return {data,timings,report};
 }finally{await page.close();}
}
