'use strict';
// One existing isolated fixture, real renderer button and export handler.
// The native file picker selection is supplied; no Hancom or document renderer is mocked.
const fs=require('node:fs'),path=require('node:path');
const R=path.resolve(__dirname,'..'),O=path.join(R,'artifacts/additional-stability-20261009/release/direct-hwpx');
const code=path.resolve(process.env.EXAM_TEST_APP_ROOT||R);
if(process.versions.electron){
 const {app,dialog,shell}=require('electron');
 class OfflineBridge{async getAccount(){return{account:{type:'chatgpt',email:'fixture@example.invalid',planType:'pro'},models:[],rateLimits:{}};}async run(){throw Error('AI disabled for save connection smoke test');}close(){}}
 require(path.join(code,'app/codex.cjs')).CodexBridge=OfflineBridge;
 require(path.join(code,'app/antigravity.cjs')).AntigravityBridge=OfflineBridge;
 const cp=require('node:child_process'),spawn=cp.spawn;
 const events={processes:[],openPaths:[],dialogs:[]};global.__saveSmoke=events;
 cp.spawn=function(exe,args,options){events.processes.push({exe:path.basename(exe),args:args.map(String)});if(/^(?:Hwp|powershell)(?:\.exe)?$/i.test(path.basename(exe))||args.some(a=>/^(?:convert_hwp\.ps1|verify_hwp\.py)$/i.test(path.basename(String(a)))))throw Error('Unexpected Hancom conversion in direct save');return spawn(exe,args,options);};
 dialog.showSaveDialog=async(_window,options)=>{events.dialogs.push(options);return{canceled:false,filePath:path.join(O,'직접저장 확인')};};
 shell.openPath=async p=>{events.openPaths.push(p);throw Error('No automatic document opening allowed');};
 dialog.showErrorBox=(title,message)=>console.error(title+': '+message);
 app.on('browser-window-created',(_e,w)=>w.setSkipTaskbar(true));
 require(path.join(code,'app/main.cjs'));
}else{
 const assert=require('node:assert/strict'),crypto=require('node:crypto');
 const {_electron}=require(process.env.EXAM_PLAYWRIGHT_MODULE||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 (async()=>{
  const source=path.join(R,'artifacts/stability-followup-20261009/desktop-ui/data'),data=path.join(O,'data');
  assert.ok(fs.existsSync(path.join(source,'index.json')));
  if(!fs.existsSync(data))fs.cpSync(source,data,{recursive:true,filter:p=>!p.split(path.sep).some(s=>['desktop','exports','shared-bank-auth','shared-banks'].includes(s))});
  const target=path.join(O,'직접저장 확인.hwpx'),oldHwp=path.join(O,'기존 저장 파일.hwp');
  assert.equal(fs.existsSync(target),false,'Do not regenerate an already successful fixture');
  if(!fs.existsSync(oldHwp))fs.writeFileSync(oldHwp,'previous HWP must remain unchanged');
  const before=crypto.createHash('sha256').update(fs.readFileSync(oldHwp)).digest('hex');
  const env={...process.env,EXAM_DATA_DIR:data,EXAM_OUTPUT_DIR:O};delete env.ELECTRON_RUN_AS_NODE;delete env.EXAM_TEST_EXPORT;
  const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env}),page=await app.firstWindow();page.setDefaultTimeout(120000);
  try{
   await page.waitForFunction(()=>!document.querySelector('#exportHwp').disabled);
   assert.equal(await page.locator('#exportHwp').innerText(),'한글 HWPX 저장');
   const expected=await page.evaluate(async()=>{const p=(await window.exam.boot()).project;return{id:p.id,count:p.problems.flatMap(p=>[p.original,...p.variants]).filter(q=>q&&q.include).length};});
   await page.locator('#exportHwp').click();
   await page.getByRole('heading',{name:'한글 HWPX를 저장했습니다',exact:true}).waitFor();
   const dialog=await page.locator('#mainDialog').innerText(),events=await app.evaluate(()=>global.__saveSmoke);
   assert.ok(fs.existsSync(target));assert.ok(dialog.includes(target));
   assert.equal(events.dialogs.length,1);assert.equal(events.dialogs[0].title,'HWPX 문제집 저장');
   assert.deepEqual(events.dialogs[0].filters[0].extensions,['hwpx']);assert.ok(events.dialogs[0].defaultPath.endsWith('.hwpx'));
   assert.equal(events.openPaths.length,0);assert.equal(events.processes.filter(p=>p.args.some(a=>a.endsWith('export_hwpx.py'))).length,1);
   assert.equal(events.processes.some(p=>p.args.some(a=>/export_docx.py|convert_hwp|verify_hwp/.test(a))),false);
   assert.equal(crypto.createHash('sha256').update(fs.readFileSync(oldHwp)).digest('hex'),before);
   await page.screenshot({path:path.join(O,'saved-button.png')});
   fs.writeFileSync(path.join(O,'button-result.json'),JSON.stringify({expected,target,dialog,events,oldHwpPreserved:true,aiCalls:0,operatingWrites:0},null,2));
   console.log('PASS actual HWPX button, extension, native package generation, no Hancom launch, old HWP preserved');
  }finally{await app.close();}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}
