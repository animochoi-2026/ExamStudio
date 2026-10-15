'use strict';
// The launcher may close its capture pipe while Electron finishes a PDF.
for(const stream of [process.stdout,process.stderr])stream.on('error',error=>{if(error.code!=='EPIPE')throw error;});
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){
 const {spawnSync}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const result=spawnSync(require('electron'),[__filename],{env,stdio:'inherit',windowsHide:true,timeout:90000});
 if(result.error)throw result.error;process.exitCode=result.status??1;
}else{
 const {app,BrowserWindow}=require('electron');
 const dir=fs.mkdtempSync(path.join(root,'data/validation/pdf-columns-'));app.setPath('userData',path.join(dir,'profile'));app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});
 app.whenReady().then(async()=>{
  const {exportPdf}=require('../app/pdf-export.cjs');
  const snapshot=process.env.EXAM_TEST_PDF_SNAPSHOT?JSON.parse(fs.readFileSync(process.env.EXAM_TEST_PDF_SNAPSHOT,'utf8')):{title:'PDF 답지 배치 검사',settings:{workspaceLines:0},questions:[1,2].map(i=>({id:'q'+i,kind:'original',body:`${i}번째 수학 문제입니다.`,choices:[],answer:String(i),solution:Array.from({length:60},(_,n)=>`해설${i}단계${n+1} 조건을 식으로 나타내고 그 이유를 설명합니다. $x+1=2$`).join('\n')+`\n해설${i}완료표시`}))};
  snapshot.title='PDF 답지 2단 확인';snapshot.questions=snapshot.questions.slice(0,3);snapshot.settings={...snapshot.settings,workspaceLines:0};
  const input=path.join(dir,'snapshot.json');fs.writeFileSync(input,JSON.stringify(snapshot));
  const result=await exportPdf({BrowserWindow,snapshotPath:input,directory:dir,target:path.join(dir,'answers.pdf')});
  const output=typeof result==='string'?result:result.path;assert.ok(fs.readFileSync(output).subarray(0,5).equals(Buffer.from('%PDF-')));
  const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await win.loadFile(path.join(dir,'print.html'));
  const layout=await win.webContents.executeJavaScript(`(()=>{const pages=[...document.querySelectorAll('.exam-page')];return {text:document.body.textContent,pages:pages.map(p=>({answer:p.classList.contains('answer-page'),width:p.clientWidth,height:p.clientHeight,overflow:p.scrollHeight-p.clientHeight,fragments:p.querySelectorAll('.solution-flow').length,text:p.textContent.trim()}))};})()`);
  assert.ok(layout.pages.some(p=>p.answer&&p.fragments>1),'Detailed answers use measured column fragments');
  for(const p of layout.pages){assert.ok(p.width>700&&p.height>1000,'A4 page dimensions');assert.ok(p.overflow<=2,'No page overflows');assert.ok(p.text,'No blank page DOM');}win.destroy();
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),pdfTask=pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(output)),useSystemFonts:true}),pdf=await pdfTask.promise;
  assert.equal(pdf.numPages,layout.pages.length,'Every laid-out page is included exactly once');
  const allText=layout.text;
  for(let i=1;i<=pdf.numPages;i++){
   const page=await pdf.getPage(i),ops=await page.getOperatorList(),images=ops.fnArray.map((op,j)=>({op,args:ops.argsArray[j]})).filter(x=>[pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject].includes(x.op));
   assert.equal(images.length,1,'One complete page image, not a server-native page: '+i);
   assert.ok(images[0].args[1]>=2300&&images[0].args[2]>=3300,'Original scale 3 quality retained');
   assert.ok(Math.abs(page.view[2]-595.28)<1&&Math.abs(page.view[3]-841.89)<1,'A4 media box');
  }
  if(!process.env.EXAM_TEST_PDF_SNAPSHOT)for(const i of [1,2]){assert.ok(allText.includes('해설'+i+'완료표시'));for(let n=1;n<=60;n++)assert.ok(allText.includes(`해설${i}단계${n}`),`Missing solution ${i}, step ${n}`);}
  await pdfTask.destroy();console.log('PASS actual Electron browser-image PDF, one scale-3 image per A4 page, complete solution DOM, no overflow and measured answer columns: '+output);app.quit();
 }).catch(e=>{console.error(e);app.exit(1);});
}
