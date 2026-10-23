'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const out=path.resolve('artifacts/exam-target-difficulty/browser');fs.mkdirSync(out,{recursive:true});
 for(const [entry,file]of [['tests/fixtures/target-average-browser.js','fixture.js'],['web-bank/exam-composition-worker.js','exam-composition-worker.js'],['web-bank/app.js','app.js']])await require('esbuild').build({entryPoints:[entry],outfile:path.join(out,file),bundle:true,format:'esm',platform:'browser',plugins:[require('../scripts/web-platform.cjs').plugin()]});
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),name=u.pathname.slice(1),files={'fixture.js':out+'/fixture.js','exam-composition-worker.js':out+'/exam-composition-worker.js','style.css':'web-bank/style.css','exam-workflow.css':'web-bank/exam-workflow.css','structured-layout.css':'app/structured-layout.css','katex.min.css':'node_modules/katex/dist/katex.min.css'};
  if(files[name]){if(!fs.existsSync(files[name]))return res.writeHead(404).end();res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/css');return res.end(fs.readFileSync(files[name]));}
  if(name)return res.writeHead(404).end();res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/exam-workflow.css"><main id="view"></main><script type="module" src="/fixture.js"></script>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
 try{for(const width of [390,1280])for(const mode of ['exam','mock']){const p=await browser.newPage({viewport:{width,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));const origin='http://127.0.0.1:'+server.address().port;await p.route('**/*',r=>r.request().url().startsWith(origin)||r.request().url().startsWith('data:')?r.continue():r.abort());await p.goto(origin+'/?mode='+mode+(mode==='exam'?'&emptyScope':''));await p.waitForFunction(()=>window.ready);p.setDefaultTimeout(30000);
  if(mode==='exam'){
   assert.equal(await p.locator('.school-picker').evaluate(el=>el.open),true);await p.waitForFunction(()=>document.querySelectorAll('.school-options input').length>20);
   assert.equal(await p.evaluate(()=>window.calls.filter(c=>c.name==='bank_exam_school_index').length),0);
   await p.getByRole('checkbox',{name:'신동중 · 범위 확인 전',exact:true}).check();await p.getByRole('checkbox',{name:'경원중 · 범위 확인 전',exact:true}).check();
   await p.locator('.school-picker>summary').click();assert.equal(await p.locator('.school-picker').evaluate(el=>el.open),false);await p.locator('.school-picker>summary').click();assert.equal(await p.locator('.school-options input:checked').count(),2);
   await p.getByLabel('학교·지역 검색',{exact:true}).fill('신동');assert.equal(await p.locator('.school-options input').count(),1);await p.getByLabel('학교·지역 검색',{exact:true}).fill('');
   await p.getByLabel('시험범위',{exact:true}).locator('details').evaluateAll(ds=>ds.forEach(d=>d.open=true));await p.getByLabel('시험범위',{exact:true}).getByRole('checkbox',{name:'삼각형의 무게중심',exact:true}).check();await p.waitForFunction(()=>document.querySelector('.school-options')?.textContent.includes('관련범위'));assert.equal(await p.locator('.school-options input:checked').count(),2);
   await p.getByLabel('시험범위',{exact:true}).getByRole('checkbox',{name:'삼각형의 무게중심',exact:true}).uncheck();await p.waitForFunction(()=>document.querySelector('.school-options')?.textContent.includes('학교를 먼저 선택'));assert.equal(await p.locator('.school-options input:checked').count(),2);
   await p.getByLabel('시험범위',{exact:true}).getByRole('checkbox',{name:'삼각형의 무게중심',exact:true}).check();await p.waitForFunction(()=>document.querySelector('.school-options')?.textContent.includes('관련범위'));assert.equal(await p.evaluate(()=>window.calls.filter(c=>c.name==='bank_exam_school_index').length),1);
   const size=await p.locator('.school-options').evaluate(el=>({max:getComputedStyle(el).maxHeight,overflow:getComputedStyle(el).overflowY,height:el.clientHeight,scroll:el.scrollHeight}));assert.equal(size.max,'none');assert(size.height>220);assert(size.scroll<=size.height+2);assert.equal(await p.locator('.school-scroll-hint').count(),0);assert.equal(await p.locator('.school-options').getByText(/신동중학교/).count(),0);assert.equal(await p.locator('.school-options label').filter({hasText:'신동중'}).count(),1);
   await p.screenshot({path:out+`/schools-${width}.png`});await p.getByRole('button',{name:'2 문항·난이도',exact:true}).click();await p.getByLabel('목표 문항 난이도 평균',{exact:true}).fill('7');
   await p.getByRole('button',{name:'시험지 구성하고 다음 단계로',exact:true}).click();const failure=p.getByRole('dialog',{name:'시험지 생성 실패'});await failure.waitFor();await failure.getByRole('button',{name:'자동채우기',exact:true}).click();
   const complete=p.getByRole('dialog',{name:'배치 완료'});await complete.waitFor();const text=await complete.innerText();assert.match(text,/학교·난이도별 구성/);assert.match(text,/신동중|경원중/);assert.match(text,/7.00점/);assert.match(text,/실제 평균 7.00점 \/ 목표 7.00점/);await p.screenshot({path:out+`/fill-${width}.png`});
   const generated=await p.evaluate(()=>window.outputHandle.getDraft());assert.equal(generated.rules.profile.driver,'target');assert.equal(generated.items.reduce((s,i)=>s+i.scoreSnapshot,0)/5,7);results.push({width,mode,average:7,schoolList:size,provenance:true});
   if(process.argv.includes('--preview')){
    await complete.getByRole('button',{name:'확인',exact:true}).click();await p.locator('.workflow-appearance').evaluate(e=>e.open=true);
    await p.evaluate(()=>{window.previewDelay=180;window.fontStorm=setInterval(()=>document.fonts.dispatchEvent(new Event('loadingdone')),80);});
    await p.getByLabel('시험지 폼 선택',{exact:true}).selectOption('builtin:modern-minimal');await p.waitForFunction(()=>window.outputHandle.ready()&&document.querySelector('.exam-viewport .exam-form-modern'),{},{timeout:5000});
    await p.evaluate(()=>{clearInterval(window.fontStorm);window.previewDelay=0;});assert.equal(await p.locator('.exam-measure').count(),0);
    await p.getByRole('button',{name:'다음 · 저장·인쇄',exact:true}).click();assert.equal(await p.locator('.workflow-stage:not([hidden])').getAttribute('data-step'),'3');await p.getByRole('button',{name:'이전 단계',exact:true}).click();
    await p.clock.install();await p.evaluate(()=>window.previewStall=true);await p.getByLabel('시험지 폼 선택',{exact:true}).selectOption('builtin:standard');await p.clock.fastForward(31000);
    await p.getByRole('button',{name:'배치 다시 시도',exact:true}).waitFor();assert.match(await p.locator('main').innerText(),/세트 정보 응답이 지연/);assert.equal(await p.evaluate(()=>window.outputHandle.ready()),false);assert.equal(await p.locator('.exam-measure').count(),0);
    await p.evaluate(()=>window.previewStall=false);await p.getByRole('button',{name:'배치 다시 시도',exact:true}).click();await p.waitForFunction(()=>window.outputHandle.ready());assert.equal(await p.getByRole('button',{name:'배치 다시 시도',exact:true}).isVisible(),false);assert.equal(await p.locator('.exam-viewport .exam-form-modern').count(),0);
    await p.getByLabel('시험지 폼 선택',{exact:true}).selectOption('builtin:modern-minimal');await p.waitForFunction(()=>window.outputHandle.ready()&&document.querySelector('.exam-viewport .exam-form-modern'));
    await p.screenshot({path:out+`/modern-recovered-${width}.png`});results.at(-1).modernSwitchAndRecovery=true;
   }

  }else{
   await p.getByLabel('목표 난이도 (점)',{exact:true}).fill('7');await p.getByLabel('목표 난이도 (점)',{exact:true}).blur();await p.getByRole('button',{name:'미출제 2개 시험지 출제',exact:true}).click();
   const complete=p.getByRole('dialog',{name:'실전모의고사 자동 구성 결과'});await complete.waitFor();assert.match(await complete.innerText(),/실제 평균 7.00점 \/ 목표 7.00점/);assert.equal(await complete.getByText('학교·난이도별 실제 구성',{exact:true}).count(),2);await p.screenshot({path:out+`/mock-${width}.png`});
   const d=await p.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.includes('bank-mock-work:')).map(k=>JSON.parse(sessionStorage.getItem(k)))[0]);assert.equal(d.profile.driver,'target');for(const v of d.variants)assert.equal(v.paper.items.reduce((s,i)=>s+i.scoreSnapshot,0)/v.paper.items.length,7);assert.equal(new Set(d.variants.flatMap(v=>v.paper.items.map(i=>i.questionId))).size,8);results.push({width,mode,averages:[7,7],unique:8});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(await p.evaluate(()=>window.errors),[]);await p.close();
 }fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));}finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
