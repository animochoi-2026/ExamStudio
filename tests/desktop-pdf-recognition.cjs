'use strict';
if(process.versions.electron)require('./desktop-workflow.cjs');else{
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
 const root=path.resolve(__dirname,'..'),{_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 (async()=>{
  const dir=fs.mkdtempSync(path.join(root,'data/validation/pdf-recognition-'));
  const {ProjectStore}=require('../app/store.cjs'),store=new ProjectStore(dir);
  const source=path.join(root,'소스/2026 광희중 2-2중간고사 기출.pdf');
  let project=store.create(source);
  const crop='data:image/png;base64,'+(await require('sharp')({create:{width:30,height:30,channels:3,background:'white'}}).png().toBuffer()).toString('base64');
  for(let i=0;i<23;i++)project=store.addRegion({projectId:project.id,region:{page:Math.min(7,1+Math.floor(i/4)),x:i%2?.52:.07,y:Math.floor(i%4/2)*.4+.18,width:.4,height:.25},imageDataUrl:crop});
  const env={...process.env,EXAM_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env}),page=await app.firstWindow();page.setDefaultTimeout(60000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.waitForFunction(()=>!document.querySelector('#fitWidth').disabled&&document.querySelector('#aiModel').options.length===2);
   // Fixed output size permits exact pixel comparison before/after all recognition.
   await page.locator('#zoomIn').click();
   const pixels=()=>page.evaluate(()=>{const c=document.querySelector('#pageCanvas');return{width:c.width,height:c.height,png:c.toDataURL()};});
   await page.waitForTimeout(400);const before=await pixels();
   await page.locator('#batch-recognition').click();await page.locator('#batchStart').click();
   await page.waitForFunction(()=>document.querySelector('#dialogTitle').textContent==='일괄 작업 결과');
   await page.locator('#closeDialog').click();
   await page.locator('#batch-review').click();await page.getByRole('button',{name:'원문 검토',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#pageNumber').value==='1'&&!document.querySelector('#fitWidth').disabled);
   await page.waitForTimeout(400);const after=await pixels();
   for(const [key,value] of Object.entries({before,after}))fs.writeFileSync(path.join(dir,key+'.png'),Buffer.from(value.png.split(',')[1],'base64'));
   await page.screenshot({path:path.join(dir,'review.png')});
   await page.locator('.source-pane').screenshot({path:path.join(dir,'source-after-recognition.png')});
   console.log(JSON.stringify({dir,before:[before.width,before.height],after:[after.width,after.height],same:before.png===after.png,errors}));
   assert.ok(after.png===before.png,'source pixels changed after recognition');assert.deepEqual(errors,[]);
  }finally{await app.close();}
 })().catch(e=>{console.error(e.message);process.exitCode=1;});
}
