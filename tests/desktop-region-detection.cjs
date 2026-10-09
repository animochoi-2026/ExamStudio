'use strict';
if(process.versions.electron){require('./desktop-workflow.cjs');}else{
 const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
 const root=path.resolve(__dirname,'..'),{_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 // A small two-page PDF, with text in both columns, without external fixture dependencies.
 function pdf(){const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',...Array.from({length:2},()=> '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 6 0 R >> >> /Contents 5 0 R >>')];const content='BT /F1 14 Tf 50 690 Td (1. Test question) Tj 275 0 Td (2. Test question) Tj ET';objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');let output='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(output));output+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(output);return output+`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;}
 (async()=>{
  const dir=fs.mkdtempSync(path.join(root,'data/validation/regions-')),source=path.join(dir,'sample.pdf');fs.writeFileSync(source,pdf());
  const env={...process.env,EXAM_DATA_DIR:dir,EXAM_TEST_SOURCE:source};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env}),page=await app.firstWindow();page.setDefaultTimeout(25000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const project=()=>page.evaluate(async()=>(await window.exam.boot()).project);
  const until=async check=>{const deadline=Date.now()+25000;while(!await check()){if(Date.now()>deadline)throw Error('조건 대기 시간 초과');await new Promise(r=>setTimeout(r,50));}};
  async function detect(scope='current'){await page.locator('#detectRegions').click();await page.locator('#regionDetectionScope').selectOption(scope);await page.locator('#startRegionDetection').click();}
  async function finish(){await page.locator('#confirmDetectedRegions').click();}
  try{
   await page.waitForFunction(()=>!!document.querySelector('#chatForm[data-workflow-ready]'));await page.locator('#importSource').click();await page.locator('#confirmImportScope').click();await page.locator('#detectRegions').waitFor({state:'visible'});
   await detect();await finish();let p=await project();assert.equal(p.problems.length,2);assert.ok(p.problems.every(x=>!x.recognition&&!x.original));assert.equal(await page.locator('.region-box').count(),2);
   const before=p.problems[0].regions[0];let box=page.locator('.region-box.selected');let b=await box.boundingBox();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.5+15,b.y+b.height*.5+20,{steps:6});await page.mouse.up();await until(async()=>(await project()).problems[0].regions[0].y>.11);p=await project();assert.ok(p.problems[0].regions[0].x>before.x,JSON.stringify({before,after:p.problems[0].regions[0]}));assert.equal(p.problems[0].needsReview,false);await page.waitForFunction(()=>!document.querySelector('#detectRegions').disabled);
   b=await page.locator('.region-box.selected .handle-se').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+15,b.y+b.height/2+20,{steps:6});await page.mouse.up();await until(async()=>(await project()).problems[0].regions[0].height>.31);
   await detect('all');await finish();p=await project();assert.equal(p.problems.length,4);assert.deepEqual(p.problems.map(x=>x.regions[0].page),[1,1,2,2]);
   await page.locator('.region-box.selected .region-delete').click();await until(async()=>(await project()).problems.length===3);await page.waitForFunction(()=>!document.querySelector('#detectRegions').disabled);
   const layer=await page.locator('#selectionLayer').boundingBox();await page.mouse.move(layer.x+layer.width*.1,layer.y+layer.height*.6);await page.mouse.down();await page.mouse.move(layer.x+layer.width*.45,layer.y+layer.height*.8,{steps:8});await page.mouse.up();await until(async()=>(await project()).problems.length===4);
   await app.evaluate(()=>{global.__hold=true;});await detect('all');await page.waitForFunction(()=>document.querySelector('#regionDetectionStatus')?.textContent.includes('1 / 2'));await page.locator('#stopRegionDetection').click();await finish();assert.equal((await project()).problems.length,4);await app.evaluate(()=>{global.__hold=false;});
   await app.evaluate(()=>{global.__failNext=true;});await detect();await page.locator('#confirmDetectedRegions').waitFor();assert.ok((await page.locator('#dialogBody').innerText()).includes('모의 인식 실패'));await finish();assert.equal((await project()).problems.length,4);
   await page.screenshot({path:path.join(dir,'editable-regions.png')});
   await page.locator('#batch-recognition').click();await page.locator('#batchStart').click();await until(async()=>(await project()).problems.every(p=>!!p.recognition));assert.equal((await project()).problems.length,4);
   await page.waitForFunction(()=>document.querySelector('#dialogTitle').textContent==='일괄 작업 결과');await page.locator('#closeDialog').click();
   const photo=path.join(dir,'photo.jpg');await require('sharp')({create:{width:3200,height:4000,channels:3,background:'white'}}).jpeg().toFile(photo);await app.evaluate((_,file)=>{process.env.EXAM_TEST_SOURCE=file;},photo);await page.locator('#importSource').click();await page.waitForFunction(()=>document.querySelector('#pageTotal').textContent==='/ 1');
   await detect('all');await finish();p=await project();assert.equal(p.problems.length,6);assert.notEqual(p.problems[4].regions[0].sourceId,'primary');const meta=await require('sharp')(p.problems[4].cropPaths[0]).metadata();assert.equal(meta.width,1280);assert.equal(meta.height,1200);
   await page.reload();await page.locator('#detectRegions').waitFor();assert.equal((await project()).problems.length,6);
   assert.deepEqual(errors,[]);console.log('PASS auto region current/all pages, move/resize, duplicate prevention, add/delete, cancel, failure, normal batch recognition, JPEG multi-source and full-resolution crops, reload persistence');console.log(dir);
  }finally{await app.close();}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}
