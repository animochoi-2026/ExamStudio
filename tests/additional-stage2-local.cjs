'use strict';
// Isolated UI contracts for the user's explicit second-stage changes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const R=path.resolve(__dirname,'..'),O=path.join(R,'artifacts/additional-stability-20261009'),S=path.join(O,'browser/site');
const {chromium}=require(process.env.EXAM_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 await require('../scripts/build-bank-web.cjs').build(path.join(R,'artifacts/stability-followup-20261009/browser/config.json'),S);
 await require('esbuild').build({entryPoints:[path.join(__dirname,'fixtures/integrated-stability-browser.js')],outfile:path.join(S,'stability-fixture.js'),bundle:true,format:'esm',platform:'browser'});
 const server=http.createServer((req,res)=>{if(req.url.startsWith('/test'))return res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/katex.min.css"><div id="view"></div><script type="module" src="/stability-fixture.js"></script>');const f=path.resolve(S,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(S+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.wasm')?'application/wasm':'application/octet-stream');fs.createReadStream(f).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const results=[];
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const origin='http://127.0.0.1:'+server.address().port,context=await browser.newContext();await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const settle=()=>page.waitForFunction(()=>window.ready&&!document.querySelector('.exam-measure'));
  for(const mode of ['new','restored']){
   await page.goto(origin+'/test?count=8&mode='+mode);await settle();
   assert.deepEqual(await page.evaluate(()=>window.pointsPlacementFixture().map(q=>q.body)),[['1. 문제 본문 (4점)','별도 조건'],['문제 본문 (4점)','별도 조건']]);
   for(const title of ['1. 시험범위 설정','2. 조건 입력 · 자동 구성','3. 문항 직접 추가·수정'])assert.equal(await page.getByText(title,{exact:true}).count(),mode==='restored'?0:1);
   assert.equal(await page.getByRole('button',{name:'시험지 생성',exact:true}).count(),mode==='restored'?0:1);
   if(mode==='restored')assert.equal(await page.evaluate(()=>window.calls.filter(c=>['bank_search_current','bank_source_exams'].includes(c.name)).length),0);
   assert.equal(await page.getByRole('slider',{name:'그림 크기',exact:true}).inputValue(),'80');
   const before=await page.evaluate(()=>structuredClone(window.draft())),slider=page.getByRole('slider',{name:'그림 크기',exact:true});
   const measure=()=>page.evaluate(()=>{const q=document.querySelector('.exam-pages .print-question[data-index="2"]'),img=q.querySelector('img'),number=q.querySelector('.question-number');return {width:img.getBoundingClientRect().width,text:q.querySelector('.question-text').textContent,inline:number.parentElement.matches('.question-text'),font:getComputedStyle(q).fontSize};});
   const at80=await measure();assert.ok(at80.inline);assert.ok(at80.text.startsWith('3. '));
   await slider.fill('100');await slider.dispatchEvent('input');await settle();const at100=await measure();assert.ok(Math.abs(at80.width/at100.width-.8)<.005);assert.equal(at80.font,at100.font);
   await slider.fill('113');await slider.dispatchEvent('input');await settle();
   for(const form of ['builtin:mock','saved:custom','builtin:standard']){await page.getByRole('combobox',{name:'시험지 폼 선택',exact:true}).selectOption(form);await settle();assert.equal(await slider.inputValue(),'113');assert.deepEqual(await page.evaluate(()=>window.draft().items.map(q=>q.questionId)),before.items.map(q=>q.questionId));}
   page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'지금 서버에 저장',exact:true}).click();await page.waitForFunction(()=>!!window.savedExam);await page.evaluate(()=>window.reopenSaved());await settle();
   assert.equal(await page.getByRole('slider',{name:'그림 크기',exact:true}).inputValue(),'113');
   const after=await page.evaluate(()=>window.draft());assert.deepEqual(after.items.map(q=>[q.questionId,q.revisionId,q.originalNumber]),before.items.map(q=>[q.questionId,q.revisionId,q.originalNumber]));
   if(mode==='restored')assert.equal(await page.getByText('2. 조건 입력 · 자동 구성',{exact:true}).count(),0);
   results.push({mode,default80:true,explicit113Retained:true,inlineNumbers:true,orderAndMetadata:true,restoredGenerationAbsent:mode==='restored'});
  }
  const home=await page.evaluate(()=>{const sample=window.homeDifficultyFixture(),div=document.createElement('div');div.innerHTML=sample.home;const regular=document.createElement('div');regular.innerHTML=sample.regular;return {details:div.querySelectorAll('.difficulty-summary-detail').length,regularDetails:regular.querySelectorAll('.difficulty-summary-detail').length,killer:div.querySelector('.home-killer-stat strong').textContent,bands:[...div.querySelectorAll('.difficulty-count strong')].map(x=>x.textContent),legend:!!div.querySelector('.home-killer-legend')};});assert.equal(home.details,0);assert.equal(home.regularDetails,3);assert.equal(home.killer,'4');assert.ok(home.legend);assert.deepEqual(home.bands,['3','10','7','0']);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(O,'stage2-ui-contracts.json'),JSON.stringify({results,home,operatingWrites:0,phoneVerified:false},null,2));console.log('PASS restoration-only controls, unchanged source IDs/order, 80 default, explicit 113 persistence, inline numbering, home-only details');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
