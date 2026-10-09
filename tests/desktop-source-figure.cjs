'use strict';
if(process.versions.electron)require('./desktop-workflow.cjs');else{
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
 const root=path.resolve(__dirname,'..'),runtime=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies');
 const {_electron}=require(path.join(runtime,'node/node_modules/playwright'));
 (async()=>{
  const dir=fs.mkdtempSync(path.join(root,'data/validation/source-figure-')),source=path.join(dir,'source.png');
  await require('sharp')(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="white"/><path d="M200 480 L400 200 L600 480 Z" stroke="black" fill="none" stroke-width="4"/><text x="70" y="60" font-size="25">Source question</text></svg>')).png().toFile(source);
  const {ProjectStore}=require('../app/store.cjs'),{Workflow}=require('../app/workflow.cjs'),{recognition}=require('./workflow-fixtures.cjs');
  const store=new ProjectStore(dir);let project=store.create(source);project=store.addRegion({projectId:project.id,region:{page:1,x:0,y:0,width:1,height:1},imageDataUrl:'data:image/png;base64,'+fs.readFileSync(source).toString('base64')});
  const r=recognition();r.choiceLayout='vertical';r.choices=['첫 번째 선택지','두 번째 선택지','세 번째 선택지'];r.observedDiagram.points[0].name='A1T';r.observedDiagram.segments[0].from='A1T';r.observedDiagram.segments[2].from='A1T';r.observedDiagram.angles=[];
  const workflow=new Workflow({store,directory:dir,getBridge:()=>({run:async()=>({result:{reply:'인식',recognition:r}})}),getSettings:()=>({model:'gpt-6-astra',effort:'medium'})});
  await workflow.run({projectId:project.id,problemId:project.problems[0].id,provider:'codex',task:'recognition'});
  store.updateProblem(project.id,project.problems[0].id,p=>{p.original.body='물음에 답하시오.\n\n(1) 첫째 카드\n\n(2) 둘째 카드\n\n(1) 첫째 물음\n\n(2) 둘째 물음';p.original.answer='2';p.original.solution='저장된 상세 풀이';p.original.checks={ai:{status:'failed',unverified:['좌표 확인 필요']},program:{errors:['좌표 불일치']},scope:{status:'incompatible'}};p.original.validation={errors:['도형 재검수 실패']};p.original.solutionDraft={holdReason:'보류',solution:'보류된 풀이'};});
  const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env:{...process.env,EXAM_DATA_DIR:dir,EXAM_TEST_EXPORT:path.join(dir,'source-figure.docx'),EXAM_PYTHON:path.join(runtime,'python/python.exe')}}),page=await app.firstWindow();page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.locator('[data-view="original"]').click();await page.locator('.vertical-choices').waitFor();
   const choices=page.getByRole('combobox',{name:'선택지 배치',exact:true});assert.equal(await choices.inputValue(),'vertical');
   await choices.selectOption('auto');await page.waitForFunction(()=>!document.querySelector('.vertical-choices'));
   await page.locator('#chatInput').fill('선택지를 세로로 정렬해줘');await page.locator('#sendChat').click();await page.locator('.vertical-choices').waitFor();
   await page.locator('[data-figure-id="diagram"] .figure-delete').click();await page.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await page.locator('.question-card svg').count(),1);
   await page.locator('[data-figure-id="diagram"] .figure-delete').click();await page.locator('#confirmDeleteFigure').click();await page.waitForFunction(()=>!document.querySelector('.question-card svg'));
   await page.getByRole('button',{name:'원본 그림 그대로 사용',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.source-figure-crop img')?.naturalWidth>0);
   const b=await page.locator('.source-figure-crop').boundingBox();await page.mouse.move(b.x+b.width*.2,b.y+b.height*.25);await page.mouse.down();await page.mouse.move(b.x+b.width*.8,b.y+b.height*.85,{steps:8});await page.mouse.up();
   await page.locator('#saveSourceFigure').click();await page.waitForFunction(()=>!document.querySelector('#mainDialog').open);
   await page.waitForFunction(()=>document.querySelector('.source-figure-image')?.naturalWidth>0);assert.equal(await page.locator('.question-card svg').count(),0);
   const before=(await page.evaluate(()=>window.exam.boot())).project.problems[0].original;
   await page.getByRole('button',{name:'원본 그림 추가·변경',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.source-figure-crop img')?.naturalWidth>0);
   await page.getByRole('combobox',{name:'원본 그림 추가 방식',exact:true}).selectOption('add');
   const second=await page.locator('.source-figure-crop').boundingBox();await page.mouse.move(second.x+second.width*.1,second.y+second.height*.1);await page.mouse.down();await page.mouse.move(second.x+second.width*.5,second.y+second.height*.6,{steps:8});await page.mouse.up();await page.locator('#saveSourceFigure').click();
   await page.waitForFunction(()=>document.querySelectorAll('.figure-object').length===2);
   const gaps=require('../app/question-presentation.js').flowParts(before.body);
   await page.locator('[data-figure-id="diagram"] select').selectOption(gaps[1].slot);
   await page.waitForFunction(async slot=>(await window.exam.boot()).project.problems[0].original.figurePlacements.diagram===slot,gaps[1].slot);
   const added=(await page.evaluate(()=>window.exam.boot())).project.problems[0].original.sourceFigures[0].id;
   await page.locator(`[data-figure-id="${added}"] select`).selectOption(gaps[2].slot);
   await page.waitForFunction(async({id,slot})=>(await window.exam.boot()).project.problems[0].original.figurePlacements[id]===slot,{id:added,slot:gaps[2].slot});
   await page.reload();await page.locator('[data-view="original"]').click();await page.waitForFunction(()=>document.querySelector('.source-figure-image')?.naturalWidth>0);assert.equal(await choices.inputValue(),'vertical');
   await page.getByRole('checkbox',{name:'검토 완료 · Word에 포함',exact:true}).check();
   await page.waitForFunction(async()=>(await window.exam.boot()).project.problems[0].original.approval.method==='manual_user_authorized');
   await page.reload();await page.locator('[data-view="original"]').click();assert.equal(await page.getByRole('checkbox',{name:'검토 완료 · Word에 포함',exact:true}).isChecked(),true);
   const result=await page.evaluate(async()=>{const b=await window.exam.boot();const preview=await window.exam.previewDocument({projectId:b.project.id});const docx=await window.exam.exportDocument({projectId:b.project.id,format:'docx'});const pdf=await window.exam.exportDocument({projectId:b.project.id,format:'pdf'});return {preview,docx,pdf};});
   assert.equal(result.preview.questions[0].solution,'저장된 상세 풀이');assert.equal(result.preview.questions[0].manualOutputApproved,true);
   assert.equal(result.preview.questions[0].choiceLayout,'vertical');assert.match(result.preview.questions[0].sourceFigureDataUrl,/^data:image\/png/);assert.ok(fs.existsSync(result.docx.path));assert.ok(fs.existsSync(result.pdf.path));
   assert.equal(result.preview.questions[0].materialImages.length,1);assert.equal(result.preview.questions[0].figurePlacements[added],gaps[2].slot);
   await page.locator(`[data-figure-id="${added}"] .figure-delete`).click();await page.locator('#confirmDeleteFigure').click();await page.waitForFunction(()=>document.querySelectorAll('.figure-object').length===1);
   const deleted=await page.evaluate(async()=>{const b=await window.exam.boot();return window.exam.previewDocument({projectId:b.project.id});});assert.equal(deleted.questions[0].materialImages.length,0);
   fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(result,null,2));await page.screenshot({path:path.join(dir,'source-figure.png')});
   await page.getByRole('button',{name:'인식 도형으로 전환',exact:true}).click();await page.locator('.question-card svg').waitFor();
   const after=(await page.evaluate(()=>window.exam.boot())).project.problems[0].original;for(const key of ['body','choices','answer','solution'])assert.deepEqual(after[key],before[key]);
   assert.equal(await app.evaluate(()=>global.__requests.length),0);assert.deepEqual(errors,[]);console.log('PASS real UI: source vertical recognition, layout menu/chat, crop preview/save/reopen, original/AI figure switch, actual Word/PDF exports, zero AI calls: '+dir);
  }finally{await app.close();}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}
