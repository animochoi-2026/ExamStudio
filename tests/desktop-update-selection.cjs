'use strict';
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(root,'data/validation/version-ui-'));
 const env={...process.env,EXAM_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:require('electron'),args:[root,'--disable-gpu'],env});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>!!window.exam);
  // Exercise the real UI module with a deterministic release list, no install or AI.
  await page.evaluate(async()=>{
   const {installUpdateUI}=await import('./update-ui.js');document.body.innerHTML='<button id="checkUpdates">update</button>';
   window.updateCalls=[];window.failDownload=false;window.cleanupCount=0;
   const element=(tag,cls='',text='')=>{const el=document.createElement(tag);el.className=cls;el.textContent=text;return el;};
   const button=(text,cls,fn)=>{const b=element('button',cls,text);b.onclick=fn;return b;};
   const api={checkUpdate:async()=>({current:'0.4.1',latest:'0.4.2',previous:'0.4.0',packaged:true,choices:[{version:'0.4.2',latest:true,installable:true},{version:'0.4.1',installed:true,installable:true},{version:'0.4.0',rollback:true,installable:true}]}),onEvent:()=>()=>window.cleanupCount++,downloadUpdate:async v=>{window.updateCalls.push(v);if(window.failDownload)throw Error('download failure');},installUpdate:async()=>window.updateCalls.push('install'),openUpdatePage:async()=>{}};
   window.testState={project:{id:'test'}};
   installUpdateUI({api,state:window.testState,element,button,openDialog:()=>{const d=element('div');document.body.append(d);return d;},blocked:()=>false,saveProject:async()=>window.updateCalls.push('save')});
  });
  await page.locator('#checkUpdates').click();assert.equal(await page.locator('#updateVersion option').count(),3);
  assert.deepEqual(await page.locator('#updateVersion option').allTextContents(),['v0.4.2 · 최신','v0.4.1 · 현재 사용 중','v0.4.0 · 롤백 가능']);
  await page.locator('#updateVersion').selectOption('0.4.0');assert.equal(await page.locator('#installSelectedUpdate').innerText(),'v0.4.0로 롤백');
  await page.locator('#installSelectedUpdate').click();await page.waitForFunction(()=>window.updateCalls.includes('install'));
  assert.deepEqual(await page.evaluate(()=>window.updateCalls),['0.4.0','save','install']);
  await page.evaluate(()=>{window.updateCalls=[];window.failDownload=true;});await page.locator('#updateVersion').selectOption('0.4.1');assert.equal(await page.locator('#installSelectedUpdate').innerText(),'v0.4.1 다시 설치');await page.locator('#installSelectedUpdate').click();
  await page.getByText('download failure',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.updateCalls),['0.4.1']);assert.ok(await page.locator('#updateVersion').isEnabled());assert.ok(await page.locator('#installSelectedUpdate').isEnabled());
  await page.evaluate(()=>{window.updateCalls=[];window.testState.editor={};});await page.locator('#installSelectedUpdate').click();assert.deepEqual(await page.evaluate(()=>window.updateCalls),[]);
  console.log('PASS three choices, explicit downgrade, reinstall, save before restart, failure retry and editor guard');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
