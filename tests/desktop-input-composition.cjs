'use strict';
if(process.versions.electron)require('./desktop-workflow.cjs');else{
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
 const root=path.resolve(__dirname,'..'),runtime=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies');
 const {_electron}=require(path.join(runtime,'node/node_modules/playwright'));
 (async()=>{
  const dir=fs.mkdtempSync(path.join(root,'data/validation/input-composition-')),source=path.join(dir,'source.png');
  fs.writeFileSync(path.join(dir,'gemini-access.json'),JSON.stringify({version:1,status:'subscribed',source:'user_setting'}));
  await require('sharp')({create:{width:900,height:800,channels:3,background:'white'}}).png().toFile(source);
  const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env:{...process.env,EXAM_DATA_DIR:dir,EXAM_TEST_SOURCE:source}});
  const page=await app.firstWindow();page.setDefaultTimeout(15000);const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  const pass=text=>{checks.push(text);console.log('PASS '+text);};
  const wait=async fn=>{for(let i=0;i<250;i++){if(await fn())return;await new Promise(r=>setTimeout(r,40));}throw Error('completion timeout');};
  const boot=()=>page.evaluate(()=>window.exam.boot());
  try{
   await page.waitForFunction(()=>document.querySelector('#aiModel').options.length===2);await page.locator('#importSource').click();await page.locator('#confirmImportScope').click();await page.locator('#collectRegions').uncheck();await page.waitForFunction(()=>!document.querySelector('#pageStage').hidden&&!document.querySelector('#zoomIn').disabled);
   const box=await page.locator('#selectionLayer').boundingBox();await page.mouse.move(box.x+box.width*.1,box.y+box.height*.1);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.7,{steps:5});await page.mouse.up();await page.locator('#confirmRegionSelection').click();await wait(async()=>!!(await boot()).project.problems[0]?.recognition);await page.waitForFunction(()=>document.querySelector('#cancelChat').hidden);
   await app.evaluate(({BrowserWindow})=>{global.__forcedInputFocus=[];const w=BrowserWindow.getAllWindows()[0];for(const [object,label] of [[w,'window'],[w.webContents,'webContents']]){const original=object.focus.bind(object);object.focus=(...args)=>{global.__forcedInputFocus.push(label);return original(...args);};}});
   await page.locator('[data-view="original"]').click();await page.locator('#retryDiagram').click();const input=page.locator('#retryFeedback');
   const cdp=await page.context().newCDPSession(page);
   await input.evaluate(n=>{window.__inputEvents=[];for(const name of ['compositionstart','compositionupdate','compositionend','input','blur'])n.addEventListener(name,e=>window.__inputEvents.push({type:e.type,data:e.data??null,composing:e.isComposing??false}));});
   await input.click();await page.keyboard.type('abc123');assert.equal(await input.inputValue(),'abc123');
   for(let i=0;i<4;i++){await input.click();await page.keyboard.press('End');await page.keyboard.type('x');assert.equal(await input.inputValue(),'abc123'+'x'.repeat(i+1));}
   assert.deepEqual(await app.evaluate(()=>global.__forcedInputFocus),[]);pass('repeated clicks and Latin/number typing insert once without native refocus calls');
   await page.keyboard.press('Control+A');await page.keyboard.press('Backspace');
   for(const text of ['ㄱ','가','각'])await cdp.send('Input.imeSetComposition',{text,selectionStart:1,selectionEnd:1});
   assert.equal(await input.inputValue(),'각');await cdp.send('Input.insertText',{text:'각'});assert.equal(await input.inputValue(),'각');
   assert.ok((await page.evaluate(()=>window.__inputEvents)).some(e=>e.type==='compositionend'));
   await page.keyboard.press('Backspace');assert.equal(await input.inputValue(),'');pass('Chromium IME composition updates and commit produce one syllable; Backspace removes it once');
   await app.evaluate(()=>{global.__holdGemini=true;global.__geminiWaiting=false;});await page.locator('#retryProvider').selectOption('gemini');await wait(()=>app.evaluate(()=>global.__geminiWaiting));
   await input.click();await cdp.send('Input.imeSetComposition',{text:'ㅎ',selectionStart:1,selectionEnd:1});
   const blurs=await page.evaluate(()=>window.__inputEvents.filter(e=>e.type==='blur').length);
   await app.evaluate(()=>{global.__holdGemini=false;global.__releaseGemini();});await page.waitForFunction(()=>!document.querySelector('#startRecognitionRetry').disabled);
   assert.equal(await input.evaluate(n=>document.activeElement===n),true);assert.equal(await page.evaluate(()=>window.__inputEvents.filter(e=>e.type==='blur').length),blurs);
   for(const text of ['하','한'])await cdp.send('Input.imeSetComposition',{text,selectionStart:1,selectionEnd:1});await cdp.send('Input.insertText',{text:'한'});assert.equal(await input.inputValue(),'한');
   for(const text of ['ㄱ','그','글'])await cdp.send('Input.imeSetComposition',{text,selectionStart:1,selectionEnd:1});await cdp.send('Input.insertText',{text:'글'});assert.equal(await input.inputValue(),'한글');
   assert.deepEqual(await app.evaluate(()=>global.__forcedInputFocus),[]);pass('delayed Gemini model discovery does not blur or duplicate an active Hangul composition');
   await page.keyboard.press('Home');await page.keyboard.type('A');await page.keyboard.press('End');await page.keyboard.type('1');assert.equal(await input.inputValue(),'A한글1');
   await page.screenshot({path:path.join(root,'tests/artifacts/input-composition.png')});await page.locator('#startRecognitionRetry').click();await wait(async()=>(await boot()).project.problems[0].recognition.version===2);assert.match(await app.evaluate(()=>global.__requests.at(-1).text),/A한글1/);pass('cursor editing preserves text and sends the exact request to the mocked Gemini bridge');
   await page.waitForFunction(()=>document.querySelector('#cancelChat').hidden);await page.locator('#retryDiagram').click();assert.equal(await input.inputValue(),'');await input.click();await page.keyboard.type('77');assert.equal(await input.inputValue(),'77');await page.locator('#cancelRecognitionRetry').click();assert.deepEqual(await app.evaluate(()=>global.__forcedInputFocus),[]);assert.deepEqual(errors,[]);pass('closing and reopening the input creates no duplicate listeners or native focus requests');
   fs.writeFileSync(path.join(root,'tests/artifacts/input-composition.json'),JSON.stringify({ok:true,mode:'real Electron + Chromium CDP IME composition; mock AI; no native Windows IME keystroke reproduction',checks},null,2));
  }catch(error){await page.screenshot({path:path.join(root,'tests/artifacts/input-composition-failure.png')});throw error;}finally{await app.close();}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}
