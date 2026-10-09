'use strict';
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const katex=require('katex'),{diagramSvg,questionDiagram}=require('./geometry.cjs');
const {flowParts,figureSlot,boxSlot}=require('./question-presentation.js');
const structure=require('./structured-layout.js');
const solutionGuideRender=require('./solution-guide-render.js');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function math(value){
 const text=String(value||''),pattern=/\$\$([\s\S]+?)\$\$|(?<!\\)\$([^$\n]+?)(?<!\\)\$/g;let html='',last=0;
 for(const m of text.matchAll(pattern)){html+=escape(text.slice(last,m.index))+katex.renderToString(m[1]??m[2],{displayMode:m[1]!==undefined,throwOnError:true,trust:false,strict:false});last=m.index+m[0].length;}
 return html+escape(text.slice(last));
}
function documentHtml({title,settings,questions,layout,paperForm,scope}){
 questions=questions.map(q=>({...q,solution:require('./solution-print.cjs').printableSolution(q.solution)}));
 // Keep prose styles separate from KaTeX's .text spans (e.g. \\text{ cm}).
 // Applying pre-wrap to those spans breaks units inside min-content math boxes.
 const typography=require('./document-style.cjs').documentStyle(settings);
 const symbols='①②③④⑤⑥⑦⑧',css=pathToFileURL(require.resolve('katex/dist/katex.min.css')).href;
 const space=Math.max(0,Math.min(6,Number(settings.workspaceLines??2)))*18;
 const min='0';
 const items=questions.map((q,i)=>{
  const figures=(q.materialImages||[]).filter(m=>!q.hiddenFigureIds?.includes(m.id)).map((m,index)=>({id:m.id||`material-${index}`,html:`<figure><img class="source-material" src="${escape(m.dataUrl)}" alt="${escape(m.label)}"></figure>`}));
  if(q.diagramMode==='source'&&!q.hiddenFigureIds?.includes('diagram')){if(!q.sourceFigureDataUrl)throw Error('원본 그림 이미지가 없습니다.');figures.push({id:'diagram',html:`<figure class="diagram-figure"><img class="source-material" src="${escape(q.sourceFigureDataUrl)}" alt="원본 그림"></figure>`});}
  const svg=q.diagramMode==='source'||q.hiddenFigureIds?.includes('diagram')?null:diagramSvg(questionDiagram(q));if(svg)figures.push({id:'diagram',html:`<figure class="diagram-figure">${svg}</figure>`});
  const box=q.statementBox?.length?'<div class="box">'+q.statementBox.map(math).join('<br>')+'</div>':'';
  const at=slot=>(box&&boxSlot(q)===slot?box:'')+figures.filter(f=>figureSlot(q,f.id)===slot).map(f=>f.html).join('');
  const structured=structure.html(q,{number:i+1,math,figure:n=>n.diagram?diagramSvg(n.diagram,structure.diagramOptions(q,n)):figures.find(f=>f.id===n.figureId)?.html});
  const body=flowParts(q.body).map((part,index)=>`${index?at(part.slot):''}<div class="subquestion-part${index?' subquestion-following':''}">${index===0?`<b>${i+1}.</b> `:''}${math(part.text)}</div>`).join('');
  return `<article data-question-index="${i}" data-layout="${escape(q.layout||'auto')}" class="question print-question${!layout&&q.layout==='full'?' full-column':''}">${settings?.showQuestionLabels===false?'':`<small>${q.kind==='original'?'원본문제':'유사문제'}</small>`}<div class="${q.bodyBorder?'printed-question-border':''}">${structured??(at('before')+'<div class="pdf-text">'+body+'</div>'+at('after'))}${q.choices?.length?'<div class="choices">'+q.choices.map((v,j)=>`${symbols[j]||j+1} ${math(String(v).replace(/^\s*(?:[①-⑳]\s*)+/,''))}`).join('<br>')+'</div>':''}</div><div style="height:${space}pt"></div></article>`;
 });
 const byId=new Map(questions.map((q,i)=>[q.id,items[i]]));
 const planned=Array.isArray(layout)&&layout.length&&layout.flatMap(p=>p.questionIds||[]).join('|')===questions.map(q=>q.id).join('|');
 const bodyPages=planned?layout.map((page,index)=>{
  if(page.overflow)return `<section class="question-page overflow-page"><h1>${escape(title)}</h1><div class="columns">${page.questionIds.map(id=>byId.get(id)).join('')}</div></section>`;
  return `<section class="question-page"><h1>${escape(title)}</h1><div class="planned-columns">${[0,1].map(column=>`<div class="planned-column">${page.positions.filter(p=>p.column===column).map((p,i,positions)=>`<div class="planned-slot${space&&page.capacity===4&&i<positions.length-1?' half-slot':''}">${byId.get(p.questionId)}</div>`).join('')}</div>`).join('')}</div></section>`;
 }).join(''):`<h1>${escape(title)}</h1><main class="columns">${items.join('')}</main>`;
 const notes=`<section class="notes columns"><h2>빠른 정답</h2><div class="quick-answers">${questions.map((q,i)=>`<div>${escape(q.printedNumber||i+1)}번  ${math(q.answer||'정답·풀이 미생성')}</div>`).join('')}</div>${settings.answerMode==='quick'?'':`<h2>상세 풀이</h2>${questions.map((q,i)=>`<article><h3>${escape(q.printedNumber||i+1)}번</h3><div class="pdf-text">정답: ${math(q.answer||'정답·풀이 미생성')}</div><div class="pdf-text">${solutionGuideRender.html(q,{math})??math(q.solution||'정답·풀이 미생성')}</div></article>`).join('')}`}</section>`;
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' file:; font-src file: data:; img-src data:; script-src file: 'unsafe-inline';"><link rel="stylesheet" href="${css}"><link rel="stylesheet" href="${pathToFileURL(path.join(__dirname,'paper-form.css')).href}"><script src="${pathToFileURL(path.join(__dirname,'paper-form-runtime.js')).href}"></script><style>
 ${structure.css}
  ${solutionGuideRender.css}
 @page{size:A4 portrait;margin:0}@page examNotes{size:A4 portrait;margin:14mm}:root,body{background:white}*{box-sizing:border-box}body{margin:0;color:#161b19;font-family:'${typography.bodyFont}',sans-serif;font-size:${typography.bodyFontSize}pt;line-height:1.55}h1{font-size:15pt;margin:0 0 8mm}h2{font-size:13pt}h3{font-size:10pt;margin:0 0 3mm}.columns{column-count:2;column-gap:10mm;column-rule:0;column-fill:auto}.question{font-family:inherit;font-size:inherit;line-height:inherit;break-inside:avoid;min-height:${min};padding-bottom:6mm}.subquestion-part+.subquestion-part{margin-top:1em}.subquestion-following{margin-top:1em}.pdf-text{white-space:pre-wrap;overflow-wrap:anywhere}small{font-size:9pt;color:#555}.diagram-figure > img{display:block;width:100%;height:auto;max-height:58mm;object-fit:contain;margin:3mm auto}.diagram-figure > svg{display:block;width:100%;height:auto;max-height:66mm;margin:3mm auto}.box{border:0.6pt solid #777;padding:3mm;margin:3mm 0}.choices{margin-top:3mm}.katex{font-size:1.05em}.katex-display{margin:2mm 0;overflow:visible}.source-material{display:block;max-width:100%;height:auto;max-height:220mm;object-fit:contain}figure{margin:3mm 0}.quick-answers{margin-bottom:8mm}.quick-answers>div{break-inside:avoid}.notes{break-before:page;font-size:${typography.solutionFontSize}pt;font-family:'${typography.solutionFont}',sans-serif;line-height:1.65}.notes article{margin-bottom:7mm;break-inside:auto}.notes h2,.notes h3{font-size:${typography.solutionFontSize}pt;break-after:avoid}.notes .pdf-text{orphans:2;widows:2}.page-column-rule{position:fixed;left:50%;top:0;bottom:0;width:1pt;background:#000;transform:translateX(-50%);pointer-events:none}h1{position:relative;background:white}.katex-display{break-inside:avoid}
 .printed-question-border{border:0.6pt solid #777;padding:3mm;margin:2mm 0}.question-page+.question-page{break-before:page}.planned-columns{display:block;font-size:0}.planned-column{display:inline-block;vertical-align:top;width:calc((100% - 10mm)/2);min-width:0;font-size:${typography.bodyFontSize}pt}.planned-column+.planned-column{margin-left:10mm}.half-slot{min-height:112mm}.planned-slot{break-inside:avoid}.overflow-page .question{break-inside:auto}.overflow-page .pdf-text{orphans:2;widows:2}.overflow-page figure{break-inside:avoid}.question-page{clear:both}.full-column{break-before:column;break-after:column}
 @page examForm{size:A4 portrait;margin:0}.question-page.exam-page{page:examForm;margin:0;border:0;box-shadow:none}.question-page.exam-page .planned-column{width:calc((100% - 9mm)/2)}.question-page.exam-page .planned-column+.planned-column{margin-left:9mm}.notes{column-rule:1pt solid #000;width:182mm;padding:0;page:examNotes}.exam-form-mock .exam-column{padding-top:0}
 .question.print-question{padding-bottom:0;line-height:1.5}.question.print-question .native-question{line-height:1.5}.question.print-question .choices{margin-top:0}.question.print-question .katex-display{margin:1em 0;padding:3px 0}
 @media print{html,body{width:auto!important}}
 </style></head><body><div class="page-column-rule" aria-hidden="true"></div>${bodyPages}${notes}</body></html>`;
}
async function exportPdf({BrowserWindow,snapshotPath,directory,target,measureOnly=false}){
 const snapshot=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));const printSnapshot={...snapshot,questions:snapshot.questions.map(q=>({...q,printAssets:require('./print-assets.cjs').printAssets(q,snapshot.settings)}))};const html=path.join(directory,'print.html');fs.writeFileSync(html,documentHtml(snapshot),'utf8');
 const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await win.loadURL(pathToFileURL(html).href);await win.webContents.executeJavaScript('ExamPaperForm.renderQuestions('+JSON.stringify(printSnapshot)+')');await win.webContents.executeJavaScript('Promise.all([document.fonts.ready,...Array.from(document.images,i=>i.decode())]).then(()=>true)');
  const report=await win.webContents.executeJavaScript('('+require('./pdf-pagination.cjs').paginatePdf.toString()+')('+JSON.stringify({mode:snapshot.settings?.layout||'auto',space:snapshot.settings?.workspaceLines??2,snapshot})+',('+require('./exam-layout.js').paginateQuestionAreas.toString()+'))');
  fs.writeFileSync(path.join(directory,'pdf-layout.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(html,'<!doctype html>'+await win.webContents.executeJavaScript('document.documentElement.outerHTML'),'utf8');
  if(measureOnly){
   const figureSizePt=await win.webContents.executeJavaScript('Object.fromEntries([...document.querySelectorAll(".question img[data-export-path]")].map(i=>{const r=i.getBoundingClientRect();return [i.dataset.exportPath,{width:r.width*.75,height:r.height*.75}]}))');
   const measured={...snapshot,settings:{...snapshot.settings,quadrantLayout:snapshot.settings?.layout!=='2',measuredColumnHeightPt:report.available*.75,measuredPages:report.pages.map(p=>p.positions.map(c=>c.map(p=>p.fragment?{questionId:snapshot.questions[p.questionId].id,fragmentIndex:p.fragmentIndex}:snapshot.questions[p.questionId].id))),questionFragments:Object.fromEntries(snapshot.questions.map((q,i)=>[q.id,report.pages.flatMap(p=>p.positions.flat()).filter(p=>p.questionId===i&&p.fragment).map(p=>p.fragment)]).filter(([,parts])=>parts.length)),measuredOverflowPages:report.pages.map(p=>!!p.overflow)}};
   if(report.formGeometry){
    const capture=await win.webContents.executeJavaScript('ExamPaperForm.capture()');
    for(const asset of capture.assets){if(path.basename(asset.name)!==asset.name)throw Error('폼 이미지 경로 오류');fs.writeFileSync(path.join(directory,asset.name),Buffer.from(asset.bytes));}
    measured.paperFormPages=JSON.parse(JSON.stringify(capture.pages).replaceAll('/tmp/',directory.replaceAll('\\','/')+'/'));measured.settings.showStudentNameLine=false;
    measured.settings.nativeHeaderFontPt=await win.webContents.executeJavaScript('ExamPaperForm.nativeHeaderFontPt('+JSON.stringify(snapshot.title)+','+JSON.stringify(snapshot.settings?.bodyFont||'맑은 고딕')+')');
   }
   measured.settings.figureSizePt={...snapshot.settings?.figureSizePt,...figureSizePt};
   fs.writeFileSync(snapshotPath,JSON.stringify(measured));return {snapshot:measured,report};
  }
  const data=await win.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,pageSize:'A4',displayHeaderFooter:false});
  if(data.length<100||data.subarray(0,5).toString()!=='%PDF-')throw Error('PDF 출력 결과를 확인하지 못했습니다.');
  const staged=path.join(directory,'print.pdf');fs.writeFileSync(staged,data);return require('./export-names.cjs').publishWord(staged,target);
 }finally{win.destroy();}
}
module.exports={math,documentHtml,exportPdf};
