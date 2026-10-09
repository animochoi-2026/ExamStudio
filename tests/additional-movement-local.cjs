'use strict';
// Local browser only; fake bank has no external writes or AI calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/additional-stability-20261009'),site=path.join(out,'browser/site');
const {chromium}=require(process.env.EXAM_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 if(process.env.EXAM_MOVEMENT_STAGED_SITE!=='1')await require('../scripts/build-bank-web.cjs').build(path.join(root,'artifacts/stability-followup-20261009/browser/config.json'),site);
 else console.log('DIAGNOSTIC existing staged engine '+JSON.parse(fs.readFileSync(path.join(site,'python/export-engine.json'))).engineId);
 await require('esbuild').build({entryPoints:[path.join(__dirname,'fixtures/integrated-stability-browser.js')],outfile:path.join(site,'stability-fixture.js'),bundle:true,format:'esm',platform:'browser'});
 const server=http.createServer((req,res)=>{if(req.url.startsWith('/test'))return res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/katex.min.css"><div id="view"></div><script type="module" src="/stability-fixture.js"></script>');const f=path.resolve(site,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(site+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.wasm')?'application/wasm':'application/octet-stream');fs.createReadStream(f).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const results=[];
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const origin='http://127.0.0.1:'+server.address().port;
  const context=await browser.newContext({viewport:{width:1100,height:1000},hasTouch:true});await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['warning','error'].includes(m.type()))console.log('BROWSER '+m.type()+': '+m.text());});page.on('requestfailed',r=>console.log('REQUEST FAILED '+r.url()+' '+r.failure()?.errorText));
  const settle=()=>page.waitForFunction(()=>window.ready&&!document.querySelector('.exam-measure'));
  const inspect=()=>page.evaluate(()=>({draft:window.draft(),visible:[...document.querySelectorAll('.exam-page:not(.answer-page) .print-question')].map(q=>({index:Number(q.dataset.index),text:q.innerText,page:Number(q.closest('.exam-column').dataset.page),column:Number(q.closest('.exam-column').dataset.column),top:parseFloat(q.style.top),height:q.offsetHeight})),status:[...document.querySelectorAll('#view>.hint')].map(x=>x.textContent)}));
  for(const form of ['standard','mock','custom'])for(const mode of ['new','restored']){
   await page.goto(origin+'/test?count=16&mode='+mode);await settle();
   await page.getByRole('combobox',{name:'시험지 폼 선택',exact:true}).selectOption(form==='custom'?'saved:custom':'builtin:'+form);await settle();
   const original=await inspect();
   for(const [from,to,kind]of [[0,1,'question'],[0,5,'question'],[8,1,'question'],[0,13,'question'],[15,0,'question'],[0,12,'column'],[14,0,'column'],[0,6,'pointer'],[11,0,'pointer']]){
    const before=await inspect();
    await page.evaluate(({from,to,kind})=>{
     const src=document.querySelector('.print-question[data-index="'+from+'"]'),dest=document.querySelector('.print-question[data-index="'+to+'"]');
     if(kind==='pointer'){
      const handle=src.querySelector('.drag-handle'),viewport=document.querySelector('.exam-viewport');dest.scrollIntoView({block:'center'});
      const r=dest.getBoundingClientRect();handle.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,clientX:r.left+5,clientY:r.top+5}));
     }else{const dataTransfer=new DataTransfer();dataTransfer.setData('text/plain',String(from));(kind==='column'?dest.closest('.exam-column'):dest).dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));}
    },{from,to,kind});await settle();
    const after=await inspect();results.push({form,mode,from,to,kind,before:before.draft.items.map(q=>q.questionId),after});
    fs.writeFileSync(path.join(out,'movement-current.json'),JSON.stringify({results,errors},null,2));
    assert.deepEqual(after.draft.items.map(q=>q.questionId).sort(),original.draft.items.map(q=>q.questionId).sort());
    assert.equal(after.visible.length,16,JSON.stringify(after.status));assert.equal(new Set(after.visible.map(q=>q.index)).size,16);
    for(const q of after.visible){const id=after.draft.items[q.index].questionId;assert.ok(q.text.includes('Q'+(Number(id.slice(1))+1)+'.'),q.text);}
    const moved=before.draft.items[from].questionId;assert.notDeepEqual(after.draft.items.map(q=>q.questionId),before.draft.items.map(q=>q.questionId),JSON.stringify({form,mode,from,to,kind,moved}));
   }
   await page.reload();await settle();const reopened=await inspect();assert.equal(reopened.visible.length,16);console.log('PASS movement and local reopen '+mode+' '+form);
  }
  // Two drops before the delayed first render completes still refer to the
  // identities visible when each gesture began, never a shifted draft index.
  const rapidBefore=await inspect(),rapidIds=rapidBefore.draft.items.map(q=>q.questionId),rapidExpected=rapidIds.slice();
  for(const [from,to]of [[0,12],[1,10]]){const a=rapidExpected.indexOf(rapidIds[from]),b=rapidExpected.indexOf(rapidIds[to]);rapidExpected.splice(b,0,rapidExpected.splice(a,1)[0]);}
  await page.evaluate(()=>{window.readerDelay=15;for(const [from,to]of [[0,12],[1,10]]){const dataTransfer=new DataTransfer();dataTransfer.setData('text/plain',String(from));document.querySelector('.print-question[data-index="'+to+'"]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));}});
  await page.waitForFunction(ids=>JSON.stringify(window.draft()?.items.map(q=>q.questionId))===JSON.stringify(ids)&&!document.querySelector('.exam-measure'),rapidExpected);assert.equal((await inspect()).visible.length,16);await page.evaluate(()=>window.readerDelay=0);
  await page.setViewportSize({width:390,height:844});
  const cdp=await context.newCDPSession(page);
  for(const zoom of [25,45,80]){
   await page.getByLabel('미리보기 확대 (%)',{exact:true}).fill(String(zoom));
   for(const [from,to]of [[0,6],[12,1]]){
    const before=await inspect();
    const src=page.locator('.print-question[data-index="'+from+'"] .drag-handle');await src.scrollIntoViewIfNeeded();const a=await src.boundingBox();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2,id:1}]});
    await page.locator('.print-question[data-index="'+to+'"]').scrollIntoViewIfNeeded();const b=await page.locator('.print-question[data-index="'+to+'"]').boundingBox();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+5,y:b.y+5,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();const after=await inspect();
    assert.equal(after.visible.length,16);assert.deepEqual(after.draft.items.map(q=>q.questionId).sort(),before.draft.items.map(q=>q.questionId).sort());assert.notDeepEqual(after.draft.items,before.draft.items,'touch gesture must move the selected question');
    results.push({kind:'emulated-touch',zoom,from,to,after});
   }
  }
  fs.writeFileSync(path.join(out,'movement-current.json'),JSON.stringify({results,errors,rapidExpected},null,2));console.log('PASS overlapping moves and 6 emulated touch drags at 3 zoom levels');
  const beforeFailure=await inspect();
  await page.evaluate(()=>{window.readerFailure='r5';const dataTransfer=new DataTransfer();dataTransfer.setData('text/plain','0');document.querySelector('.print-question[data-index="12"]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));});
  await settle();const failure=await inspect();fs.writeFileSync(path.join(out,'movement-failure-current.json'),JSON.stringify({beforeFailure,failure},null,2));
  assert.equal(failure.visible.length,16,'a failed cross-page move must keep the original preview');
  assert.deepEqual(failure.draft.items,beforeFailure.draft.items,'a failed move must keep the original order and metadata');
  await page.evaluate(()=>window.readerFailure=null);page.on('dialog',d=>d.accept());console.log('START isolated save');
  await page.getByRole('button',{name:'지금 서버에 저장',exact:true}).click();await page.waitForFunction(()=>window.savedExam);
  const saved=await page.evaluate(()=>window.savedExam);assert.deepEqual(saved.document.items,failure.draft.items);assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='bank_exam_save').length),1);console.log('START saved reopen');
  await page.evaluate(()=>window.reopenSaved());await settle();const savedReopened=await inspect();assert.deepEqual(savedReopened.draft.items,saved.document.items);assert.equal(savedReopened.visible.length,16);
  for(const format of ['DOCX','PDF','HWPX']){
  console.log('START saved export '+format);const download=page.waitForEvent('download',{timeout:180000}).catch(()=>null);await page.getByRole('button',{name:format+' 다운로드',exact:true}).click();console.log('CLICKED saved export '+format);
  try{await page.waitForFunction(()=>/완료|실패/.test(document.querySelector('.export-progress-dialog h2')?.textContent||''),null,{timeout:60000});}finally{fs.writeFileSync(path.join(out,'movement-export-status.txt'),JSON.stringify(await page.evaluate(()=>({dialogs:[...document.querySelectorAll('dialog')].map(d=>d.innerText),messages:window.messages,requests:window.exportRequests.length})),null,2));}const exportStatus=await page.locator('.export-progress-dialog').innerText();assert.ok(!exportStatus.includes('실패'),exportStatus);
  const file=await download;assert.ok(file);await file.saveAs(path.join(out,'movement-after-reopen.'+format.toLowerCase()));
  const exported=await page.evaluate(()=>window.exportRequests.at(-1).snapshot);assert.deepEqual(exported.questions.map(q=>q.id),saved.document.items.map(q=>q.questionId));
  fs.writeFileSync(path.join(out,'movement-save-export.json'),JSON.stringify({saved,reopened:savedReopened,exportedIds:exported.questions.map(q=>q.id),formatsCompleted:['DOCX','PDF','HWPX'].slice(0,['DOCX','PDF','HWPX'].indexOf(format)+1),isolatedFakeRpc:true},null,2));console.log('PASS one isolated save, reopen, and '+format+' order preservation');
  await page.locator('.export-progress-dialog').getByRole('button',{name:'닫기',exact:true}).click();
  }
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
