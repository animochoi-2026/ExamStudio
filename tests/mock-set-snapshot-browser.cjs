// Real editor UI with synthetic RPC; no production calls or saved user data.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const out='artifacts/mock-set-timeout';fs.mkdirSync(out,{recursive:true});
 let fixture=fs.readFileSync('tests/fixtures/mock-design-browser.js','utf8');
 fixture=fixture.replace('window.documentFixture=doc;',"if(new URLSearchParams(location.search).has('defaults'))doc.counts.A=structuredClone(M.defaultCounts.A);window.documentFixture=doc;window.setReads=0;");
 fixture="import {enrichMockSets} from '../../web-bank/question-set-client.js';\n"+fixture;
 fixture=fixture.replace("if(name==='bank_question_sets_get'&&window.previewStall)",`if(name==='bank_question_sets_get'){window.setReads++;const scenario=new URLSearchParams(location.search).get('failure');if(scenario==='timeout'&&window.setReads===1)throw Object.assign(Error('조회 시간이 오래 걸려 중단되었습니다.'),{code:'57014',originalMessage:'canceling statement due to statement timeout'});if(scenario==='denied')throw Object.assign(Error('permission denied'),{code:'42501'});}if(name==='bank_question_sets_get'&&window.previewStall)`);
 fixture=fixture.replace('return aliases.response(name,result);',`const response=aliases.response(name,result);return name==='bank_mock_auto_candidates'?enrichMockSets({rpc:name=>({abortSignal:async()=>({data:await rpc(name)})})},{spaceId:'fixture'},response):response;`);
 const bundles=new Map([['/fixture.js',esbuild.buildSync({stdin:{contents:fixture,resolveDir:path.resolve('tests/fixtures')},bundle:true,format:'esm',write:false}).outputFiles[0].contents],['/exam-composition-worker.js',esbuild.buildSync({entryPoints:['web-bank/exam-composition-worker.js'],bundle:true,format:'esm',write:false}).outputFiles[0].contents]]);
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost').pathname;if(bundles.has(url)){res.setHeader('Content-Type','text/javascript');return res.end(bundles.get(url));}const file={'/style.css':'web-bank/style.css','/exam-workflow.css':'web-bank/exam-workflow.css','/katex.min.css':'node_modules/katex/dist/katex.min.css'}[url]||(url.startsWith('/fonts/')&&!url.includes('..')?'node_modules/katex/dist'+url:null);if(file){res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'application/octet-stream');return res.end(fs.readFileSync(file));}if(url!=='/')return res.writeHead(404).end();res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/exam-workflow.css"><link rel="stylesheet" href="/katex.min.css"><main id="view" style="max-width:1050px;margin:auto;padding:16px"></main><script type="module" src="/fixture.js"></script>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true}),checks=[],errors=[];
 let current;
 async function open(query='',width=390,touch=true){const context=await browser.newContext({viewport:{width,height:844},hasTouch:touch,isMobile:touch});const page=await context.newPage();current=page;page.on('pageerror',e=>errors.push(e.message));await page.goto(url+'/?mode=mock&'+query);await page.waitForFunction(()=>window.ready);return {context,page};}
 async function generate(page){await page.getByRole('button',{name:'미출제 2개 시험지 출제',exact:true}).click();}
 async function ready(page){await page.waitForFunction(()=>window.outputHandle?.ready()&&document.querySelector('.mock-paper-editor .mock-question-move'),{timeout:60000});const dialog=page.locator('dialog[open]');if(await dialog.count())await dialog.getByRole('button',{name:'닫기',exact:true}).click();}
 const order=page=>page.evaluate(()=>window.outputHandle.getDraft().items.map(i=>i.questionId));
 try{
  for(const scenario of ['', 'timeout','denied']){
   const {page,context}=await open('failure='+scenario);await generate(page);
   if(scenario==='denied'){
    await page.locator('.mock-progress[data-state=failed]').waitFor();assert.equal(await page.evaluate(()=>window.setReads),1);assert.equal(await page.locator('.mock-paper-editor').count(),0);
   }else{
    await ready(page);assert.equal(await page.evaluate(()=>window.setReads),scenario==='timeout'?2:1,'candidate snapshot, both stages and immediate preview share one successful registry');
    assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='bank_mock_auto_candidates').length),1,'retry must not recompose');
    assert.equal(await page.evaluate(()=>window.outputHandle.getDraft().items.length),4);
   }
   checks.push({scenario:scenario||'success',setReads:await page.evaluate(()=>window.setReads)});await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(out+'/browser.json',JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
