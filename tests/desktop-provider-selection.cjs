'use strict';
if(process.versions.electron){require('./desktop-workflow.cjs');}
else {
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
 const root=path.resolve(__dirname,'..');
 const bundle=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
 const {_electron:electron}=require(path.join(bundle,'playwright'));
 (async()=>{
  const dir=fs.mkdtempSync(path.join(root,'data/validation/provider-startup-')),source=path.join(dir,'source.png');
  fs.writeFileSync(path.join(dir,'gemini-access.json'),JSON.stringify({version:1,status:'subscribed',source:'user_setting'}));
  await require('sharp')({create:{width:900,height:800,channels:3,background:'white'}}).png().toFile(source);
  const app=await electron.launch({executablePath:require('electron'),args:[__filename],env:{...process.env,EXAM_DATA_DIR:dir,EXAM_TEST_ACCOUNT_MODE:'free',EXAM_TEST_SOURCE:source}});
  const page=await app.firstWindow(),checks=[],errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  const pass=name=>{checks.push(name);console.log('PASS '+name);};
  const idle=()=>page.waitForFunction(()=>document.querySelector('#chatForm[data-workflow-ready]')&&document.querySelector('#composerStatus')&&!document.querySelector('#composerStatus').textContent.includes('사용 가능한 AI 연결을 확인'));
  const reload=async()=>{await page.reload();await page.waitForFunction(()=>!!document.querySelector('#chatForm[data-workflow-ready]'));await idle();};
  const active=async provider=>assert.equal(await page.locator('#'+provider+'Tab').getAttribute('aria-selected'),'true');
  const waitMain=async key=>{for(let i=0;i<100;i++){if(await app.evaluate((_,key)=>global[key],key))return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('main state timeout: '+key);};
  try{
   await idle();await active('gemini');assert.equal(await app.evaluate(()=>global.__requests.length),0);assert.equal(await page.locator('#geminiModel').inputValue(),'gemini-test-high');pass('free GPT account automatically selects a usable Gemini model without inference');
   await page.locator('#importSource').click();await page.locator('#confirmImportScope').click();await page.locator('#collectRegions').uncheck();await page.waitForFunction(()=>!document.querySelector('#pageStage').hidden);
   const box=await page.locator('#selectionLayer').boundingBox();await page.mouse.move(box.x+box.width*.1,box.y+box.height*.1);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.6,{steps:5});await page.mouse.up();await page.locator('#confirmRegionSelection').click();
   await page.waitForFunction(async()=>!!(await window.exam.boot()).project.problems[0]?.recognition);await page.waitForFunction(()=>document.querySelector('#cancelChat').hidden);
   await page.locator('[data-view="original"]').click();assert.equal(await page.locator('.question-card svg').count(),1);await page.locator('#confirmRecognition').click();await page.waitForFunction(async()=>!!(await window.exam.boot()).project.problems[0].original.solution);await page.waitForFunction(()=>document.querySelector('#cancelChat').hidden);await page.locator('#chatInput').fill('유사문제 한 개');await page.locator('#sendChat').click();
   await page.waitForFunction(async()=>(await window.exam.boot()).project.problems[0].variants.length===1);await page.waitForFunction(()=>document.querySelector('#cancelChat').hidden);
   assert.deepEqual(await app.evaluate(()=>global.__requests.map(r=>[r.execution.task,r.testProvider])),[['recognition','gemini'],['solve','gemini'],['generation','gemini']]);pass('first recognition and subsequent generation both use Gemini after automatic selection');
   await app.evaluate(()=>global.__accountMode='paid');const calls=await app.evaluate(()=>global.__geminiChecks);await reload();await active('codex');assert.equal(await app.evaluate(()=>global.__geminiChecks),calls);pass('available paid GPT account stays on GPT without an extra Gemini check');
   await app.evaluate(()=>global.__accountMode='missing');await reload();await active('gemini');pass('missing GPT login or installation does not prevent automatic Gemini selection');
   await app.evaluate(()=>global.__accountMode='exhausted');await reload();await active('gemini');pass('known exhausted GPT quota selects Gemini at startup');
   await app.evaluate(()=>{global.__accountMode='missing';global.__geminiUnavailable=true;});await reload();await active('codex');assert.match(await page.locator('#errorList').textContent(),/Gemini 자동 선택을 완료하지 못했습니다/);assert.equal(await app.evaluate(()=>global.__requests.length),3);assert.equal(await page.locator('#importSource').isEnabled(),true);pass('unavailable Gemini shows setup guidance without inference or blocking local work');
   await app.evaluate(()=>{global.__geminiUnavailable=false;global.__holdAccount=true;global.__accountWaiting=false;});await page.reload();await page.waitForFunction(()=>!!document.querySelector('#chatForm[data-workflow-ready]'));
   await waitMain('__accountWaiting');const before=await app.evaluate(()=>global.__geminiChecks);await page.locator('#codexTab').click();await app.evaluate(()=>{global.__holdAccount=false;global.__releaseAccount();});await idle();await active('codex');assert.equal(await app.evaluate(()=>global.__geminiChecks),before);pass('manual GPT selection is preserved when a delayed account check completes');
   await app.evaluate(()=>{global.__holdGemini=true;global.__geminiWaiting=false;});await page.reload();await waitMain('__geminiWaiting');await page.locator('#codexTab').click();await app.evaluate(()=>{global.__holdGemini=false;global.__releaseGemini();});await idle();await active('codex');pass('manual selection is preserved when a delayed Gemini check completes');
   await app.evaluate(()=>global.__accountMode='paid');await reload();
   await page.locator('#geminiTab').click();const beforeSubscriptionChange=await app.evaluate(()=>global.__geminiChecks);
   await page.locator('#geminiAccess').selectOption('unsubscribed');await page.waitForFunction(async()=>(await window.exam.boot()).geminiAccess==='unsubscribed');
   await reload();await active('codex');assert.equal(await page.locator('#geminiTab').isDisabled(),true);assert.equal(await app.evaluate(()=>global.__geminiChecks),beforeSubscriptionChange);pass('Gemini unsubscribed setting persists and starts GPT with the Gemini tab disabled');
   const denied=await page.evaluate(async()=>{const project=(await window.exam.boot()).project;try{await window.exam.chat({projectId:project.id,problemId:project.problems[0].id,provider:'gemini',task:'generation',count:1,requestId:'blocked-gemini-test'});return '';}catch(e){return e.message;}});
   assert.match(denied,/미구독/);assert.equal(await app.evaluate(()=>global.__requests.length),3);pass('backend blocks Gemini inference even when a caller bypasses the disabled tab');
   await page.locator('#checkGemini').click();await page.locator('#geminiAccessDialog').selectOption('unknown');await page.locator('#saveGeminiAccessDialog').click();await page.waitForFunction(async()=>(await window.exam.boot()).geminiAccess==='unknown');await reload();await active('codex');assert.equal(await page.locator('#geminiTab').isDisabled(),true);pass('unconfirmed subscription is distinct from unsubscribed and does not enable Gemini');
   await app.evaluate(()=>global.__accountMode='free');await reload();await active('codex');
   await page.locator('#checkGemini').click();await page.locator('#geminiAccessDialog').selectOption('subscribed');await page.locator('#saveGeminiAccessDialog').click();await page.waitForFunction(()=>document.querySelector('#geminiTab').getAttribute('aria-selected')==='true');await active('gemini');assert.equal(await page.locator('#geminiTab').isEnabled(),true);pass('marking subscribed rechecks real availability and restores Gemini without deleting its model');
   assert.deepEqual(errors,[]);
   await page.screenshot({path:path.join(root,'tests/artifacts/provider-startup.png')});
   fs.writeFileSync(path.join(root,'tests/artifacts/desktop-provider-selection.json'),JSON.stringify({ok:true,mode:'real Electron/preload/IPC, mocked accounts and AI, isolated data',checks},null,2));
  }catch(error){console.error('Renderer errors:',errors);console.error(await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:path.join(root,'tests/artifacts/provider-startup-failure.png')}).catch(()=>{});throw error;}finally{await app.close();}
 })().catch(error=>{console.error(error);process.exitCode=1;});
}
