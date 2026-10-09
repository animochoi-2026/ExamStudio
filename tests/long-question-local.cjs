'use strict';
// One 90-line question between two ordinary questions. Isolated print window,
// local editor, and native editable packages; no AI or operating data writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const R=path.resolve(__dirname,'..'),O=path.join(R,'artifacts/output-scope-20261009/long-question');
const python=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
if(process.versions.electron){
 const {app,BrowserWindow}=require('electron');app.setPath('userData',path.join(O,'profile'));app.on('window-all-closed',()=>{});
 app.whenReady().then(async()=>{
  const dir=path.join(O,'desktop');fs.mkdirSync(dir,{recursive:true});
  const input=path.join(dir,'snapshot.json');fs.copyFileSync(path.join(O,'source.json'),input);
  const exporter=require('../app/pdf-export.cjs'),result=await exporter.exportPdf({BrowserWindow,snapshotPath:input,directory:dir,measureOnly:true});
  assert.equal(result.snapshot.questions.length,3);assert.equal(result.report.pages.length,result.snapshot.paperFormPages.length);
  assert.ok(result.snapshot.settings.questionFragments.q2.length>=3);
  for(const format of ['docx','hwpx']){
   const r=require('node:child_process').spawnSync(python,[path.join(R,'scripts/export_'+format+'.py'),'--input',input,'--output',path.join(dir,'exam.'+format)],{encoding:'utf8',windowsHide:true,env:{...process.env,PYTHONUTF8:'1'}});
   assert.equal(r.status,0,r.stderr);console.log('PASS desktop '+format);
  }
  await exporter.exportPdf({BrowserWindow,snapshotPath:input,directory:dir,target:path.join(dir,'exam.pdf')});
  console.log('PASS desktop PDF, '+result.report.pages.length+' form pages');app.quit();
 }).catch(e=>{console.error(e);app.exit(1);});
}else (async()=>{
 fs.mkdirSync(O,{recursive:true});
 const q=(id,body)=>({id,sourceId:id,kind:'original',include:true,body,choices:[],answer:'3',solution:'한 문항의 정답과 풀이입니다.',workspaceMm:0});
 const source={title:'장문 문항 이어짐 확인',settings:{bodyFontSize:10,workspaceLines:0,showQuestionLabels:false,answerMode:'quick',paperForm:{template:'mock'},figureScalePercent:80},questions:[q('q1','앞 문항: $x+1=2$를 풀어라.'),q('q2',Array.from({length:90},(_,i)=>`조건 L${String(i+1).padStart(3,'0')}: ${i===44?'$\\frac{3}{2}+\\sqrt{4}$':'주어진 값'}을 확인하시오.`).join('\n')),q('q3','뒤 문항: $x^2=9$를 풀어라.')]};
 source.questions[1].choices=['1','2','3','4','5'];
 fs.writeFileSync(path.join(O,'source.json'),JSON.stringify(source));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 if(process.env.EXAM_REUSE_LONG_DESKTOP!=='1'){const r=require('node:child_process').spawnSync(require('electron'),[__filename],{env,windowsHide:true,encoding:'utf8',timeout:120000});console.log(r.stdout);assert.equal(r.status,0,r.stderr);}
 const S=path.join(O,'site');fs.cpSync(path.join(R,'artifacts/output-scope-20261009/release-output/web'),S,{recursive:true});
 fs.copyFileSync(path.join(R,'web-bank/style.css'),path.join(S,'style.css'));fs.appendFileSync(path.join(S,'style.css'),'\n'+require('../app/structured-layout.js').css);
 require('../scripts/export-engine.cjs').stage(path.join(S,'python'));
 await require('esbuild').build({entryPoints:[path.join(R,'tests/fixtures/integrated-stability-browser.js')],outfile:path.join(S,'fixture.js'),bundle:true,format:'esm',platform:'browser'});
 const server=require('node:http').createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost').pathname;
  if(u==='/test')return res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/katex.min.css"><div id="view"></div><script type="module" src="/fixture.js"></script>');
  if(u==='/replay'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(source));}
  const f=path.resolve(S,'.'+u);if(!f.startsWith(S+path.sep)||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.wasm')?'application/wasm':'application/octet-stream');fs.createReadStream(f).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  const {chromium}=require(process.env.EXAM_PLAYWRIGHT_MODULE||'playwright');browser=await chromium.launch({channel:'msedge',headless:true});
  const origin='http://127.0.0.1:'+server.address().port,context=await browser.newContext({viewport:{width:1200,height:1000},acceptDownloads:true});await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  const page=await context.newPage();page.setDefaultTimeout(120000);await page.goto(origin+'/test?real=mock&figure=80');await page.waitForFunction(()=>window.ready&&!document.querySelector('.exam-measure'));
  await page.getByRole('combobox',{name:'시험지 폼 선택',exact:true}).selectOption('builtin:mock');await page.waitForFunction(()=>!document.querySelector('.exam-measure'));
  const text=await page.locator('.exam-preview-shell').innerText();assert.ok(!text.includes('배치 실패'));assert.equal(await page.locator('.exam-page:not(.answer-page) .question-number').count(),3);
  const dir=path.join(O,'web');fs.mkdirSync(dir,{recursive:true});
  for(const [i,p]of (await page.locator('.exam-page:not(.answer-page)').all()).entries())await p.screenshot({path:path.join(dir,'page-'+(i+1)+'.png')});
  for(const format of ['DOCX','PDF','HWPX']){
   const downloading=page.waitForEvent('download');await page.getByRole('button',{name:format+' 다운로드',exact:true}).click();
   await page.waitForFunction(()=>/완료|실패/.test(document.querySelector('.export-progress-dialog h2')?.textContent||''));const status=await page.locator('.export-progress-dialog').innerText();assert.ok(!status.includes('실패'),status);
   await(await downloading).saveAs(path.join(dir,'exam.'+format.toLowerCase()));await page.locator('.export-progress-dialog').getByRole('button',{name:'닫기',exact:true}).click();
  }
  const request=await page.evaluate(()=>{const r=window.exportRequests[0];return{snapshot:r.snapshot,assets:r.assets.map(a=>({name:a.name,bytes:Array.from(new Uint8Array(a.bytes))}))};});
  for(const a of request.assets)fs.writeFileSync(path.join(dir,a.name),Buffer.from(a.bytes));fs.writeFileSync(path.join(dir,'snapshot.json'),JSON.stringify(request.snapshot).replaceAll('/tmp/',dir.replaceAll('\\','/')+'/'));
  const desktop=JSON.parse(fs.readFileSync(path.join(O,'desktop/snapshot.json'))),web=request.snapshot;
  assert.deepEqual(web.settings.measuredPages,desktop.settings.measuredPages);
  assert.deepEqual(web.settings.questionFragments,desktop.settings.questionFragments);
  fs.writeFileSync(path.join(O,'result.json'),JSON.stringify({sameFragments:true,pages:web.settings.measuredPages.length,originalCount:web.questions.length,formats:['web PDF','desktop PDF','DOCX','HWPX'],nativeHancomVerified:false},null,2));
  console.log('PASS web/app identical fragments, original count, one number per question, all export paths');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
