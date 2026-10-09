'use strict';
if(process.versions.electron){require('./desktop-workflow.cjs');}else{
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),{_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const dir=fs.mkdtempSync(path.join(root,'data/validation/center-override-')),source=path.join(dir,'source.png');
 fs.writeFileSync(path.join(dir,'gemini-access.json'),JSON.stringify({version:1,status:'subscribed',source:'user_setting'}));
 await require('sharp')({create:{width:900,height:800,channels:3,background:'white'}}).png().toFile(source);
 const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env:{...process.env,EXAM_DATA_DIR:dir,EXAM_TEST_SOURCE:source}});
 const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const boot=()=>page.evaluate(()=>window.exam.boot());
 const wait=async fn=>{for(let n=0;n<250;n++){if(await fn(await boot()))return;await new Promise(r=>setTimeout(r,40));}throw Error('completion timeout');};
 const idle=()=>page.waitForFunction(()=>document.querySelector('#cancelChat').hidden);
 try{
  await page.waitForFunction(()=>document.querySelector('#aiModel').options.length===2);
  await page.locator('#geminiTab').click();await page.waitForFunction(()=>document.querySelector('#geminiModel').options.length>0);
  await app.evaluate(()=>global.__recognitionIssues=[{text:'내심 근사 좌표 불일치',kind:'mathematical',location:{regionIndex:0,description:'점 I'}}]);
  await page.locator('#importSource').click();await page.locator('#confirmImportScope').click();await page.locator('#collectRegions').uncheck();await page.waitForFunction(()=>!document.querySelector('#pageStage').hidden&&!document.querySelector('#zoomIn').disabled);
  const b=await page.locator('#selectionLayer').boundingBox();await page.mouse.move(b.x+b.width*.1,b.y+b.height*.1);await page.mouse.down();await page.mouse.move(b.x+b.width*.8,b.y+b.height*.7,{steps:5});await page.mouse.up();await page.locator('#confirmRegionSelection').click();
  await wait(d=>d.project.problems[0]?.recognition);await idle();assert.match(await page.locator('#errorList').innerText(),/내심 근사 좌표/);
  assert.equal(await app.evaluate(()=>global.__requests.at(-1).testProvider),'gemini');console.log('PASS Gemini recognition warning appears in numbered error panel');
  await page.locator('[data-view="original"]').click();assert.ok(await page.locator('.geometry-point').count()>0);
  await page.locator('[data-view="chat"]').click();await page.locator('#chatInput').fill('유사문제 만들어줘');await page.locator('#sendChat').click();await page.locator('#generateIgnoringErrors').waitFor();
  const before=(await boot()).project.problems[0].recognition;await page.getByRole('button',{name:'취소',exact:true}).click();assert.equal((await boot()).project.problems[0].variants.length,0);console.log('PASS cancelling popup sends no generation request');
  await page.locator('#sendChat').click();await page.locator('#generateIgnoringErrors').click();await wait(d=>d.project.problems[0].variants.length===1);await idle();assert.deepEqual((await boot()).project.problems[0].recognition,before);console.log('PASS explicit override generates with Gemini and preserves source warnings');
  await app.evaluate(()=>{global.__failNext=true;global.__failureText='Gemini 모의 연결 오류';});
  await page.locator('#chatInput').fill('새 문제 생성');await page.locator('#sendChat').click();await page.locator('#generateIgnoringErrors').click();await wait(d=>d.project.problems[0].runs.at(-1).status==='failed');await idle();
  await page.locator('#errorList').getByText('Gemini 모의 연결 오류',{exact:true}).waitFor();assert.equal(fs.existsSync(path.join(dir,'error-log.json')),true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'error-log.json'),'utf8')).filter(e=>e.text==='Gemini 모의 연결 오류').length,1);console.log('PASS Gemini transport error persists once and appears immediately');
  await page.locator('#codexTab').click();await page.locator('#chatInput').fill('다시 생성');await page.locator('#sendChat').click();await page.locator('#generateIgnoringErrors').click();await wait(d=>d.project.problems[0].variants.length===2);await idle();assert.equal(await app.evaluate(()=>global.__requests.at(-1).testProvider),'codex');console.log('PASS GPT generation continues after previous Gemini failure');
  await page.reload();await page.waitForFunction(()=>!!document.querySelector('#chatForm[data-workflow-ready]'));assert.equal(await page.locator('#errorList').getByText('Gemini 모의 연결 오류',{exact:true}).count(),0);assert.ok(JSON.parse(fs.readFileSync(path.join(dir,'error-log-resolved.json'),'utf8')).some(e=>e.text==='Gemini 모의 연결 오류'));console.log('PASS successful retry archives the resolved failure across reload');
  await page.screenshot({path:path.join(root,'tests/artifacts/center-generation-override.png')});assert.deepEqual(errors,[]);
 }catch(e){await page.screenshot({path:path.join(root,'tests/artifacts/center-override-failure.png')});throw e;}finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});}
