'use strict';
// Isolated UI test: existing fixture mocks all Codex calls and shared-bank access.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-usage-limit-')),evidence=path.resolve(__dirname,'../docs/solution-guide/remaining-confirmation-20261006');let app,page;const errors=[];
 const launch=async()=>{const env={...process.env,EXAM_DATA_DIR:directory};for(const key of ['ELECTRON_RUN_AS_NODE','EXAM_PHASE2_PACKAGED_EXE','EXAM_PHASE2_APP_ROOT','EXAM_OUTPUT_DIR','EXAM_PHASE2_EVIDENCE'])delete env[key];app=await _electron.launch({timeout:45000,executablePath:require('electron'),args:['--disable-gpu',path.join(__dirname,'desktop-phase2-queue.cjs')],env});page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await page.waitForSelector('#queueUsagePercent:enabled');};
 const save=async value=>{await page.locator('#queueUsagePercent').fill(value);await page.locator('#queueUsagePercent').press('Tab');await page.waitForFunction(expected=>document.getElementById('queueUsageStatus').textContent.startsWith('저장됨')&&document.getElementById('queueUsagePercent').value===expected,value);};
 try{
  await launch();assert.equal(await page.locator('#aiSidebar #queueUsagePercent').inputValue(),'20');await save('35');assert.equal((await page.evaluate(()=>window.exam.examQueueStatus())).limits.remainingPercent,35);
  await page.locator('#queueUsagePercent').fill('101');await page.locator('#queueUsagePercent').press('Tab');await page.waitForFunction(()=>document.getElementById('queueUsageStatus').textContent.startsWith('저장되지 않음'));assert.equal((await page.evaluate(()=>window.exam.examQueueStatus())).limits.remainingPercent,35);
  await save('');assert.equal((await page.evaluate(()=>window.exam.examQueueStatus())).limits.remainingPercent,null);await app.close();app=null;
  await launch();assert.equal(await page.locator('#queueUsagePercent').inputValue(),'');await save('20');await page.screenshot({path:path.join(evidence,'sidebar-usage-limit.png')});await app.close();app=null;
  await launch();assert.equal(await page.locator('#queueUsagePercent').inputValue(),'20');assert.equal(fs.existsSync(path.join(directory,'mock-calls.jsonl')),false);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(evidence,'sidebar-ui-result.json'),JSON.stringify({atUtc:new Date().toISOString(),passed:true,default20:true,validInputSaved:true,invalidInputPreservesSaved:true,blankSavedAndRestored:true,explicit20Restored:true,actualAiCalls:0,uploads:0,pageErrors:errors,productionProfile:false},null,2)+'\n');console.log('PASS: isolated Electron sidebar default20/save/invalid/clear/restart; zero AI/upload');
 }finally{if(app)await app.close();assert.equal(path.dirname(directory),os.tmpdir());fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
