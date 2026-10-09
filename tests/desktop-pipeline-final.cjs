'use strict';
if(process.versions.electron)require('./desktop-workflow.cjs');else{
 const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),root=path.resolve(__dirname,'..'),{_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 (async()=>{
 const dir=fs.mkdtempSync(path.join(root,'data/validation/pipeline-final-')),source=path.join(dir,'source.png');await require('sharp')({create:{width:900,height:1100,channels:3,background:'white'}}).png().toFile(source);
 const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env:{...process.env,EXAM_DATA_DIR:dir,EXAM_TEST_SOURCE:source}}),page=await app.firstWindow();page.setDefaultTimeout(25000);const errors=[];page.on('pageerror',e=>errors.push(e.stack));
 const boot=()=>page.evaluate(()=>window.exam.boot()),done=()=>page.waitForFunction(()=>!document.querySelector('#batchProgressDialog').open&&document.querySelector('#dialogTitle').textContent==='일괄 작업 결과');
 try{
 await page.waitForFunction(()=>document.querySelector('#aiModel').options.length===2);await page.locator('#importSource').click();await page.locator('#confirmImportScope').click();await page.waitForFunction(()=>!document.querySelector('#fitWidth').disabled);
 assert.equal(await page.locator('#replaceSelection,#appendSelection,#newSelection').count(),0);assert.ok(await page.locator('#cancelSelection').isVisible());
 for(const [top,bottom] of [[.05,.23],[.35,.53],[.65,.84]]){const b=await page.locator('#selectionLayer').boundingBox();await page.mouse.move(b.x+b.width*.1,b.y+b.height*top);await page.mouse.down();await page.mouse.move(b.x+b.width*.8,b.y+b.height*bottom,{steps:3});await page.mouse.up();await page.waitForFunction(()=>!document.querySelector('#fitWidth').disabled);}
 await app.evaluate(()=>{global.__recognitionSuffix=' 분수 $\\frac{1}{2}$와 근호 $\\sqrt{3}$';});
 await page.locator('#batch-recognition').click();await page.waitForFunction(()=>!document.querySelector('#batchStart').disabled);await page.locator('#batchStart').click();await done();await page.locator('#closeDialog').click();
 await page.locator('#batch-automatic').click();await page.waitForFunction(()=>!document.querySelector('#batchStart').disabled);await page.locator('#batchStart').click();await done();assert.match(await page.locator('#dialogBody').innerText(),/오류 0건/);let project=(await boot()).project;assert.equal(project.problems.length,3);for(const p of project.problems){assert.equal(p.variants.length,0);assert.equal(p.original.include,true);assert.equal(p.recognition.confirmed,true);assert.doesNotMatch(p.original.solution,/총 6점/);}let calls=await app.evaluate(()=>global.__requests.length);assert.equal(calls,6);await page.locator('#closeDialog').click();
 // A repeat source-only run reuses every result, with no additional AI call.
 await page.locator('#batch-automatic').click();await page.waitForFunction(()=>!document.querySelector('#batchStart').disabled);await page.locator('#batchStart').click();await done();assert.equal(await app.evaluate(()=>global.__requests.length),calls);await page.locator('#closeDialog').click();
 // Dragging tab three to the first position keeps stable identities and saved content.
 const ids=project.problems.map(p=>p.id);await page.locator('.problem-tab').nth(2).dragTo(page.locator('.problem-tab').nth(0));await page.waitForFunction(async id=>(await window.exam.boot()).project.problems[0].id===id,ids[2]);project=(await boot()).project;assert.deepEqual(project.problems.map(p=>p.id),[ids[2],ids[0],ids[1]]);
 await page.locator('#batch-generation').click();assert.equal(await page.locator('.batch-variant-choice').count(),3);await page.locator('.batch-variant-choice').nth(1).selectOption('mirror_numeric');await page.locator('.batch-variant-choice').nth(2).selectOption('harder');await page.locator('#batchStart').click();await done();const reqs=await app.evaluate(()=>global.__requests.slice(-3).map(r=>({instructions:r.execution.instructions,data:JSON.parse(r.text.split('현재 작업 자료(분석 대상):\n')[1].split('\n\n사용자 요청:')[0])})));assert.match(reqs[1].instructions,/variants.mirror_numeric/);assert.match(reqs[2].instructions,/한 단계 높은 난이도/);assert.equal(reqs[2].data.difficultyPolicy,'one_level_higher');assert.ok(!reqs[0].instructions.includes('[variants.mirror_numeric@'));await page.locator('#closeDialog').click();
 // Use approved originals to exercise real Word/PDF rendering without AI.
 await app.evaluate((_,target)=>{process.env.EXAM_TEST_EXPORT=target;},path.join(dir,'teacher.pdf'));
 const pdf=await page.evaluate(id=>window.exam.exportDocument({projectId:id,format:'pdf',audience:'teacher'}),project.id);assert.ok(fs.readFileSync(pdf.path).subarray(0,5).equals(Buffer.from('%PDF-')));
 await app.evaluate((_,target)=>{process.env.EXAM_TEST_EXPORT=target;},path.join(dir,'student.pdf'));
 const student=await page.evaluate(id=>window.exam.exportDocument({projectId:id,format:'pdf',audience:'student'}),project.id);assert.ok(fs.existsSync(student.path));
 await app.evaluate((_,target)=>{process.env.EXAM_TEST_EXPORT=target;},path.join(dir,'teacher.docx'));
 const word=await page.evaluate(id=>window.exam.exportDocument({projectId:id,format:'docx',audience:'teacher'}),project.id);assert.ok(fs.existsSync(word.path));
 await page.screenshot({path:path.join(dir,'final-ui.png')});assert.deepEqual(errors,[]);console.log('PASS source-only automatic, reuse without calls, tab drag persistence, per-source variants, real teacher/student PDF and Word: '+dir);
 }catch(e){console.error(e,errors);await page.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});throw e;}finally{await app.close();}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}
