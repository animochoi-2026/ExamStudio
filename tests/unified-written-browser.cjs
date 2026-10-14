const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{replacementFixture}=require('./replacement-stages-fixture.cjs');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{const x=await replacementFixture(),out=path.resolve('artifacts/unified-written/browser');fs.mkdirSync(out,{recursive:true});await require('esbuild').build({entryPoints:['tests/fixtures/unified-written-browser.js'],bundle:true,format:'esm',outfile:path.join(out,'fixture.js')});await require('esbuild').build({entryPoints:['web-bank/exam-composition-worker.js'],bundle:true,format:'esm',outfile:path.join(out,'exam-composition-worker.js')});let chain=Promise.resolve();const requests=[];
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://local');
 if(url.pathname==='/fixture'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({questions:x.questions,rules:x.rules,S:x.S,A:x.A}));return;}
 if(url.pathname==='/rpc'){let text='';for await(const c of req)text+=c;const p=JSON.parse(text);if(!['bank_replacement_candidates','bank_mock_check'].includes(p.name))throw Error('RPC denied');const result=chain.then(()=>x.rpc(x.A,p.name,p.args));chain=result.catch(()=>{});const v=await result;requests.push({name:p.name,stage:p.args.stage,page:p.args.page,candidate:!!p.args.candidate,count:v.items?.length});res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));return;}
 let file=url.pathname==='/exam-composition-worker.js'?path.join(out,'exam-composition-worker.js'):url.pathname==='/exam-workflow.css'?'web-bank/exam-workflow.css':url.pathname==='/fixture.js'?path.join(out,'fixture.js'):url.pathname==='/style.css'?'web-bank/style.css':url.pathname==='/katex.min.css'?'node_modules/katex/dist/katex.min.css':url.pathname.startsWith('/fonts/')?'node_modules/katex/dist'+url.pathname:null;
 if(file){res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));return;}
 res.setHeader('Content-Type','text/html;charset=utf8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/exam-workflow.css"><link rel="stylesheet" href="/katex.min.css"><p id="status"></p><main id="view"></main><nav class="bottom-nav">홈 · 문항찾기 · 시험지</nav><script type="module" src="/fixture.js"></script>');
}catch(e){res.statusCode=400;res.end(JSON.stringify({message:e.message,code:e.code}));}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});const results=[];
try{for(const width of [1280,390])for(const mode of ['ordinary-success','ordinary-shortage','mock-shortage','ordinary-apply','mock-apply']){
 const p=await browser.newPage({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390});p.on('pageerror',e=>console.error('PAGE',e.message));await p.goto('http://127.0.0.1:'+server.address().port+'/?mode='+mode);await p.waitForFunction(()=>window.ready);
 if(mode.startsWith('ordinary')){
  await p.getByRole('button',{name:'2 문항·난이도',exact:true}).click();
  assert.equal(await p.getByText('단답형 개수 (빈칸: 자동)',{exact:true}).count(),0);
  if(mode==='ordinary-success')assert.equal(await p.locator('label').filter({hasText:'서술형 개수 (빈칸: 자동)'}).locator('input').inputValue(),'5');
  await p.getByRole('button',{name:'시험지 구성하고 다음 단계로',exact:true}).click();
 }else{
  assert.equal(await p.getByText('주관식(단답형)',{exact:true}).count(),0);
  await p.getByRole('button',{name:/미출제 2개 시험지 출제/}).click();
 }
 if(mode==='ordinary-success'){
  await p.getByText(/25문항의 선택·데이터 로딩·미리보기 배치와 정답 연결/).waitFor({timeout:30000});results.push({mode,width,written:5,choice:20,generated:true});
 }else{
  await p.locator('dialog[open]').getByRole('button',{name:'지정 학교 후보에서 보충',exact:true}).click();const d=p.getByRole('dialog',{name:'출제 후보 선택'});await d.locator('.replacement-preferred .replacement-candidate').first().waitFor();
  assert.equal(await p.evaluate(()=>window.requests.filter(r=>r.args.stage==='other_schools').length),0);const preferred=await d.locator('.replacement-preferred .replacement-candidate').count();assert.equal(preferred,mode.startsWith('ordinary')?47:49);
  await d.getByRole('button',{name:'타학교 문제까지 확대',exact:true}).click();await d.getByLabel('타학교에서 보충할 세부 단원').selectOption('m2-8.7');await d.locator('.replacement-other .replacement-candidate').first().waitFor();assert.equal(await d.locator('.replacement-other .replacement-candidate').count(),20);
  if(mode.endsWith('apply')){for(let i=0;i<11;i++)await d.locator('.replacement-other input[type=checkbox]').nth(i).check();await d.getByRole('button',{name:'선택 11문항으로 다시 구성',exact:true}).click();await d.waitFor({state:'detached',timeout:60000}).catch(async e=>{fs.writeFileSync(path.join(out,'apply-failed.txt'),await p.locator('body').innerText());throw e;});if(mode.startsWith('ordinary'))await p.getByText(/60문항의 선택·데이터 로딩·미리보기 배치와 정답 연결/).waitFor({timeout:30000});else {const docs=await p.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.includes('bank-mock-work:')).map(k=>JSON.parse(sessionStorage.getItem(k))));assert.equal(docs.length,1);assert.deepEqual(docs[0].variants.map(v=>v.paper?.items.length),[60,60]);}results.push({mode,width,selected:11,applied:true});await p.close();continue;}
  await d.getByRole('button',{name:'다음 20문제',exact:true}).click();await d.getByText('2 / 3 페이지',{exact:true}).waitFor();assert.equal(await d.locator('.replacement-other .replacement-candidate').count(),20);
  await d.getByRole('button',{name:'다음 20문제',exact:true}).click();await d.getByText('3 / 3 페이지 · 마지막 목록',{exact:true}).waitFor();assert.equal(await d.locator('.replacement-other .replacement-candidate').count(),5);
  await d.locator('.replacement-other input[type=checkbox]').first().check();await p.screenshot({path:path.join(out,mode+'-'+width+'.png')});await d.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await p.evaluate(()=>!!window.saved),false);
  results.push({mode,width,preferred,other:[20,20,5],cancelPreserved:true});
 }
 await p.close();}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,requests},null,2));console.log(JSON.stringify(results));
}finally{await browser.close();server.close();await x.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
