'use strict';
// Inspect the locally staged web bundle; no production data or network writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const R=path.resolve(__dirname,'..'),O=path.join(R,'artifacts/additional-stability-20261009'),S=path.join(O,'browser/site');
const {chromium}=require(process.env.EXAM_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 await require('esbuild').build({entryPoints:[path.join(__dirname,'fixtures/integrated-stability-browser.js')],outfile:path.join(S,'stability-fixture.js'),bundle:true,format:'esm',platform:'browser'});
 const server=http.createServer((req,res)=>{if(req.url.startsWith('/test'))return res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/katex.min.css"><div id="view"></div><script type="module" src="/stability-fixture.js"></script>');const f=path.resolve(S,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(S+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.wasm')?'application/wasm':'application/octet-stream');fs.createReadStream(f).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const results=[];
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const origin='http://127.0.0.1:'+server.address().port;const context=await browser.newContext();await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());const page=await context.newPage();
  for(const width of [1200,390])for(const mode of ['new','restored']){
   await page.setViewportSize({width,height:900});await page.goto(origin+'/test?count=8&mode='+mode+'&overlap');await page.waitForFunction(()=>window.ready&&!document.querySelector('.exam-measure'));
   const ids=await page.evaluate(()=>window.draft().items.map(q=>q.questionId));
   for(const form of ['builtin:standard','builtin:mock','saved:custom']){
    const select=page.getByRole('combobox',{name:'시험지 폼 선택',exact:true});await select.selectOption(form);await page.waitForFunction(()=>!document.querySelector('.exam-measure'));await select.focus();
    const box=await select.evaluate(s=>{const p=s.parentElement,rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};return {title:rect(p.querySelector('h4')),select:rect(s),buttons:rect(p.querySelector('.actions')),outline:getComputedStyle(s).outlineStyle};});
    assert.ok(box.title.bottom+2<=box.select.top&&box.select.bottom+2<=box.buttons.top,JSON.stringify(box));assert.notEqual(box.outline,'none');assert.deepEqual(await page.evaluate(()=>window.draft().items.map(q=>q.questionId)),ids);results.push({width,mode,form,box});
   }
  }
  await page.setViewportSize({width:1200,height:900});const title='옥정중학교 2026학년도 2학기 중간고사 실전모의고사 긴 제목 전체 표시 검증';await page.getByLabel('시험지 제목',{exact:true}).fill(title);await page.getByLabel('시험지 제목',{exact:true}).press('Tab');await page.waitForFunction(()=>!document.querySelector('.exam-measure'));
  const geometry=await page.evaluate(()=>{const p=document.querySelector('.exam-page'),t=p.querySelector('.mock-title'),l=p.querySelector('.mock-logo'),r=document.createRange();r.selectNodeContents(t);const a=t.getBoundingClientRect(),b=l.getBoundingClientRect(),text=r.getBoundingClientRect();return {title:t.textContent,font:getComputedStyle(t).fontSize,inside:text.left>=a.left-.5&&text.right<=a.right+.5,overlaps:Math.max(a.left,b.left)<Math.min(a.right,b.right)&&Math.max(a.top,b.top)<Math.min(a.bottom,b.bottom),front:Number(getComputedStyle(t).zIndex)>Number(getComputedStyle(l).zIndex)};});assert.equal(geometry.title,title);assert.ok(geometry.inside&&geometry.overlaps&&geometry.front,JSON.stringify(geometry));
  const dir=path.join(O,(process.env.EXAM_STABILITY_PHASE||'stage1')+'-form-overlap');fs.mkdirSync(dir,{recursive:true});await page.locator('.exam-page').first().screenshot({path:path.join(dir,'preview.png')});
  for(const format of ['PDF','DOCX','HWPX']){const dl=page.waitForEvent('download',{timeout:180000});await page.getByRole('button',{name:format+' 다운로드',exact:true}).click();await(await dl).saveAs(path.join(dir,'exam.'+format.toLowerCase()));await page.locator('.export-progress-dialog').getByRole('button',{name:'닫기',exact:true}).click();}
  const request=await page.evaluate(()=>{const r=window.exportRequests.at(-1);return {snapshot:r.snapshot,assets:r.assets.map(a=>({name:a.name,bytes:Array.from(new Uint8Array(a.bytes))}))};});for(const a of request.assets)fs.writeFileSync(path.join(dir,a.name),Buffer.from(a.bytes));fs.writeFileSync(path.join(dir,'snapshot.json'),JSON.stringify(request.snapshot).replaceAll('/tmp/',dir.replaceAll('\\','/')+'/'));
  fs.writeFileSync(path.join(dir,'checks.json'),JSON.stringify({results,geometry,engine:JSON.parse(fs.readFileSync(path.join(S,'python/export-engine.json')))},null,2));console.log('PASS 12 focused dropdown cases, order preservation, measured long title and overlapping logo');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
