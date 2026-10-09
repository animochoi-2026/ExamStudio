'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),dir=path.resolve(process.env.EXAM_STABILITY_OUTPUT||path.join(root,'artifacts/integrated-stability-20261009')),site=path.join(dir,'browser/site'),out=path.join(dir,'matrix');
const {chromium}=require(process.env.EXAM_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 await require('../scripts/build-bank-web.cjs').build(path.join(dir,'browser/config.json'),site);
 await require('esbuild').build({entryPoints:[path.join(__dirname,'fixtures/integrated-stability-browser.js')],outfile:path.join(site,'stability-fixture.js'),bundle:true,format:'esm',platform:'browser',target:['chrome110']});
 const server=http.createServer((req,res)=>{if(req.url.startsWith('/test')){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/katex.min.css"><div id="view"></div><script type="module" src="/stability-fixture.js"></script>');}const f=path.resolve(site,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(site+path.sep)||!fs.existsSync(f)){res.writeHead(404).end();return;}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.wasm')?'application/wasm':f.endsWith('.css')?'text/css':'application/octet-stream');fs.createReadStream(f).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const results=[];
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const origin='http://127.0.0.1:'+server.address().port;
  const context=await browser.newContext({viewport:{width:1300,height:1000},acceptDownloads:true});await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  const page=await context.newPage();page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const open=async query=>{await page.goto(origin+'/test'+query);await page.waitForFunction(()=>window.ready);};
  for(const mode of ['new','restored'])for(const form of ['standard','mock','custom']){
   await page.evaluate(()=>sessionStorage.clear()).catch(()=>{});await open('?mode='+mode);
   const before=await page.evaluate(()=>window.draft());
   await page.getByRole('combobox',{name:'시험지 폼 선택',exact:true}).selectOption(form==='custom'?'saved:custom':'builtin:'+form);
   await page.waitForFunction(()=>document.querySelectorAll('.print-question').length===8&&!document.querySelector('.exam-measure'));
   const title=form==='standard'?'배치 검증 시험지':'옥정중학교 중학교 2학년 2026학년도 2학기 중간고사 실전모의고사 수학 전체 범위 확인';
   await page.getByLabel('시험지 제목',{exact:true}).fill(title);await page.getByLabel('시험지 제목',{exact:true}).blur();
   await page.waitForFunction(()=>!document.querySelector('.exam-measure'));
   const after=await page.evaluate(()=>window.draft());assert.deepEqual(after.items.map(i=>i.questionId),before.items.map(i=>i.questionId));
   const measure=await page.locator('.exam-page:not(.answer-page)').evaluateAll(pages=>pages.map(p=>({nameFields:p.querySelectorAll('.mock-student-fields,.exam-name-line').length,cols:[...p.querySelectorAll('.exam-column')].map(c=>({height:c.clientHeight,questions:[...c.querySelectorAll('.print-question')].map(q=>({index:q.dataset.index,top:parseFloat(q.style.top),height:q.getBoundingClientRect().height}))})),titles:[...p.querySelectorAll('.mock-title')].map(t=>{const s=getComputedStyle(t),r=document.createRange();r.selectNodeContents(t);return {font:parseFloat(s.fontSize),text:t.textContent,width:t.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),textWidth:r.getBoundingClientRect().width/(t.getBoundingClientRect().width/t.offsetWidth)};})})));
   assert.equal(measure.length,2,JSON.stringify(measure));assert.equal(measure[0].nameFields,1);assert.equal(measure[1].nameFields,0);
   for(const p of measure){assert.deepEqual(p.cols.map(c=>c.questions.length),[2,2]);for(const t of p.titles)assert.ok(t.textWidth<=t.width+.2,JSON.stringify(t));}
   const answerTitles=await page.locator('.exam-answer-title').evaluateAll(nodes=>nodes.map(t=>{const r=document.createRange();r.selectNodeContents(t);const scale=t.getBoundingClientRect().width/t.offsetWidth;return {width:t.clientWidth,textWidth:r.getBoundingClientRect().width/scale,font:parseFloat(getComputedStyle(t).fontSize),whiteSpace:getComputedStyle(t).whiteSpace};}));
   assert.ok(answerTitles.length);for(const t of answerTitles){assert.equal(t.whiteSpace,'nowrap');assert.ok(t.textWidth<=t.width+.2,JSON.stringify(t));assert.ok(t.font<=13*96/72+.1);}
   const name=mode+'-'+form,caseDir=path.join(out,name);fs.mkdirSync(caseDir,{recursive:true});
   await page.locator('.exam-pages').screenshot({path:path.join(caseDir,'preview.png')});
   for(const format of ['DOCX','PDF','HWPX']){
    const waiting=page.waitForEvent('download',{timeout:180000}).catch(()=>null);await page.getByRole('button',{name:format+' 다운로드',exact:true}).click();
    await page.waitForFunction(()=>/완료|실패/.test(document.querySelector('.export-progress-dialog h2')?.textContent||''),null,{timeout:180000});
    const status=await page.locator('.export-progress-dialog').innerText();assert.ok(!status.includes('실패'),status);const download=await waiting;assert.ok(download,status);await download.saveAs(path.join(caseDir,'exam.'+format.toLowerCase()));
    await page.locator('.export-progress-dialog').getByRole('button',{name:'닫기',exact:true}).click();
   }
   const requests=await page.evaluate(()=>window.exportRequests.map(r=>({snapshot:r.snapshot,assets:r.assets.map(a=>({name:a.name,bytes:Array.from(new Uint8Array(a.bytes))}))})));
   for(const a of requests[0].assets)fs.writeFileSync(path.join(caseDir,a.name),Buffer.from(a.bytes));
   fs.writeFileSync(path.join(caseDir,'snapshot.json'),JSON.stringify(requests[0].snapshot).replaceAll('/tmp/',caseDir.replaceAll('\\','/')+'/'));
   results.push({name,measure,files:['docx','pdf','hwpx'],orderPreserved:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors,aiCalls:0,remoteWrites:0},null,2));console.log('PASS '+name+' preview and 3 downloads');
  }
  for(const query of ['?count=4','?large&mode=restored']){
   await page.evaluate(()=>sessionStorage.clear());await open(query);
   for(const form of ['builtin:standard','builtin:mock','saved:custom']){
    await page.getByRole('combobox',{name:'시험지 폼 선택',exact:true}).selectOption(form);
    await page.waitForFunction(()=>!document.querySelector('.exam-measure')&&document.querySelectorAll('.print-question').length===window.draft().items.length);
    const ids=await page.locator('.print-question').evaluateAll(q=>q.map(e=>Number(e.dataset.index)));
    assert.deepEqual(ids,Array.from({length:query.includes('count')?4:8},(_,i)=>i));
    assert.ok((await page.locator('.exam-column').evaluateAll(cols=>cols.every(c=>c.querySelectorAll('.print-question').length<=2))));
    if(query.includes('count'))assert.equal(await page.locator('.exam-page:not(.answer-page)').count(),1);
    if(form==='saved:custom')assert.equal(await page.getByLabel('배점 안내 문구',{exact:true}).inputValue(),'사용자 배점');
   }
   console.log('PASS one-page/large question form changes '+query);
  }
  await page.evaluate(()=>sessionStorage.clear());await open('?count=24&mode=restored');await page.setViewportSize({width:390,height:844});
  await page.getByRole('combobox',{name:'시험지 폼 선택',exact:true}).selectOption('builtin:mock');await page.waitForFunction(()=>!document.querySelector('.exam-measure'));
  let downloads=0,navigations=0;page.on('download',()=>downloads++);page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  const mobileDownload=page.waitForEvent('download',{timeout:180000});await page.getByRole('button',{name:'PDF 다운로드',exact:true}).click();
  await (await mobileDownload).saveAs(path.join(out,'mobile-sized-24-questions.pdf'));assert.equal(downloads,1);assert.equal(navigations,0);await page.locator('.export-progress-dialog').getByRole('button',{name:'닫기',exact:true}).click();
  await page.evaluate(()=>sessionStorage.clear());await open('?count=4');navigations=0;
  await page.route('**/katex.min.css',route=>route.fulfill({status:503,body:'synthetic unavailable'}));
  await page.getByRole('button',{name:'PDF 다운로드',exact:true}).click();await page.waitForFunction(()=>/실패/.test(document.querySelector('.export-progress-dialog h2')?.textContent||''));
  assert.match(await page.locator('.export-progress-dialog').innerText(),/수식 스타일.*503/);assert.equal(navigations,0);assert.equal(downloads,1);
  await page.locator('.export-progress-dialog').getByRole('button',{name:'닫기',exact:true}).click();await page.unroute('**/katex.min.css');console.log('PASS mobile-sized 24-question PDF and resource failure without reload');
  await open('?delete');let prompts=0;page.on('dialog',async d=>{prompts++;await d.dismiss();});await page.getByRole('button',{name:'시험지 실제 삭제',exact:true}).click();assert.equal(await page.locator('dialog input').count(),0);await page.getByRole('button',{name:'삭제',exact:true}).click();assert.equal(prompts,0);assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='bank_exam_delete').length),1);
  assert.deepEqual(errors,[]);console.log('PASS delete confirmation without text prompt');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
