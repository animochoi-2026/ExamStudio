'use strict';
// Actual candidate app, isolated empty profile, real scope editor/save/reopen IPC. No AI or bank writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/output-scope-20261009/curriculum/desktop');
const code=path.resolve(process.env.EXAM_TEST_APP_ROOT||root);
if(process.versions.electron){
 const {app}=require('electron');
 class Offline {async getAccount(){return {available:false,models:[],rateLimits:{}};}async run(){throw Error('AI disabled');}close(){}}
 require(path.join(code,'app/codex.cjs')).CodexBridge=Offline;require(path.join(code,'app/antigravity.cjs')).AntigravityBridge=Offline;
 app.on('browser-window-created',(_e,w)=>w.setSkipTaskbar(true));require(path.join(code,'app/main.cjs'));
}else (async()=>{
 fs.mkdirSync(out,{recursive:true});
 const {_electron}=require(process.env.EXAM_PLAYWRIGHT_MODULE||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 const env={...process.env,EXAM_DATA_DIR:path.join(out,'data')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env}),page=await app.firstWindow();page.setDefaultTimeout(30000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const results=[];
 try{
  await page.waitForFunction(()=>!!document.querySelector('#chatForm[data-workflow-ready]'));
  for(const id of ['e5-2.2','e6-4.2','h1-common1-1.2','h2-algebra-2.1','h3-calculus2-1.1']){
   await page.locator('#editPromptProfile').click();await page.getByRole('button',{name:'선택 해제',exact:true}).click();
   await page.getByRole('searchbox',{name:'단원·개념 검색',exact:true}).fill(require('../app/curriculum.js').leaves.find(n=>n.id===id).title);
   await page.locator(`[data-curriculum-id="${id}"]`).check();await page.locator('#saveStructuredScope').click();
   const saved=await page.evaluate(()=>window.exam.getRulesSettings());assert.deepEqual(saved.scope.curriculum.selected,[id]);
   await page.locator('#editPromptProfile').click();assert.equal(await page.locator(`[data-curriculum-id="${id}"]`).isChecked(),true);
   if(id.startsWith('h3'))await page.screenshot({path:path.join(out,'high-scope.png')});
   await page.locator('#closeDialog').click();results.push({id,saved:saved.scope});
  }
  assert.equal((await page.evaluate(()=>window.exam.boot())).project,null);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({results,errors,aiCalls:0,operatingWrites:0},null,2));console.log('PASS actual desktop five grade scopes: choose, save, reopen; no project or AI created');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
