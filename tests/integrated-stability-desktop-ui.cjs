'use strict';
if(process.versions.electron){
 const path=require('node:path'),root=process.env.EXAM_TEST_APP_ROOT||path.resolve(__dirname,'..');
 class FakeBridge{async getAccount(){return {account:{type:'chatgpt',email:'fixture@example.invalid',planType:'pro'},models:[],rateLimits:{}};}async run(){throw Error('Live AI forbidden in stabilization regression');}close(){}}
 require(path.join(root,'app/codex.cjs')).CodexBridge=FakeBridge;
 require(path.join(root,'app/antigravity.cjs')).AntigravityBridge=FakeBridge;
 const {app,dialog}=require('electron');dialog.showErrorBox=(title,message)=>console.error(title+': '+message);app.on('browser-window-created',(_e,w)=>w.setSkipTaskbar(true));
 require(path.join(root,'app/main.cjs'));
}else{
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
 const root=path.resolve(__dirname,'..'),dir=path.join(process.env.EXAM_STABILITY_OUTPUT||path.join(root,'artifacts/integrated-stability-20261009'),'desktop-ui'),runtime=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies');
 const {_electron}=require(process.env.EXAM_PLAYWRIGHT_MODULE||path.join(runtime,'node/node_modules/playwright'));
 (async()=>{
  fs.mkdirSync(dir,{recursive:true});const source=path.join(dir,'source.png');await require('sharp')({create:{width:400,height:400,channels:3,background:'white'}}).png().toFile(source);
  const {ProjectStore}=require('../app/store.cjs'),{Workflow}=require('../app/workflow.cjs'),store=new ProjectStore(path.join(dir,'data'));let project=store.create(source);
  for(let i=0;i<8;i++){project=store.addRegion({projectId:project.id,region:{page:1,x:0,y:0,width:1,height:1},imageDataUrl:'data:image/png;base64,'+fs.readFileSync(source).toString('base64')});const pid=project.problems.at(-1).id;store.updateProblem(project.id,pid,p=>{p.original={id:'q'+i,kind:'original',sourceId:pid,body:'검증문항 Q'+(i+1)+'. $\\ell_1\\parallel\\ell_2$에서 $\\frac{6}{2}$의 값을 구하시오.',choices:[],answer:'3',solution:'검증풀이 A'+(i+1),include:false,layout:'auto'};});const w=Object.create(Workflow.prototype);w.store=store;w.includeWithoutSolution({projectId:project.id,problemId:pid,questionId:'q'+i});}
  const env={...process.env,EXAM_DATA_DIR:path.join(dir,'data'),EXAM_TEST_EXPORT:path.join(dir,'exam.docx'),EXAM_PYTHON:path.join(runtime,'python/python.exe')};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env}),page=await app.firstWindow();page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.waitForFunction(()=>!document.querySelector('#paperFormSetting').disabled);const before=await page.evaluate(async()=> (await window.exam.boot()).project);
   await page.locator('#paperFormSetting').selectOption('builtin:mock');await page.locator('.pdf-preview-page').first().waitFor();await page.waitForFunction(()=>!document.querySelector('#paperFormSetting').disabled);
   const selected=await page.evaluate(async()=>(await window.exam.boot()).project);assert.equal(selected.settings.paperForm.template,'mock');assert.deepEqual(selected.problems.map(p=>p.id),before.problems.map(p=>p.id));assert.deepEqual(selected.problems.map(p=>p.original.body),before.problems.map(p=>p.original.body));
   await page.screenshot({path:path.join(dir,'form-selected.png')});await page.locator('#closeDialog').click();await page.reload();await page.waitForFunction(()=>document.querySelector('#paperFormSetting').value==='builtin:mock');
   await page.locator('#editPaperForm').click();const frame=page.frameLocator('iframe[title="시험지 폼 수정"]');await frame.getByRole('button',{name:'저장하고 시험지에 적용',exact:true}).waitFor();await frame.getByRole('button',{name:'저장하고 시험지에 적용',exact:true}).click();await page.locator('.pdf-preview-page').first().waitFor();await page.waitForFunction(()=>!document.querySelector('#paperFormSetting').disabled);await page.locator('#closeDialog').click();
   const custom=await page.evaluate(async()=>(await window.exam.boot()).project);assert.ok(custom.settings.paperForm.id.startsWith('saved:'));assert.equal(await page.locator('#paperFormSetting').inputValue(),custom.settings.paperForm.id);
   const output=await page.evaluate(async()=>{const p=(await window.exam.boot()).project;return {docx:await window.exam.exportDocument({projectId:p.id,format:'docx'}),pdf:await window.exam.exportDocument({projectId:p.id,format:'pdf'})};});
   if(process.env.EXAM_VERIFY_HWP==='1'){
    // Exercise the existing visible HWP action and its actual Hancom converter.
    // No security dialog handling or native conversion stubs are installed.
    await page.locator('#exportHwp').click();
    await page.getByRole('heading',{name:/한글 (?:문서를 저장했습니다|HWP 저장에 실패했습니다)/}).waitFor({timeout:420000});
    output.hwpDialog=await page.locator('#mainDialog').innerText();
    fs.writeFileSync(path.join(dir,'hwp-result.json'),JSON.stringify({dialog:output.hwpDialog,appRoot:env.EXAM_TEST_APP_ROOT,aiCalls:0},null,2));
    assert.ok(output.hwpDialog.includes('한글 문서를 저장했습니다'),output.hwpDialog);
   }
   assert.ok(fs.existsSync(output.docx.path));assert.ok(fs.existsSync(output.pdf.path));assert.deepEqual(errors,[]);fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({output,custom:custom.settings.paperForm,orderPreserved:true,reloadPreserved:true,errors,aiCalls:0},null,2));console.log('PASS actual desktop form dropdown, auto preview, edit/save/reload, order preservation and DOCX/PDF exports');
  }finally{await app.close();}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}
