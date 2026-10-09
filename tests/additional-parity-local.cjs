'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const R=path.resolve(__dirname,'..'),O=path.join(R,'artifacts/additional-stability-20261009'),S=path.join(O,'browser/site'),phase=process.env.EXAM_STABILITY_PHASE||'stage1';
const {chromium}=require(process.env.EXAM_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 await require('../scripts/build-bank-web.cjs').build(path.join(R,'artifacts/stability-followup-20261009/browser/config.json'),S);
 await require('esbuild').build({entryPoints:[path.join(__dirname,'fixtures/integrated-stability-browser.js')],outfile:path.join(S,'stability-fixture.js'),bundle:true,format:'esm',platform:'browser'});
 const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/test'))return res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/katex.min.css"><div id="view"></div><script type="module" src="/stability-fixture.js"></script>');
  if(req.url.startsWith('/replay')){const form=new URL(req.url,'http://localhost').searchParams.get('form')==='standard'?'standard':'mock',p=JSON.parse(fs.readFileSync(path.join(R,'artifacts/integrated-stability-20261009/live-web',form,'replay-snapshot.json')));p.questions.forEach(q=>q.printAssets=require('../app/print-assets.cjs').printAssets(q,p.settings));res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(p));}
  const f=path.resolve(S,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(S+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.wasm')?'application/wasm':'application/octet-stream');fs.createReadStream(f).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const results=[];
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const origin='http://127.0.0.1:'+server.address().port,context=await browser.newContext({viewport:{width:1200,height:1000},acceptDownloads:true});await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());const page=await context.newPage();page.setDefaultTimeout(60000);
  for(const form of ['standard','mock','custom']){
   await page.goto(origin+'/test?real='+form+'&figure='+(process.env.EXAM_PARITY_FIGURE||'100'));await page.waitForFunction(()=>window.ready&&!document.querySelector('.exam-measure'));
   await page.getByRole('combobox',{name:'시험지 폼 선택',exact:true}).selectOption(form==='custom'?'saved:custom':'builtin:'+form);await page.waitForFunction(()=>!document.querySelector('.exam-measure'));
   const dir=path.join(O,phase+'-web23',form);fs.mkdirSync(dir,{recursive:true});
   const measured=await page.evaluate(()=>{const draft=window.draft();return {draft,pages:[...document.querySelectorAll('.exam-page:not(.answer-page)')].map(p=>({columns:[...p.querySelectorAll('.exam-column')].map(c=>[...c.querySelectorAll('.print-question')].map(q=>({id:draft.items[Number(q.dataset.index)].questionId,index:Number(q.dataset.index),height:q.offsetHeight,top:parseFloat(q.style.top),text:q.innerText})))}))};});
   assert.equal(measured.pages.flatMap(p=>p.columns.flat()).length,23);fs.writeFileSync(path.join(dir,'preview-layout.json'),JSON.stringify(measured,null,2));
   await page.locator('.exam-page:not(.answer-page)').first().screenshot({path:path.join(dir,'preview-first.png')});
   for(const format of (process.env.EXAM_PARITY_ALL_FORMATS==='1'?['DOCX','PDF','HWPX']:['DOCX'])){
    const downloading=page.waitForEvent('download',{timeout:180000});await page.getByRole('button',{name:format+' 다운로드',exact:true}).click();await page.waitForFunction(()=>/완료|실패/.test(document.querySelector('.export-progress-dialog h2')?.textContent||''),null,{timeout:180000});const status=await page.locator('.export-progress-dialog').innerText();assert.ok(!status.includes('실패'),status);await(await downloading).saveAs(path.join(dir,'exam.'+format.toLowerCase()));await page.locator('.export-progress-dialog').getByRole('button',{name:'닫기',exact:true}).click();
   }
   const request=await page.evaluate(()=>{const r=window.exportRequests[0];return {snapshot:r.snapshot,assets:r.assets.map(a=>({name:a.name,bytes:Array.from(new Uint8Array(a.bytes))}))};});for(const a of request.assets)fs.writeFileSync(path.join(dir,a.name),Buffer.from(a.bytes));
   fs.writeFileSync(path.join(dir,'snapshot.json'),JSON.stringify(request.snapshot).replaceAll('/tmp/',dir.replaceAll('\\','/')+'/'));
   results.push({form,pages:measured.pages.length,ids:measured.draft.items.map(i=>i.questionId)});console.log('PASS web23 '+form+' '+measured.pages.length+' problem pages');
  }
  fs.writeFileSync(path.join(O,phase+'-web23/results.json'),JSON.stringify(results,null,2));
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
