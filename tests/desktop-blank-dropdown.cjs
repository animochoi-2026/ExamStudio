'use strict';
if(process.versions.electron)require('./desktop-workflow.cjs');else{
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
 const root=path.resolve(__dirname,'..'),{_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 (async()=>{
  const dir=fs.mkdtempSync(path.join(root,'data/validation/blank-dropdown-')),source=path.join(dir,'source.png');
  await require('sharp')({create:{width:900,height:1100,channels:3,background:'white'}}).png().toFile(source);
  const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env:{...process.env,EXAM_DATA_DIR:dir,EXAM_TEST_SOURCE:source}}),page=await app.firstWindow();
  page.setDefaultTimeout(25000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.waitForFunction(()=>document.querySelector('#aiModel').options.length===2);
   await page.locator('#importSource').click();await page.locator('#confirmImportScope').click();await page.waitForFunction(()=>!document.querySelector('#fitWidth').disabled);
   for(const [top,bottom] of [[.05,.23],[.35,.53]]){const b=await page.locator('#selectionLayer').boundingBox();await page.mouse.move(b.x+b.width*.1,b.y+b.height*top);await page.mouse.down();await page.mouse.move(b.x+b.width*.8,b.y+b.height*bottom,{steps:3});await page.mouse.up();await page.waitForFunction(()=>!document.querySelector('#fitWidth').disabled);}
   await page.locator('#batch-recognition').click();await page.waitForFunction(()=>!document.querySelector('#batchStart').disabled);await page.locator('#batchStart').click();
   await page.waitForFunction(()=>!document.querySelector('#batchProgressDialog').open&&document.querySelector('#dialogTitle').textContent==='일괄 작업 결과');await page.locator('#closeDialog').click();
   await page.locator('#batch-generation').click();
   const rows=page.locator('.batch-problem-row');assert.equal(await rows.count(),2);
   // Extremely long unbroken LaTeX text must wrap inside its own click area.
   await rows.first().locator('.batch-problem-text').evaluate(n=>n.textContent='문제 1 · '+String.raw`$\overline{ABCD}$`.repeat(20));
   const select=rows.first().locator('select'),check=rows.first().locator('input');
   assert.equal(await select.evaluate(n=>n.closest('label')===null),true);
   for(const width of [1180,860]){
    await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,850),width);
    await select.scrollIntoViewIfNeeded();
    assert.equal(await select.evaluate(n=>{const r=n.getBoundingClientRect();return document.elementFromPoint(r.right-12,r.top+r.height/2)===n;}),true);
    await check.uncheck();await select.click();await page.keyboard.press('Escape');assert.equal(await check.isChecked(),false);
    await select.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');
    assert.equal(await select.inputValue(),'mirror_numeric');assert.equal(await check.isChecked(),false);
    await rows.first().locator('.batch-problem-text').click();assert.equal(await check.isChecked(),true);assert.equal(await select.inputValue(),'mirror_numeric');
   }
   await rows.nth(1).locator('select').selectOption('harder');assert.equal(await select.inputValue(),'mirror_numeric');
   await page.locator('#batchSelectAll').uncheck();assert.equal(await page.locator('.batch-problem-choice:checked').count(),0);assert.equal(await select.inputValue(),'mirror_numeric');
   await page.screenshot({path:path.join(dir,'dropdown.png')});assert.deepEqual(errors,[]);
   console.log('PASS independent dropdown/checkbox, long-text hit targets, keyboard, select-all: '+dir);
  }finally{await app.close();}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}
