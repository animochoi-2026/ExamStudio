'use strict';
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
  const styles=await win.webContents.executeJavaScript(`(()=>{const n=getComputedStyle(document.querySelector('.notes')),q=getComputedStyle(document.querySelector('.quick-answers')),r=getComputedStyle(document.querySelector('.notes'));return {columns:n.columnCount,quick:q.columnCount,color:r.columnRuleColor,rule:r.columnRuleStyle};})()`);
  assert.deepEqual(styles,{columns:'2',quick:'auto',color:'rgb(0, 0, 0)',rule:'solid'});win.destroy();
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),pdfTask=pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(output)),useSystemFonts:true}),pdf=await pdfTask.promise;
  let allText='';
  for(let i=1;i<=pdf.numPages;i++){
   const page=await pdf.getPage(i),content=await page.getTextContent(),items=content.items.filter(t=>t.str?.trim());
   assert.ok(items.length,'No blank PDF page '+i);allText+=items.map(t=>t.str).join('');
   if(i===1){
    const title=items.find(t=>t.str.includes('PDF 답지 2단 확인'));
    assert.ok(title,'First-page title exists');
    assert.ok(Math.abs(title.transform[4]-15*72/25.4)<1.5,'Answer margins must not shrink the full-page form');
   }
   if(i>1)for(const item of items){const y=item.transform[5];assert.ok(y>30&&y<page.view[3]-30,'Repeated answer-page margins must contain every text item: '+i+' '+y);}
  }
  if(!process.env.EXAM_TEST_PDF_SNAPSHOT)for(const i of [1,2])assert.ok(allText.includes('해설'+i+'완료표시'));
  await pdfTask.destroy();console.log('PASS actual Electron PDF export, repeated answer margins, no blank page, complete text and shared answer columns: '+output);app.quit();
 }).catch(e=>{console.error(e);app.exit(1);});
}
