'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const R=path.resolve(__dirname,'..'),O=path.join(R,'artifacts/output-scope-20261009/curriculum/browser'),S=path.join(R,'artifacts/output-scope-20261009/release-long/web');
(async()=>{
 fs.mkdirSync(O,{recursive:true});await require('esbuild').build({entryPoints:[path.join(R,'web-bank/exam-composition-worker.js')],outfile:path.join(O,'exam-composition-worker.js'),bundle:true,format:'esm',platform:'browser'});await require('esbuild').build({entryPoints:[path.join(R,'tests/fixtures/integrated-stability-browser.js')],outfile:path.join(O,'fixture.js'),bundle:true,format:'esm',platform:'browser'});
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost').pathname;if(u==='/test')return res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/katex.min.css"><div id="view"></div><script type="module" src="/fixture.js"></script>');const f=['/fixture.js','/exam-composition-worker.js'].includes(u)?path.join(O,u.slice(1)):path.resolve(S,'.'+u);if((!f.startsWith(S+path.sep)&&!f.startsWith(O+path.sep))||!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'application/octet-stream');fs.createReadStream(f).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  const {chromium}=require(process.env.EXAM_PLAYWRIGHT_MODULE||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
  browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1200,height:1000}}),origin='http://127.0.0.1:'+server.address().port;
  await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());const page=await context.newPage();page.setDefaultTimeout(30000);
  await page.goto(origin+'/test?count=1&scopeId=h2-algebra-2.1');await page.waitForFunction(()=>window.ready&&!document.querySelector('.exam-measure'));
  const labels=await page.getByRole('checkbox').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label')));for(const grade of ['초5','초6','고1','고2','고3'])assert.ok(labels.includes(grade),grade);
  const checks=await page.locator('.scope-tree').first().locator('input[type="checkbox"]').count();assert.ok(checks>500);
  // Exercise the actual picker; its selection is sent to the same generation model.
  const tree=page.locator('.scope-tree').first();
  for(const title of ['고2','대수','삼각함수']){const summary=tree.locator('summary').filter({has:page.getByRole('checkbox',{name:title,exact:true})}).first();await summary.click();}
  // Two nodes have the same official title: the chapter and its first leaf.
  await tree.locator('.scope-leaf').getByRole('checkbox',{name:'삼각함수',exact:true}).filter({visible:true}).check();
  const result=await page.evaluate(()=>window.generation([], {count:1,units:['h2-algebra-2.1']}));assert.equal(result.complete,false);assert.equal(result.eligible,0);assert.equal(result.shortages[0].missing,1);
  await page.getByLabel('총 문항 수',{exact:true}).fill('1');await page.getByLabel('목표 문항 난이도 평균',{exact:true}).fill('5');
  await page.getByRole('button',{name:'시험지 생성',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.generation-progress')?.getAttribute('aria-busy')==='false');
  const generated=await page.locator('.generation-progress').innerText();assert.ok(generated.includes('배치 완료'),generated);assert.ok((await page.evaluate(()=>window.draft())).rules.units.includes('h2-algebra-2.1'));
  const popup=page.locator('.generation-progress');await popup.getByRole('button',{name:'확인',exact:true}).click();
  page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'지금 서버에 저장',exact:true}).click();await page.waitForFunction(()=>window.savedExam?.document?.rules?.units?.includes('h2-algebra-2.1'));
  const before=await page.evaluate(()=>structuredClone(window.savedExam.document));await page.evaluate(()=>window.reopenSaved());
  const after=await page.evaluate(()=>window.draft());assert.deepEqual(after.rules,before.rules);assert.deepEqual(after.items.map(q=>q.questionId),before.items.map(q=>q.questionId));
  await page.screenshot({path:path.join(O,'range.png')});fs.writeFileSync(path.join(O,'result.json'),JSON.stringify({grades:5,checks,emptyCandidate:result,savedAndReopened:before.rules,operatingWrites:0},null,2));console.log('PASS actual web grade/course picker and exact empty-bank shortage');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
