// Isolated UI fixtures only: never connects to production or generates exams.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const out=path.resolve('tests/artifacts/web-layout-audit');fs.mkdirSync(out,{recursive:true});
 const fixtures={exam:'integrated-stability-browser',mock:'mock-exam-browser',past:'past-print-browser',audit:'layout-audit-browser'};
 for(const [name,entry]of Object.entries(fixtures))await require('esbuild').build({entryPoints:['tests/fixtures/'+entry+'.js'],bundle:true,format:'esm',outfile:path.join(out,name+'.js')});
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local'),name=u.pathname.slice(1),p=name==='style.css'?'web-bank/style.css':name==='katex.css'?'node_modules/katex/dist/katex.min.css':name.startsWith('fonts/')?'node_modules/katex/dist/'+name:name.endsWith('.js')?path.join(out,name):null;
  if(p&&fs.existsSync(p)){res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(p));return;}
  res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/katex.css"><main id="view"></main><script type="module" src="/'+(fixtures[name]?name:'audit')+'.js"></script>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
 try{const page=await browser.newPage();await page.route('**/*',r=>r.request().url().startsWith(origin)||r.request().url().startsWith('data:')?r.continue():r.abort());
 const inspect=async label=>{const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>{const r=d.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scrollWidth:d.scrollWidth,clientWidth:d.clientWidth};}),overflow:[...document.querySelectorAll('main input,main select,main button,main fieldset')].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().right>innerWidth+1&&!e.closest('.exam-pages,.exam-measure,.mock-staging')).map(e=>({tag:e.tagName,text:(e.textContent||e.getAttribute('aria-label')||'').slice(0,45)}))}));results.push({label,...metrics});await page.screenshot({path:path.join(out,label+'.png'),fullPage:false});return metrics;};
 for(const width of [1280,390,320]){
  await page.setViewportSize({width,height:780});
  for(const kind of ['exam','mock','past','audit?kind=members','audit?kind=public','audit?kind=forms']){await page.goto(origin+'/'+kind);await page.waitForFunction(()=>window.ready);await inspect(kind.replace('?kind=','-')+'-'+width);
   if(kind==='mock'){await page.getByRole('button',{name:'출처 학교 선택 (필수)',exact:true}).click();await inspect('school-popup-'+width);await page.getByRole('button',{name:'학교 적용',exact:true}).click();await page.getByRole('button',{name:'시험범위 설정',exact:true}).first().click();await inspect('scope-popup-'+width);await page.getByRole('button',{name:'범위 적용',exact:true}).click();}
   if(kind==='past'){await page.evaluate(()=>window.openReplacement());await inspect('replacement-'+width);await page.keyboard.press('Escape');}
   if(kind==='audit?kind=members'){await page.getByRole('button',{name:'회원 목록 보기',exact:true}).click();await inspect('members-popup-'+width);await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();await page.evaluate(()=>{void window.openGuard();});await inspect('unsaved-popup-'+width);await page.getByRole('button',{name:'계속 편집',exact:true}).click();}
  }
 }
 fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.filter(x=>x.scrollWidth>x.width||x.overflow.length||x.dialogs.some(d=>d.x<0||d.y<0||d.height>780||d.width>x.width)),null,2));
 if(process.env.LAYOUT_ASSERT==='1'){
  assert(results.every(x=>x.scrollWidth<=x.width&&x.overflow.length===0),'UI overflow');
  await page.goto(origin+'/audit');await page.waitForFunction(()=>window.ready);
  await page.evaluate(()=>{window.failRequest=true;});await page.getByRole('button',{name:'가입 신청 새로고침'}).click();await page.getByText(/가입 신청을 불러오지 못했습니다/).waitFor();await page.evaluate(()=>{window.failRequest=false;window.hasRequest=true;});await page.getByRole('button',{name:'다시 불러오기'}).click();await page.getByRole('heading',{name:'가입 승인 대기 · 1명'}).waitFor();
  await page.evaluate(()=>{window.resetNotices();window.failRequest=true;return window.openPending();});assert.equal(await page.locator('dialog[open]').count(),1,'pending popup uses the first list even if another fetch would fail');assert.equal(await page.evaluate(()=>window.requestReads),1);
  await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();await page.evaluate(()=>{window.failRequest=false;return window.openPending();});assert.equal(await page.locator('dialog[open]').count(),0,'same pending list stays dismissed');assert.deepEqual(await page.evaluate(()=>window.errors),[]);
 }
 console.log('Layout audit completed: '+results.length+' views; synthetic data, no generation or member mutations.');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
