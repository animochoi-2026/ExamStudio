'use strict';
if(process.versions.electron){require('./desktop-workflow.cjs');}else{
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
 const root=path.resolve(__dirname,'..'),{_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 (async()=>{
  const dir=fs.mkdtempSync(path.join(root,'data/validation/close-source-')),files=['first.png','second.jpg','third.png'].map(n=>path.join(dir,n));
  for(const [i,file] of files.entries())await require('sharp')({create:{width:800+i*100,height:1000,channels:3,background:['white','beige','silver'][i]}}).toFile(file);
  const env={...process.env,EXAM_DATA_DIR:dir,EXAM_TEST_SOURCE:files[0]};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env}),page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const ready=()=>page.waitForFunction(()=>!document.querySelector('#detectRegions').disabled),project=()=>page.evaluate(async()=>(await window.exam.boot()).project);
  const close=async index=>{await page.locator('.source-tab-close').nth(index).click();await page.locator('#confirmCloseSource').click();};
  try{
   await page.waitForFunction(()=>!!document.querySelector('#chatForm[data-workflow-ready]'));await page.locator('#importSource').click();await page.locator('#confirmImportScope').click();await ready();
   for(const file of files.slice(1)){await app.evaluate((_,f)=>process.env.EXAM_TEST_SOURCE=f,file);await page.locator('#importSource').click();await ready();}
   assert.equal(await page.locator('.source-tab-close').count(),3);
   const third=(await project()).sources[2].id;
   await page.locator('.source-tab-close').nth(0).click();await page.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await page.locator('.source-tab').count(),3);
   await close(0);await ready();assert.equal(await page.locator('.source-tab').count(),2);assert.equal(await page.locator('.source-tab.active').getAttribute('data-source-id'),third);assert.equal((await project()).sources[0].name,'second.jpg');
   await page.locator('.source-tab').first().click();await ready();await page.locator('#detectRegions').click();await page.locator('#startRegionDetection').click();await page.locator('#confirmDetectedRegions').click();assert.equal((await project()).problems.length,2);
   await page.locator('.source-tab-close').first().click();assert.match(await page.locator('#dialogBody').innerText(),/문제 1, 2번/);await page.locator('#confirmCloseSource').click();await ready();assert.equal((await project()).problems.length,0);assert.equal(await page.locator('.source-tab.active').innerText(),'third.png');assert.equal((await project()).sources[0].id,'primary');
   await page.reload();await ready();assert.equal(await page.locator('.source-tab').count(),1);assert.equal(await page.locator('.source-tab.active').innerText(),'third.png');
   await close(0);await page.waitForFunction(()=>!document.querySelector('#sourceEmpty').hidden);assert.equal(await project(),null);assert.ok((await page.evaluate(()=>window.exam.boot())).recent.length);assert.deepEqual(errors,[]);
   console.log('PASS tab close/cancel, inactive primary, active primary, dependent problems, persistence, final close and saved work retention');
  }finally{await app.close();}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}
