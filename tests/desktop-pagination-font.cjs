'use strict';
if(process.versions.electron)require('./desktop-workflow.cjs');else{
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
 const root=path.resolve(__dirname,'..'),runtime=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies');
 const {_electron}=require(path.join(runtime,'node/node_modules/playwright'));
 (async()=>{
  const dir=fs.mkdtempSync(path.join(root,'data/validation/pagination-font-')),source=path.join(dir,'source.png');
  await require('sharp')({create:{width:400,height:400,channels:3,background:'white'}}).png().toFile(source);
  const {ProjectStore}=require('../app/store.cjs'),{Workflow}=require('../app/workflow.cjs');const store=new ProjectStore(dir);let project=store.create(source);
  const sizes=[2,2,2,2,22,5,115,3];
  for(let i=0;i<sizes.length;i++){
   project=store.addRegion({projectId:project.id,region:{page:1,x:0,y:0,width:1,height:1},imageDataUrl:'data:image/png;base64,'+fs.readFileSync(source).toString('base64')});
   const pid=project.problems.at(-1).id;
   store.updateProblem(project.id,pid,p=>{p.original={id:'q'+i,kind:'original',sourceId:pid,body:Array.from({length:sizes[i]},(_,n)=>`Q${i}L${n} 조건을 확인하고 계산합니다. $\\frac{13}{2}=6.5$`).join('\n')+`\nEND_Q${i}`,choices:['첫 번째 선택지','두 번째 선택지'],answer:'1',solution:'이유와 계산을 설명합니다.',include:false,layout:'auto'};});
   const w=Object.create(Workflow.prototype);w.store=store;w.includeWithoutSolution({projectId:project.id,problemId:pid,questionId:'q'+i});
  }
  const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env:{...process.env,EXAM_DATA_DIR:dir,EXAM_TEST_EXPORT:path.join(dir,'layout.docx'),EXAM_PYTHON:path.join(runtime,'python/python.exe')}}),page=await app.firstWindow();page.setDefaultTimeout(45000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.locator('#bodyFontSetting').selectOption('바탕');await page.waitForFunction(async()=>(await window.exam.boot()).project.settings.bodyFont==='바탕');
   await page.locator('#bodyFontSizeSetting').selectOption('16');await page.waitForFunction(async()=>(await window.exam.boot()).project.settings.bodyFontSize===16);
   await page.locator('#solutionFontSetting').selectOption('돋움');await page.waitForFunction(async()=>(await window.exam.boot()).project.settings.solutionFont==='돋움');
   await page.locator('#solutionFontSizeSetting').selectOption('14');await page.waitForFunction(async()=>(await window.exam.boot()).project.settings.solutionFontSize===14);
   const output=await page.evaluate(async()=>{const b=await window.exam.boot();return {preview:await window.exam.previewDocument({projectId:b.project.id,renderPdf:true}),pdf:await window.exam.exportDocument({projectId:b.project.id,format:'pdf'}),docx:await window.exam.exportDocument({projectId:b.project.id,format:'docx'})};});
   assert.equal(output.preview.settings.bodyFont,'바탕');assert.equal(output.preview.settings.bodyFontSize,16);
   assert.equal(output.preview.settings.solutionFont,'돋움');assert.equal(output.preview.settings.solutionFontSize,14);
   const previewPath=path.join(dir,'preview.pdf');fs.writeFileSync(previewPath,Buffer.from(output.preview.pdfBase64,'base64'));
   const pdfjs=await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
   async function inspect(file){const task=pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(file)),useSystemFonts:true}),pdf=await task.promise;const pages=[];for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n),content=await p.getTextContent();pages.push(content.items.filter(x=>x.str).map(x=>({text:x.str,x:Math.round(x.transform[4]*100)/100,y:Math.round(x.transform[5]*100)/100})));}await task.destroy();return pages;}
   const preview=await inspect(previewPath),saved=await inspect(output.pdf.path);assert.deepEqual(saved,preview,'preview and saved PDF must have identical text positions and page breaks');
   const flat=saved.flat(),text=flat.map(x=>x.text).join(' ');for(let i=0;i<sizes.length;i++)for(let n=0;n<sizes[i];n++)assert.ok(text.includes(`Q${i}L${n} `),`missing line Q${i}L${n}`);
   for(let i=0;i<sizes.length;i++)assert.ok(text.includes(`END_Q${i}`));
   for(const item of flat)assert.ok(item.y>=30&&item.y<=810,`text outside A4 print area: ${JSON.stringify(item)}`);
   await page.locator('#previewDocument').click();await page.locator('.pdf-preview-page').first().waitFor();await page.waitForFunction(()=>!document.querySelector('#bodyFontSetting').disabled);assert.equal(await page.locator('.pdf-preview-page').count(),saved.length);await page.screenshot({path:path.join(dir,'preview.png')});await page.locator('#closeDialog').click();
   await page.reload();assert.equal(await page.locator('#bodyFontSetting').inputValue(),'바탕');assert.equal(await page.locator('#bodyFontSizeSetting').inputValue(),'16');
   assert.equal(await page.locator('#solutionFontSetting').inputValue(),'돋움');assert.equal(await page.locator('#solutionFontSizeSetting').inputValue(),'14');
   assert.deepEqual(errors,[]);fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({pdf:output.pdf,docx:output.docx,pages:saved.length,positions:saved},null,2));console.log('PASS font UI/persistence, measured pagination, long-question continuation, all lines in page bounds and exact preview/PDF agreement: '+dir);
  }finally{await app.close();}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}
