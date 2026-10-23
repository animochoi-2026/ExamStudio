'use strict';
// Run the real, hidden Electron print window against a local synthetic snapshot.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const R=path.resolve(__dirname,'..'),O=path.join(R,'artifacts/modern-minimal-20261023/desktop');
const {app,BrowserWindow}=require('electron');
app.on('window-all-closed',()=>{});
app.setPath('userData',path.join(O,'isolated-profile'));fs.mkdirSync(O,{recursive:true});
const log=s=>fs.appendFileSync(path.join(O,'run.log'),s+'\n');
app.on('web-contents-created',(_,contents)=>{contents.on('console-message',e=>log('console '+e.message));contents.on('render-process-gone',(_,d)=>log('renderer '+JSON.stringify(d)));contents.on('did-fail-load',(_,code,desc)=>log('load '+code+' '+desc));});
app.whenReady().then(async()=>{
 log('ready');
 try{
  const base=JSON.parse(fs.readFileSync(path.join(O,'../score-on/snapshot.json'),'utf8'));
  delete base.paperFormPages;delete base.settings.measuredPages;delete base.settings.questionFragments;
  base.settings={...base.settings,bodyFontSize:9.6,workspaceLines:0,showQuestionLabels:false,bodyFont:'맑은 고딕'};
  base.paperForm=base.settings.paperForm;base.examTitle='실전모의고사 1회';base.variantLabel='A1';base.roundLabel='1회';
  base.questions.forEach((q,i)=>{q.responseType=i<4?'single_choice':i===4?'single_value':'written_response';});
  const source=path.join(O,'input.json');fs.writeFileSync(source,JSON.stringify(base));
  const out=await require('../app/pdf-export.cjs').exportPdf({BrowserWindow,snapshotPath:source,directory:O,measureOnly:true,timeoutMs:60000});log('measured');
  assert.equal(out.report.formGeometry.flow,'continuous');assert(out.report.pages.length>=2);assert(out.snapshot.questions.every(q=>q.modernMinimal));assert(out.snapshot.questions[5].modernSectionStart);assert(!out.snapshot.questions[4].modernSectionStart);
  assert.equal(out.snapshot.settings.quadrantLayout,false);assert.equal(out.snapshot.settings.bodyFontSize,9.6);assert.equal(out.snapshot.paperFormPages.length,out.report.pages.length);
  for(const p of out.snapshot.paperFormPages){assert(Math.abs(p.leftMm-42*25.4/72)<.03);assert(Math.abs(p.gapMm-38*25.4/72)<.03);}
  const source2=path.join(O,'pdf-input.json');fs.writeFileSync(source2,JSON.stringify(base));
  const target=path.join(O,'exam.pdf');await require('../app/pdf-export.cjs').exportPdf({BrowserWindow,snapshotPath:source2,directory:O,target});assert(fs.statSync(target).size>10000);
  fs.writeFileSync(path.join(O,'checks.json'),JSON.stringify({pages:out.report.pages,form:out.report.formGeometry,bodyFontSize:out.snapshot.settings.bodyFontSize,pdfBytes:fs.statSync(target).size},null,2));console.log('PASS Electron: isolated profile, same form, native measurement, real image PDF');
 }catch(e){log(e.stack);console.error(e);process.exitCode=1;}finally{app.exit(process.exitCode||0);}
});
