'use strict';
if(process.versions.electron){require('./desktop-workflow.cjs');}
else{
 const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
 const root=path.resolve(__dirname,'..'),{_electron:electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 (async()=>{
  const dir=fs.mkdtempSync(path.join(root,'data/validation/error-navigation-')),source=path.join(dir,'source.png');
  await require('sharp')({create:{width:900,height:800,channels:3,background:'white'}}).png().toFile(source);
  const app=await electron.launch({executablePath:require('electron'),args:[__filename],env:{...process.env,EXAM_DATA_DIR:dir,EXAM_TEST_SOURCE:source}});
  const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
  const boot=()=>page.evaluate(()=>window.exam.boot());
  const wait=async fn=>{for(let n=0;n<250;n++){if(await fn(await boot()))return;await new Promise(r=>setTimeout(r,40));}throw Error('completion timeout');};
  const idle=()=>page.waitForFunction(()=>document.querySelector('#cancelChat').hidden);
  const pass=s=>{checks.push(s);console.log('PASS '+s);};
  async function crop(left,right){const b=await page.locator('#selectionLayer').boundingBox();await page.mouse.move(b.x+b.width*left,b.y+b.height*.1);await page.mouse.down();await page.mouse.move(b.x+b.width*right,b.y+b.height*.55,{steps:5});await page.mouse.up();await page.locator('#confirmRegionSelection').click();}
  try{
   await page.waitForFunction(()=>document.querySelector('#aiModel').options.length===2);
   await app.evaluate(()=>{const u={text:'[원본 확인 필요] 빗금 인쇄 여부 확인',kind:'reading',location:{regionIndex:0,description:'선분 AB'}};global.__recognitionIssues=[u,{...u,text:'빗금  인쇄 여부 확인'}];});
   await page.locator('#importSource').click();await page.locator('#confirmImportScope').click();await page.locator('#collectRegions').uncheck();await page.waitForFunction(()=>!document.querySelector('#pageStage').hidden&&!document.querySelector('#zoomIn').disabled);
   await crop(.1,.6);await wait(d=>d.project.problems[0]?.recognition);await idle();assert.equal(await page.locator('#errorList .message').count(),1);pass('duplicate recognition warnings produce one numbered issue card');
   await crop(.65,.95);await wait(d=>d.project.problems[1]?.recognition);await idle();
   await page.getByRole('button',{name:'1번 문제 확인 필요 항목',exact:true}).click();await page.locator('.focused-issue').waitFor();assert.match(await page.locator('.focused-issue').innerText(),/빗금/);assert.match(await page.locator('.problem-tab.active').innerText(),/문제 1/);await page.locator('#closeDialog').click();pass('clicking another problem issue selects that problem and highlights the exact review item');
   const card=page.locator('#errorList .message').filter({has:page.getByRole('button',{name:'1번 문제 확인 필요 항목',exact:true})});await card.getByRole('button',{name:'오류 항목 삭제'}).click();await wait(d=>d.project.problems[0].recognition.uncertainties.length===0);
   const data=await boot();assert.equal(data.project.problems[0].recognition.confirmed,false);assert.equal(data.project.problems[1].recognition.uncertainties.length,1);
   await page.locator('#chatInput').fill('유사문제 만들어줘');await page.locator('#sendChat').click();await wait(d=>d.project.problems[0].variants.length===1);await idle();assert.equal(await page.locator('#mainDialog').evaluate(n=>n.open),false);pass('deletion ignores only the selected issue and permits generation without marking verification passed');
   const v=(await boot()).project.problems[0].recognition.version;await page.locator('[data-view="original"]').click();await page.locator('#retryAll').click();await page.waitForFunction(()=>!document.querySelector('#startRecognitionRetry').disabled);await page.locator('#startRecognitionRetry').click();await wait(d=>d.project.problems[0].recognition.version===v+1);await idle();assert.equal((await boot()).project.problems[0].recognition.uncertainties.length,0);assert.equal(await page.getByRole('button',{name:'1번 문제 확인 필요 항목',exact:true}).count(),0);pass('unchanged re-recognition does not resurrect an ignored issue');
   await page.evaluate(async()=>{const d=await window.exam.boot(),p=d.project.problems[0];for(let i=0;i<2;i++)await window.exam.recordError({projectId:d.project.id,problemId:p.id,text:'모의 연결 오류'});});await page.reload();await page.getByRole('button',{name:'1번 문제 오류 기록',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'1번 문제 오류 기록',exact:true}).count(),1);await page.getByRole('button',{name:'1번 문제 오류 기록',exact:true}).click();assert.match(await page.locator('#mainDialog').innerText(),/모의 연결 오류/);await page.locator('#closeDialog').click();pass('repeated execution errors are one persistent card and open their complete error detail');
   await page.screenshot({path:path.join(root,'tests/artifacts/numbered-error-navigation.png')});
   await page.locator('#clearErrors').click();await wait(d=>d.project.problems[1].recognition.uncertainties.length===0);await page.waitForFunction(()=>!document.querySelector('#errorList .message'));await page.reload();await page.waitForFunction(()=>!!document.querySelector('#chatForm[data-workflow-ready]'));assert.equal(await page.locator('#errorList .message').count(),0);pass('clear ignores displayed review items, removes logs, and stays cleared after restart');
   assert.deepEqual(errors,[]);fs.writeFileSync(path.join(root,'tests/artifacts/desktop-error-navigation.json'),JSON.stringify({ok:true,mode:'mock AI, isolated data, real Electron',checks},null,2));
  }catch(e){await page.screenshot({path:path.join(root,'tests/artifacts/error-navigation-failure.png')});throw e;}finally{await app.close();}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}

