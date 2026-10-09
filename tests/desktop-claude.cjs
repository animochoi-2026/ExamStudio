'use strict';
if(process.versions.electron){
 const {MODELS}=require('../app/claude.cjs');
 global.__claudeRequests=[];global.__claudeActions=[];
 require('../app/claude.cjs').ClaudeBridge=class {
  async getAccount(){return {available:true,account:{type:'claude'},models:MODELS,error:''};}
  async openAccountWindow(action){global.__claudeActions.push(action);return {opened:true,action};}
  async run(request){global.__claudeRequests.push(request);return new (require('../app/codex.cjs').CodexBridge)().run(request);}
  async cancel(){return true;}close(){}
 };
 require('./desktop-workflow.cjs');
}else{
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
 const {_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 (async()=>{
  const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(root,'data/validation/claude-desktop-')),source=path.join(dir,'sample.png');
  await require('sharp')({create:{width:900,height:800,channels:3,background:'white'}}).png().toFile(source);
  const env={...process.env,EXAM_DATA_DIR:dir,EXAM_TEST_SOURCE:source};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env});
  try{
   const page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.waitForFunction(()=>!!document.querySelector('#chatForm[data-workflow-ready]'));
   await page.locator('#claudeTab').click();assert.equal(await page.locator('#claudeControls').isVisible(),true);
   await page.locator('#checkClaude').click();await page.waitForFunction(()=>document.querySelector('#claudeStatus').textContent.includes('연결됨'));
   await page.locator('#claudeModel').selectOption('opus');await page.waitForFunction(async()=>(await window.exam.boot()).claudeSettings.model==='opus');
   await page.locator('#claudeEffort').selectOption('high');await page.waitForFunction(async()=>(await window.exam.boot()).claudeSettings.effort==='high');
   await page.locator('#claudeAccountSettings').click();for(const action of ['login','logout','switch']){await page.locator('#account-'+action).click();await page.waitForFunction(()=>!document.querySelector('#account-login').disabled);}assert.deepEqual(await app.evaluate(()=>global.__claudeActions),['login','logout','switch']);await page.locator('#closeDialog').click();
   await page.locator('#importSource').click();await page.locator('#confirmImportScope').click();await page.locator('#collectRegions').uncheck();await page.waitForFunction(()=>!document.querySelector('#pageStage').hidden);
   const box=await page.locator('#selectionLayer').boundingBox();await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.6,{steps:5});await page.mouse.up();await page.locator('#confirmRegionSelection').click();
   await page.waitForFunction(async()=>!!(await window.exam.boot()).project.problems[0]?.recognition);await page.waitForFunction(()=>document.querySelector('#cancelChat').hidden);
   await page.locator('[data-view="original"]').click();await page.locator('#confirmRecognition').click();await page.waitForFunction(async()=>!!(await window.exam.boot()).project.problems[0].original.solution);await page.waitForFunction(()=>document.querySelector('#cancelChat').hidden);
   await page.locator('#chatInput').fill('유사문제 한 개 만들어줘');await page.locator('#sendChat').click();await page.waitForFunction(async()=>(await window.exam.boot()).project.problems[0].variants.length===1);await page.waitForFunction(()=>document.querySelector('#cancelChat').hidden);
   assert.deepEqual(await app.evaluate(()=>global.__claudeRequests.map(r=>[r.execution.task,r.model,r.effort])),[['recognition','opus','high'],['solve','opus','high'],['generation','opus','high']]);
   await page.locator('#batch-generation').click();await page.waitForFunction(()=>!document.querySelector('#batchStart').disabled);await page.locator('#batchStart').click();
   await page.waitForFunction(()=>!document.querySelector('#batchProgressDialog').open&&document.querySelector('#dialogTitle').textContent==='일괄 작업 결과');
   assert.match(await page.locator('#dialogBody').innerText(),/Word 저장 완료/);assert.equal(await app.evaluate(()=>global.__claudeRequests.at(-1).execution.task),'generation');assert.equal(await app.evaluate(()=>global.__claudeRequests.length),4);await page.locator('#closeDialog').click();
   await page.reload();await page.waitForFunction(()=>!!document.querySelector('#chatForm[data-workflow-ready]'));await page.locator('#claudeTab').click();assert.equal(await page.locator('#claudeModel').inputValue(),'opus');assert.equal(await page.locator('#claudeEffort').inputValue(),'high');
   assert.deepEqual(errors,[]);await page.screenshot({path:path.join(dir,'claude-workflow.png')});console.log('PASS Claude sidebar, model persistence, login/logout/switch, recognition/solve/generation and batch Word routing');
  }finally{await app.close();}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}
