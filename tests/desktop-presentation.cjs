'use strict';
if(process.versions.electron)require('./desktop-workflow.cjs');else{
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),runtime=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies');
const {_electron}=require(path.join(runtime,'node/node_modules/playwright'));
(async()=>{
 const dir=fs.mkdtempSync(path.join(root,'data/validation/presentation-')),source=path.join(dir,'source.png');
 await require('sharp')(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="800"><rect width="900" height="800" fill="white"/><rect x="2" y="2" width="176" height="76" fill="#e0eee8"/><rect x="182" y="2" width="176" height="76" fill="#eee6d4"/><text x="30" y="48" font-size="22">Method 1</text><text x="210" y="48" font-size="22">Method 2</text></svg>')).png().toFile(source);
 const {ProjectStore}=require('../app/store.cjs'),{Workflow}=require('../app/workflow.cjs'),{recognition}=require('./workflow-fixtures.cjs');
 const store=new ProjectStore(dir);let project=store.create(source);project=store.addRegion({projectId:project.id,region:{page:1,x:0,y:0,width:1,height:1},imageDataUrl:'data:image/png;base64,'+fs.readFileSync(source).toString('base64')});
 const workflow=new Workflow({store,directory:dir,getBridge:()=>({run:async()=>({result:{reply:'인식',recognition:recognition()}})}),getSettings:()=>({model:'gpt-6-astra',effort:'medium'})});
 const base={projectId:project.id,problemId:project.problems[0].id,provider:'codex'};await workflow.run({...base,task:'recognition'});
 store.updateProblem(project.id,base.problemId,p=>{p.original.body='(1) 삼각형의 각을 구하시오.\n(2) 이유를 설명하시오.';p.recognition.materials=[{label:'방법 1',text:'',regionIndex:0,bounds:{x:0,y:0,width:.2,height:.1}},{label:'방법 2',text:'',regionIndex:0,bounds:{x:.2,y:0,width:.2,height:.1}}];});
 const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env:{...process.env,EXAM_DATA_DIR:dir,EXAM_TEST_EXPORT:path.join(dir,'presentation.docx'),EXAM_PYTHON:path.join(runtime,'python/python.exe')}}),page=await app.firstWindow();page.setDefaultTimeout(20000);
 const watchdog=setTimeout(()=>{console.error('UI test exceeded 90 seconds');app.process().kill();},90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.waitForFunction(()=>!!window.exam);await page.locator('[data-view="original"]').click();
  await page.locator('.diagram-position').selectOption('before');
  await page.waitForFunction(async()=>{const b=await window.exam.boot();return b.project.problems[0].original.diagramPosition==='before';});
  const order=()=>page.locator('.question-card').evaluate(n=>{const b=n.querySelector('.question-body'),svg=n.querySelector('svg');return !!(svg.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING);});
  assert.equal(await order(),true);assert.equal(await page.locator('.question-body > .subquestion-part').count(),2);
  await page.evaluate(()=>document.fonts.ready.then(()=>true));
  const gap=await page.locator('.subquestion-part').nth(1).evaluate(n=>({margin:parseFloat(getComputedStyle(n).marginTop),line:parseFloat(getComputedStyle(n).lineHeight)}));assert.ok(Math.abs(gap.margin-gap.line)<1,JSON.stringify(gap));
  const before=await page.evaluate(()=>window.exam.boot()),calls=await app.evaluate(()=>global.__requests.length);
  await page.locator('#chatInput').fill('그림을 문제 아래로 옮겨줘');await page.locator('#sendChat').click();
  await page.waitForFunction(async()=>{const b=await window.exam.boot();return b.project.problems[0].original.diagramPosition==='after';});
  assert.equal(await order(),false);assert.equal(await app.evaluate(()=>global.__requests.length),calls);
  const after=await page.evaluate(()=>window.exam.boot());const expected={...before.project.problems[0].original,diagramPosition:'after',figurePlacements:{diagram:'after'}};assert.deepEqual(after.project.problems[0].original,expected);
  await page.reload();await page.locator('[data-view="original"]').click();assert.equal(await page.locator('.diagram-position').inputValue(),'after');
  await page.locator('.diagram-position').selectOption('before');await page.waitForFunction(async()=>{const b=await window.exam.boot();return b.project.problems[0].original.diagramPosition==='before';});
  await page.waitForFunction(()=>document.querySelectorAll('.figure-object').length===3);
  const baseline=await page.evaluate(()=>window.exam.boot());
  async function dragFigure(id,slot){
   console.log('DRAG start '+id+' -> '+slot);
   const handle=page.locator(`[data-figure-id="${id}"] .figure-drag-handle`);await handle.scrollIntoViewIfNeeded();
   console.log('DRAG handle visible');const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+15,box.y+box.height/2+8,{steps:6});
   console.log('DRAG move initiated');await page.screenshot({path:path.join(dir,'drag-start.png')});const zone=page.locator(`[data-figure-slot="${slot}"]`);await zone.waitFor({state:'visible'});console.log('DRAG target visible');await zone.scrollIntoViewIfNeeded();const target=await zone.boundingBox();await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:12});await page.mouse.up();console.log('DRAG released');
   await page.waitForFunction(async({id,slot})=>{const b=await window.exam.boot();return b.project.problems[0].original.figurePlacements?.[id]===slot;},{id,slot});
   await page.waitForFunction(()=>document.querySelectorAll('.figure-object').length===3);
  }
  await dragFigure('diagram','part:1');
  assert.equal(await page.locator('.question-body > .figure-object').getAttribute('data-figure-id'),'diagram');
  const materialIds=await page.locator('.figure-object').evaluateAll(nodes=>nodes.map(n=>n.dataset.figureId).filter(id=>id!=='diagram'));
  await dragFigure(materialIds[0],'before');await dragFigure(materialIds[1],'part:1');await dragFigure(materialIds[1],'after');
  const final=await page.evaluate(()=>window.exam.boot());const q=final.project.problems[0].original;
  assert.equal(q.figurePlacements.diagram,'part:1');assert.equal(q.figurePlacements[materialIds[0]],'before');assert.equal(q.figurePlacements[materialIds[1]],'after');
  const clean=v=>{const c=structuredClone(v);delete c.figurePlacements;delete c.figurePlacementManual;delete c.diagramPosition;return c;};assert.deepEqual(clean(q),clean(baseline.project.problems[0].original));assert.equal(await app.evaluate(()=>global.__requests.length),calls);
  await page.reload();await page.locator('[data-view="original"]').click();await page.waitForFunction(()=>document.querySelectorAll('.figure-object').length===3);
  assert.equal(await page.locator('.diagram-position').inputValue(),'part:1');
  const exportState=await page.evaluate(async()=>{const b=await window.exam.boot(),p=b.project.problems[0];await window.exam.includeWithoutSolution({projectId:b.project.id,problemId:p.id,questionId:p.original.id});return window.exam.previewDocument({projectId:b.project.id});});
  assert.equal(exportState.questions[0].figurePlacements.diagram,'part:1');assert.deepEqual(exportState.questions[0].materialImages.map(m=>m.id),materialIds);
  const output=await page.evaluate(async()=>{const b=await window.exam.boot();return window.exam.exportDocument({projectId:b.project.id,format:'docx'});});assert.ok(fs.existsSync(output.path));
  await page.screenshot({path:path.join(dir,'screen.png')});assert.deepEqual(errors,[]);

  assert.equal(await page.locator('.task-controls,#includeTaskImages,#previewTask,#taskRuns').count(),0);
  const card=page.locator('#question-'+q.id),bodyEdit=page.locator(`[id="edit-${q.id}-body"]`);
  await card.getByRole('button',{name:'문구 수정',exact:true}).click();await bodyEdit.fill('취소할 문구');
  await card.getByRole('button',{name:'취소',exact:true}).click();assert.equal((await page.evaluate(()=>window.exam.boot())).project.problems[0].original.body,q.body);
  await card.getByRole('button',{name:'문구 수정',exact:true}).click();
  await bodyEdit.fill('(1) 수정한 첫째 물음\n(2) 수정한 둘째 물음');
  await page.locator(`[id="edit-${q.id}-statementBox"]`).fill('ㄱ. 첫 번째 보기\nㄴ. 두 번째 보기');
  await page.locator(`[id="edit-${q.id}-choices"]`).fill('ㄱ\nㄴ');
  await card.getByRole('button',{name:'수정 저장',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.editor-form'));
  let edited=(await page.evaluate(()=>window.exam.boot())).project.problems[0];
  assert.match(edited.original.body,/수정한 첫째/);assert.deepEqual(edited.original.statementBox,['ㄱ. 첫 번째 보기','ㄴ. 두 번째 보기']);assert.deepEqual(edited.original.choices,['ㄱ','ㄴ']);
  assert.deepEqual(edited.recognition.materials.map(({slot,...m})=>m),baseline.project.problems[0].recognition.materials.map(({slot,...m})=>m));assert.ok(edited.recognition.materials.every(m=>m.slot==='after'));assert.deepEqual(edited.original.observedDiagram,q.observedDiagram);assert.deepEqual(edited.original.figurePlacements,q.figurePlacements);
  const variant=await page.evaluate(async()=>{const b=await window.exam.boot(),p=b.project.problems[0];const result=await window.exam.editQuestion({projectId:b.project.id,problemId:p.id,questionId:p.original.id,mode:'content',values:{body:'유사문제 편집 전'}});return result.problems[0].variants.at(-1);});
  await page.reload();await page.locator('[data-view="variants"]').click();const vcard=page.locator('#question-'+variant.id);
  await vcard.getByRole('button',{name:'문구 수정',exact:true}).click();await page.locator(`[id="edit-${variant.id}-body"]`).fill('유사문제 편집 후');await vcard.getByRole('button',{name:'수정 저장',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.editor-form'));
  await page.reload();await page.locator('[data-view="variants"]').click();assert.match(await page.locator('#question-'+variant.id+' .question-body').innerText(),/유사문제 편집 후/);
  const editedExport=await page.evaluate(async()=>{const b=await window.exam.boot(),p=b.project.problems[0];for(const q of [p.original,...p.variants])await window.exam.includeWithoutSolution({projectId:b.project.id,problemId:p.id,questionId:q.id});return window.exam.previewDocument({projectId:b.project.id});});
  assert.match(editedExport.questions[0].body,/수정한 첫째/);assert.equal(editedExport.questions[1].body,'유사문제 편집 후');assert.equal(editedExport.questions[0].materialImages.length,2);
  for(const format of ['docx','pdf']){const saved=await page.evaluate(async format=>{const b=await window.exam.boot();return window.exam.exportDocument({projectId:b.project.id,format});},format);assert.ok(fs.existsSync(saved.path));}
  await page.reload();await page.locator('[data-view="original"]').click();
  const sample=page.locator('#question-'+q.id);await sample.getByRole('button',{name:'문구 수정',exact:true}).click();
  await page.locator(`[id="edit-${q.id}-body"]`).fill('∠C=∠F=90°\n△ABC와 △DEF에서 AC=DF라 하자.\n다음 중 옳은 것은?');
  await sample.getByRole('button',{name:'수정 저장',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.editor-form'));
  await page.locator('[data-figure-id="diagram"] select').selectOption('line:2');
  await page.waitForFunction(async()=>{const b=await window.exam.boot();return b.project.problems[0].original.figurePlacements?.diagram==='line:2';});
  const placement=await page.locator('.question-body').evaluate(n=>{const parts=[...n.querySelectorAll('.subquestion-part')],diagram=n.querySelector('[data-figure-id="diagram"]');return{parts:parts.length,between:!!diagram&&!!(parts[1].compareDocumentPosition(diagram)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(diagram.compareDocumentPosition(parts[2])&Node.DOCUMENT_POSITION_FOLLOWING)};});
  assert.deepEqual(placement,{parts:3,between:true});
  await page.screenshot({path:path.join(dir,'single-line-figure.png')});
  assert.equal(await app.evaluate(()=>global.__requests.length),calls);assert.deepEqual(errors,[]);
  console.log('PASS actual UI: removed chat diagnostics; source/variant wording save, cancel, restart, materials preserved, Word/PDF exports (no AI)');

  console.log('PASS actual UI: independent diagram/material pointer dragging, dropdown/chat, persisted ordering, DOCX export, one-line gap, no AI or math/approval changes: '+dir);
 }finally{clearTimeout(watchdog);await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
}
