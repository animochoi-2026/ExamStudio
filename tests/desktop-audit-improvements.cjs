'use strict';
if(process.versions.electron)require('./desktop-multi-source.cjs');else{
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),root=path.resolve(__dirname,'..');
 const {_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 (async()=>{
  const dir=fs.mkdtempSync(path.join(root,'data/validation/audit-ui-')),source=path.join(dir,'source.png');await require('sharp')({create:{width:900,height:1200,channels:3,background:'white'}}).png().toFile(source);
  const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env:{...process.env,EXAM_DATA_DIR:dir}}),page=await app.firstWindow(),errors=[];page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));
  const boot=()=>page.evaluate(()=>window.exam.boot());
  const automatic=async()=>{await page.locator('#batch-automatic').click();await page.waitForFunction(()=>!document.querySelector('#batchStart').disabled);await page.locator('#batchStart').click();await page.waitForFunction(()=>document.querySelector('#dialogTitle').textContent==='일괄 작업 결과');assert.match(await page.locator('#dialogBody').innerText(),/Word 저장 완료/);await page.locator('#closeDialog').click();};
  try{
   await page.waitForFunction(()=>document.querySelector('#aiModel').options.length===2);await app.evaluate((_e,file)=>global.__fileSelection=[file],source);await page.locator('#importSource').click();await page.locator('#confirmImportScope').click();
   await page.evaluate(async()=>{const p=(await window.exam.boot()).project,img=await window.exam.readAsset(p.source.path);await window.exam.addRegion({projectId:p.id,region:{page:1,x:0,y:0,width:.9,height:.4},imageDataUrl:img.dataUrl});});await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.problem-tab').length===1&&document.querySelector('#aiModel').options.length===2);
   await automatic();assert.equal(await app.evaluate(()=>global.__requests.length),2);
   await page.evaluate(async()=>{const p=(await window.exam.boot()).project;await window.exam.saveScope({projectId:p.id,scope:{...p.scope,restrictions:p.scope.restrictions+' 추가 조건'}});});await page.reload();await page.waitForFunction(()=>document.querySelector('#aiModel').options.length===2);await automatic();assert.equal(await app.evaluate(()=>global.__requests.length),3,'scope change solves again without recognition');
   let project=(await boot()).project;const orphan=path.join(path.dirname(project.source.path),'unused-test.png');fs.copyFileSync(source,orphan);
   await page.locator('#dataMaintenance').click();await page.locator('#cleanupAssets').check();await page.waitForFunction(()=>document.querySelector('.request-preview')?.textContent.includes('unused-test.png'));await page.locator('#cleanupConsent').check();await page.locator('#cleanupProject').click();await page.waitForFunction(()=>document.querySelector('#dialogBody').textContent.includes('백업 위치:'));assert.ok(!fs.existsSync(orphan));assert.ok(fs.existsSync(project.source.path));assert.equal((await boot()).project.problems[0].original.solution,project.problems[0].original.solution);await page.locator('#closeDialog').click();
   // Deleting only a test-owned source simulates an incomplete copied project.
   assert.ok(project.source.path.startsWith(dir+path.sep));fs.unlinkSync(project.source.path);await page.evaluate(()=>window.exam.maintenanceInfo());await page.reload();await page.waitForFunction(()=>document.querySelector('#missingSourceNotice'));assert.equal(await page.locator('.problem-tab').count(),1);
   await page.locator('#dataMaintenance').click();await app.evaluate((_e,file)=>global.__fileSelection=[file],source);await page.getByRole('button',{name:'자료 다시 연결',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#missingSourceNotice')&&document.querySelector('#dialogBody').textContent.includes('백업 위치:'));assert.ok(fs.existsSync(project.source.path));assert.equal((await boot()).project.problems[0].recognition.sourceStale,true);await page.locator('#closeDialog').click();
   await page.screenshot({path:path.join(dir,'audit-ui.png')});assert.deepEqual(errors,[]);console.log('PASS stale solution automatic continuation, backup/cleanup confirmation, missing-source recovery and reconnection (mock AI). '+dir);
  }finally{await app.close();}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}
