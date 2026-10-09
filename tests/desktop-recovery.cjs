'use strict';
if(process.versions.electron)require('./desktop-workflow.cjs');else{
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),runtime=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies');
const {_electron}=require(path.join(runtime,'node/node_modules/playwright'));
(async()=>{
 const dir=fs.mkdtempSync(path.join(root,'data/validation/recovery-ui-')),source=path.join(dir,'source.png');
 await require('sharp')({create:{width:900,height:800,channels:3,background:'white'}}).png().toFile(source);
 const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env:{...process.env,EXAM_DATA_DIR:dir,EXAM_TEST_SOURCE:source,EXAM_PYTHON:path.join(runtime,'python/python.exe')}});
 const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const boot=()=>page.evaluate(()=>window.exam.boot());const idle=()=>page.waitForFunction(()=>document.querySelector('#cancelChat').hidden);
 const wait=async fn=>{for(let i=0;i<300;i++){if(await fn(await boot()))return;await new Promise(r=>setTimeout(r,40));}throw Error('timeout');};
 try{
  await page.waitForFunction(()=>document.querySelector('#aiModel').options.length===2);await page.locator('#importSource').click();await page.locator('#confirmImportScope').click();await page.locator('#collectRegions').uncheck();await page.waitForFunction(()=>!document.querySelector('#pageStage').hidden&&!document.querySelector('#zoomIn').disabled);
  const b=await page.locator('#selectionLayer').boundingBox();await page.mouse.move(b.x+b.width*.1,b.y+b.height*.1);await page.mouse.down();await page.mouse.move(b.x+b.width*.7,b.y+b.height*.6,{steps:5});await page.mouse.up();await page.locator('#confirmRegionSelection').click();await wait(d=>d.project.problems[0]?.recognition);await idle();
  await app.evaluate(()=>global.__holdSolve=true);await page.locator('[data-view="original"]').click();await page.locator('#confirmRecognition').click();await wait(d=>d.project.problems[0].original.solutionDraft);await idle();
  await page.locator('[data-view="original"]').click();assert.equal(await page.locator('.recovery-details').getAttribute('open'),null);await page.locator('.recovery-details summary').click();assert.match(await page.locator('.recovery-details').innerText(),/검토용 풀이/);const old=(await boot()).project.problems[0].original;
  assert.ok(!(await page.locator('#chatInput').inputValue()));console.log('PASS held solution remains visible with details without automatic chat input or approval');
  assert.equal(await page.locator('#errorList').getByRole('button',{name:'자동 정리',exact:true}).count(),await page.locator('#errorList .error-entry-link').count());
  await app.evaluate(()=>global.__holdSolve=false);await page.locator('.recovery-panel').getByRole('button',{name:'원문대로 자동 정리·풀이 작성',exact:true}).click();await wait(d=>!d.project.problems[0].original.solutionDraft);await idle();
  const p=(await boot()).project.problems[0];assert.equal(p.original.body,old.body);assert.equal(p.variants.length,0);assert.equal(p.original.solutionDraftHistory.length,1);assert.match(p.original.solution,/참고 코멘트/);assert.equal(p.original.approval.status,'pending');
  assert.equal(await page.locator('#errorList .error-entry-link').count(),0);
  console.log('PASS one-click recovery preserves the original, adds solution notes, creates no variant and clears only resolved logs');
  const last=await app.evaluate(()=>global.__requests.at(-1));assert.equal(last.images.length,1);assert.match(last.execution.instructions,/원문 보존 풀이집 정책/);
  const previews=await page.evaluate(async()=>{const d=await window.exam.boot(),p=d.project.problems[0];await window.exam.approveQuestion({projectId:d.project.id,problemId:p.id,questionId:p.original.id,approved:true});return{teacher:await window.exam.previewDocument({projectId:d.project.id,audience:'teacher'}),student:await window.exam.previewDocument({projectId:d.project.id,audience:'student'})};});
  assert.equal(previews.teacher.questions[0].body,old.body);assert.match(previews.teacher.questions[0].solution,/참고 코멘트/);assert.equal(previews.student.questions[0].solution,previews.teacher.questions[0].solution);console.log('PASS teacher Word uses the original body and solution notes; legacy student setting also includes notes and solutions');
  await page.locator('[data-view="original"]').click();await page.screenshot({path:path.join(root,'tests/artifacts/recovery-ui.png')});assert.deepEqual(errors,[]);
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});}
