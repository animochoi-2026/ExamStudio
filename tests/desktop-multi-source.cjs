'use strict';
if(process.versions.electron){
 const {dialog}=require('electron');
 global.__fileSelection=[];global.__pickerOptions=[];
 dialog.showOpenDialog=async(_window,options)=>{global.__pickerOptions.push(options);return {canceled:!global.__fileSelection.length,filePaths:global.__fileSelection};};
 dialog.showSaveDialog=async(_window,options)=>({canceled:false,filePath:options.defaultPath});
 require('./desktop-workflow.cjs');
}else{
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
 const root=path.resolve(__dirname,'..'),{_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 function pdf(file,pages){
  const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${Array.from({length:pages},(_,i)=>`${3+i*2} 0 R`).join(' ')}] /Count ${pages} >>`];
  for(let i=0;i<pages;i++)objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${4+i*2} 0 R >>`,'<< /Length 0 >>\nstream\n\nendstream');
  let body='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(body));body+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(body);body+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;fs.writeFileSync(file,body);
 }
 (async()=>{
  const dir=fs.mkdtempSync(path.join(root,'data/validation/multi-source-')),files=['첫 시험지_중학교_2학년_2학기_삼각형의성질_사각형의성질_긴파일명_확인용.pdf','둘째 시험지.pdf','사진.png','사진.JPG'].map(f=>path.join(dir,f));pdf(files[0],2);pdf(files[1],1);
  await require('sharp')({create:{width:900,height:1200,channels:3,background:'white'}}).png().toFile(files[2]);await require('sharp')(files[2]).jpeg().toFile(files[3]);
  const env={...process.env,EXAM_DATA_DIR:dir};delete env.EXAM_TEST_SOURCE;
  const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env}),page=await app.firstWindow(),errors=[];page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const boot=()=>page.evaluate(()=>window.exam.boot()),ready=()=>page.waitForFunction(()=>!document.querySelector('#fitWidth').disabled&&!document.querySelector('#pageStage').hidden);
  const pick=async(selection,id='#importSource')=>{await app.evaluate((_electron,files)=>{global.__fileSelection=files;},selection);await page.locator(id).click();};
  const capture=async()=>{const n=(await boot()).project.problems.length,box=await page.locator('#selectionLayer').boundingBox();await page.mouse.move(box.x+box.width*.1,box.y+box.height*.1);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.3,{steps:5});await page.mouse.up();await page.waitForFunction(async n=>(await window.exam.boot()).project.problems.length===n+1,n);await ready();};
  const tab=async index=>{await page.locator('.source-tab').nth(index).click();await ready();};
  const automatic=async()=>{await page.locator('#batch-automatic').click();await page.waitForFunction(()=>!document.querySelector('#batchStart').disabled);await page.locator('#batchStart').click();await page.waitForFunction(()=>!document.querySelector('#batchProgressDialog').open&&document.querySelector('#dialogTitle').textContent==='일괄 작업 결과');assert.match(await page.locator('#dialogBody').innerText(),/Word 저장 완료/);await page.locator('#closeDialog').click();};
  try{
   await page.waitForFunction(()=>document.querySelector('#aiModel').options.length===2);
   await pick(files.slice(0,3));await page.locator('#confirmImportScope').click();await ready();assert.equal(await page.locator('.source-tab').count(),3);assert.ok((await app.evaluate(()=>global.__pickerOptions[0].properties)).includes('multiSelections'));
   const fits=()=>page.waitForFunction(()=>{const v=document.querySelector('#viewer');return v.scrollHeight<=v.clientHeight&&v.scrollWidth<=v.clientWidth;});
   await fits();assert.equal(await page.locator('.source-tab').first().getAttribute('title'),path.basename(files[0]));assert.ok(await page.locator('.source-tab').first().evaluate(n=>n.scrollWidth>n.clientWidth&&getComputedStyle(n).textOverflow==='ellipsis'));
   assert.equal(await page.locator('#edgePreviousPage').isDisabled(),true);assert.equal(await page.locator('#edgeNextPage').isDisabled(),false);await page.locator('#edgeNextPage').click();await page.waitForFunction(()=>document.querySelector('#pageNumber').value==='2');assert.equal(await page.locator('#edgeNextPage').isDisabled(),true);await page.locator('#edgePreviousPage').click();await page.waitForFunction(()=>document.querySelector('#pageNumber').value==='1');
   assert.equal(await page.locator('#newProject').innerText(),'원본 불러오기');assert.equal(await page.locator('#openProject').innerText(),'저장 작업 열기');assert.match(await page.locator('#openProject').getAttribute('title'),/인식 결과·풀이·대화/);
   assert.equal(await page.locator('#aiSidebar > :last-child #promptSettingsButton').count(),1);assert.equal(await page.locator('.header-actions #promptSettingsButton').count(),0);await page.locator('#promptSettingsButton').click();assert.equal(await page.locator('#mainDialog').evaluate(n=>n.open),true);await page.locator('#closeDialog').click();
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1280,760));await fits();
   const addBox=await page.locator('#addSourceTab').boundingBox(),paneBox=await page.locator('.source-pane').boundingBox();assert.ok(addBox.x+addBox.width<=paneBox.x+paneBox.width);await page.locator('#sourceTabs').evaluate(n=>n.scrollLeft=n.scrollWidth);assert.deepEqual(await page.locator('#addSourceTab').boundingBox(),addBox);
   await page.locator('#zoomIn').click();await page.locator('#fitPage').click();await fits();await page.screenshot({path:path.join(dir,'compact-viewer.png')});
   console.log('PASS filename ellipsis/full tooltip, pinned add button, full-page fit and resize, renamed open controls, sidebar prompt settings');
   await page.locator('#nextPage').click();await page.waitForFunction(()=>document.querySelector('#pageNumber').value==='2');await capture();
   await tab(1);assert.equal(await page.locator('.region-box').count(),0);await capture();
   await tab(2);assert.equal(await page.locator('.region-box').count(),0);await capture();
   await tab(0);assert.equal(await page.locator('#pageNumber').inputValue(),'2');assert.equal(await page.locator('.region-box').count(),1);
   console.log('PASS mixed native multi-import, per-file PDF pages, isolated region overlays and page restore');
   await automatic();let before=(await boot()).project;assert.ok(before.problems.every(p=>p.original.include&&p.recognition.confirmed));assert.equal(await app.evaluate(()=>global.__requests.length),6);
   // Real dropped files append to the same project, and do not reopen/reset scope.
   await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.multiple=true;input.id='testDropInput';input.hidden=true;document.body.append(input);});await page.locator('#testDropInput').setInputFiles([files[3]]);
   await page.evaluate(()=>{const dt=new DataTransfer();for(const f of document.querySelector('#testDropInput').files)dt.items.add(f);window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));});
   await page.waitForFunction(()=>document.querySelectorAll('.source-tab').length===4);await ready();let after=(await boot()).project;assert.equal(after.id,before.id);assert.deepEqual(after.scope,before.scope);assert.deepEqual(after.problems,before.problems);assert.equal(await page.locator('#mainDialog').evaluate(n=>n.open),false);
   await capture();const fourth=(await boot()).project.problems[3].id;
   await page.locator('#manageProblems').click();await page.locator('.manage-row').nth(3).dragTo(page.locator('.manage-row').nth(0));await page.waitForFunction(async id=>(await window.exam.boot()).project.problems[0].id===id,fourth);await page.locator('#closeDialog').click();
   await page.locator('.problem-tab').nth(1).click();await ready();assert.equal(await page.locator('.source-tab.active').innerText(),path.basename(files[0]));assert.equal(await page.locator('#pageNumber').inputValue(),'2');
   await automatic();assert.equal(await app.evaluate(()=>global.__requests.length),8);after=(await boot()).project;
   const snapshot=JSON.parse(fs.readFileSync(path.join(dir,'projects',after.id,'exports/export-input.json'),'utf8'));
   assert.deepEqual(snapshot.questions.map(q=>q.sourceId),after.problems.map(p=>p.id));assert.equal(snapshot.questions.length,4);
   const pdfResult=await page.evaluate(projectId=>window.exam.exportDocument({projectId,format:'pdf'}),after.id);assert.equal(fs.readFileSync(pdfResult.path).subarray(0,5).toString(),'%PDF-');
   console.log('PASS append preserves confirmed solutions; automatic reuses old work; dragged global order reaches DOCX and PDF');
   await page.reload();await ready();assert.equal(await page.locator('.source-tab').count(),4);assert.equal(await page.locator('.source-tab.active').innerText(),path.basename(files[3]));assert.deepEqual((await boot()).project.problems.map(p=>p.id),after.problems.map(p=>p.id));
   await page.locator('#manageProblems').click();await page.locator('#sortProblemsBySource').click();await page.waitForFunction(async id=>(await window.exam.boot()).project.problems[0].id===id,before.problems[0].id);assert.deepEqual((await boot()).project.problems.map(p=>p.regions[0].sourceId),after.sources.map(s=>s.id));await page.locator('#closeDialog').click();
   await pick([]);assert.equal((await boot()).project.id,after.id);await pick([files[1]],'#addSourceTab');await ready();assert.equal(await page.locator('.source-tab').count(),5);assert.equal((await boot()).project.problems.length,4);
   await page.screenshot({path:path.join(dir,'multi-source.png')});
   const savedFile=path.join(dir,'projects',after.id,'project.json'),savedBytes=fs.readFileSync(savedFile),savedSettings=(await boot()).aiSettings;
   await page.locator('#chatInput').fill('아직 보내지 않은 요청');
   assert.ok(await page.locator('#resetWorkspace').evaluate(n=>n.nextElementSibling.id==='openProject'));
   await page.locator('#resetWorkspace').click();assert.match(await page.locator('#dialogBody').innerText(),/삭제하지 않습니다/);await page.locator('#cancelNewWorkspace').click();assert.equal((await boot()).project.id,after.id);assert.equal(await page.locator('#chatInput').inputValue(),'아직 보내지 않은 요청');
   await page.locator('#resetWorkspace').click();await page.locator('#confirmNewWorkspace').click();
   await page.waitForFunction(async()=>window.exam&&(await window.exam.boot()).project===null&&document.querySelector('#sourceEmpty')&&!document.querySelector('#sourceEmpty').hidden&&!document.querySelector('#mainDialog').open);
   assert.equal(await page.locator('.problem-tab').count(),0);assert.equal(await page.locator('#sourceTabStrip').isVisible(),false);assert.equal(await page.locator('#chatInput').inputValue(),'');assert.equal(await page.locator('#chatInput').isDisabled(),true);assert.equal(await page.locator('#documentCount').innerText(),'0문제');assert.deepEqual((await boot()).aiSettings,savedSettings);assert.deepEqual(fs.readFileSync(savedFile),savedBytes);
   await page.reload();await page.waitForFunction(async()=>window.exam&&(await window.exam.boot()).project===null&&document.querySelector('#recentProjects button'));
   await page.locator('#recentProjects button').first().click();await page.locator('#confirmImportScope').click();await ready();assert.equal((await boot()).project.id,after.id);assert.equal((await boot()).project.problems.length,4);
   console.log('PASS confirmed new workspace resets screen and startup; cancellation keeps drafts; saved work reopens intact');
   await pick([files[2]],'#newProject');await page.locator('#confirmImportScope').click();await ready();assert.notEqual((await boot()).project.id,after.id);assert.equal((await boot()).project.problems.length,0);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'projects',after.id,'project.json'),'utf8')).problems.length,4);
   assert.deepEqual(errors,[]);console.log('PASS reopen, source-order sort, native append/cancel and separate new project preserve saved work. '+dir);
  }catch(error){await page.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});console.error(errors);throw error;}finally{await app.close();}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}
