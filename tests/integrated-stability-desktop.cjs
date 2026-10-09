'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'artifacts/integrated-stability-20261009/desktop');
if(process.versions.electron){
 const {app,BrowserWindow}=require('electron');app.setPath('userData',path.join(dir,'profile'));app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});
 app.whenReady().then(async()=>{
  const exporter=require('../app/pdf-export.cjs');const results=[];
  for(const template of ['standard','mock']){
   const folder=path.join(dir,template);fs.mkdirSync(folder,{recursive:true});
   const snapshot={title:template==='mock'?'옥정중학교 중학교 2학년 2026학년도 2학기 중간고사 실전모의고사 수학 전체 범위 확인':'데스크톱 배치 검증',settings:{bodyFontSize:10,workspaceLines:0,paperForm:{id:'builtin:'+template,template}},questions:Array.from({length:8},(_,i)=>({id:'q'+i,sourceId:'source'+i,kind:'original',body:'검증문항 Q'+(i+1)+'. 직선 $\\ell_1\\parallel\\ell_2$에서 $\\frac{6}{2}$의 값을 구하시오.',answer:'3',solution:'검증풀이 A'+(i+1),choices:[]}))};
   const input=path.join(folder,'snapshot.json');fs.writeFileSync(input,JSON.stringify(snapshot));
   const measured=await exporter.exportPdf({BrowserWindow,snapshotPath:input,directory:folder,measureOnly:true});
   assert.deepEqual(measured.report.pages.map(p=>p.columns.map(c=>c.length)),[[2,2],[2,2]]);
   const pdf=await exporter.exportPdf({BrowserWindow,snapshotPath:input,directory:folder,target:path.join(folder,'exam.pdf')});
   const win=new BrowserWindow({show:false});await win.loadFile(path.join(folder,'print.html'));await win.webContents.capturePage().then(img=>fs.writeFileSync(path.join(folder,'preview.png'),img.toPNG()));
   const text=await win.webContents.executeJavaScript('document.body.innerText');for(let i=1;i<=8;i++)assert.ok(text.includes('Q'+i));
   if(template==='mock'){assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".mock-student-fields").length'),1);assert.equal(measured.snapshot.paperFormPages.length,2);}
   win.destroy();results.push({template,pdf,pages:measured.report.pages,formGeometry:measured.report.formGeometry});
  }
  fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(results,null,2));console.log('PASS desktop native preview/PDF, selected forms, first-page fields and four-slot layout');app.quit();
 }).catch(e=>{console.error(e);app.exit(1);});
}else{
 fs.mkdirSync(dir,{recursive:true});const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(require('electron'),[__filename],{env,stdio:'inherit',windowsHide:true,timeout:120000});if(r.error)throw r.error;process.exitCode=r.status??1;
}
