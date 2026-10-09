// Read-only local replay of the real upload bytes. No external connections.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'tmp/compound-web-review');
async function run(){
 const bytes=fs.readFileSync(path.join(dir,'uploaded-bundle.json')),bundle=JSON.parse(bytes),complete=JSON.parse(fs.readFileSync(path.join(fs.readFileSync(path.join(dir,'upload-directory.txt'),'utf8'),'complete.json')));
 const config=path.join(dir,'test-public-config.json');fs.writeFileSync(config,JSON.stringify({url:'https://fixture.supabase.co',publishableKey:'sb_publishable_fixture',spaceId:'11111111-1111-4111-8111-111111111111'}));
 // Build the same release assets in a separate local directory, never web-bank/dist.
 const site=process.env.WEB_COMPOUND_SITE?path.resolve(process.env.WEB_COMPOUND_SITE):await require('../scripts/build-bank-web.cjs').build(config,path.join(dir,'site'));
 const fixture={bundle,complete,bytes:[...bytes],sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 const entry=path.join(dir,'browser-entry.js');fs.writeFileSync(entry,`
 import {createQuestionReader} from '../../web-bank/question-renderer.js';
 import {exportDocx} from '../../web-bank/web-export.js';
 const fixture=await(await fetch('/fixture.json')).json(),id=fixture.bundle.revisionId;
 const client={from:table=>({select:()=>({eq:()=>({single:async()=>({data:table==='bank_catalog'?{revision_id:id,question_id:fixture.bundle.questionId,files:fixture.complete.files,metadata:fixture.bundle.metadata}:{verified:true,size:fixture.bytes.length,chunks:1,sha256:fixture.sha256}})})})}),storage:{from:()=>({download:async()=>({data:new Blob([new Uint8Array(fixture.bytes)])})})}};
 const reader=createQuestionReader(client,{spaceId:'fixture-space'}),rendered=await reader.render(id);document.body.append(rendered.element);
 window.test={rendered,reader,async docx(points=false){const draft={title:points?'original-score':'normal-proof',items:[{questionId:fixture.bundle.questionId,originalPoints:4}],showOriginalPoints:points,answerMode:'quick'};await exportDocx({draft,loaded:[rendered],layout:{pages:[{columns:[[{questionId:fixture.bundle.questionId}],[]]}]},status:document.createElement('p')});}};
 window.ready=true;
 `);
 await require('esbuild').build({entryPoints:[entry],outfile:path.join(site,'fixture.js'),bundle:true,format:'esm',platform:'browser',target:['chrome110']});
 const csp=fs.readFileSync(path.join(site,'_headers'),'utf8').split('Content-Security-Policy: ')[1].split('\n')[0].trim();fs.writeFileSync(path.join(site,'fixture.css'),'body{margin:0;background:white}.native-question{padding:12px;font-size:12pt;box-sizing:border-box;max-width:100%}.native-question img{max-width:100%}');
 const requests=[];const server=http.createServer((req,res)=>{res.setHeader('Content-Security-Policy',csp);requests.push(req.url);if(req.url==='/fixture.json'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(fixture));}if(req.url==='/test'){res.setHeader('content-type','text/html');return res.end('<!doctype html><meta charset="utf-8"><div id="view"></div><link rel="stylesheet" href="/katex.min.css"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/fixture.css"><script type="module" src="/fixture.js"></script>');}const file=path.resolve(site,'.'+req.url);if(!file.startsWith(site+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('content-type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.whl')?'application/octet-stream':'application/octet-stream');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;try{
  const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/test');await page.waitForFunction(()=>window.ready,{timeout:30000});await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
  const results=[];for(const width of [360,390,768]){
   await page.setViewportSize({width,height:1100});const result=await page.evaluate(()=>{const root=window.test.rendered.element;return{width:innerWidth,box:root.querySelectorAll('.structure-box').length,figures:root.querySelectorAll('.structure-figure img').length,blanks:root.querySelectorAll('.structure-blank').length,reasons:[...root.querySelectorAll('.structure-reason')].map(x=>x.textContent),score:root.textContent.includes('4점'),math:root.querySelectorAll('.katex').length,boxBorder:getComputedStyle(root.querySelector('.structure-box')).borderTopStyle,blankBorder:getComputedStyle(root.querySelector('.structure-blank')).borderTopStyle,displayMath:root.querySelectorAll('.katex-display').length,overflow:document.documentElement.scrollWidth>innerWidth,overlaps:[...root.querySelectorAll('.structure-blank')].some(b=>b.getBoundingClientRect().right>b.parentElement.getBoundingClientRect().right+1),placement:root.querySelector('[data-structure-id="placementStep"]').textContent,order:[...root.querySelector('.structure-box').children].map(x=>x.dataset.structureId)};});
   assert.equal(result.box,1);assert.equal(result.boxBorder,'solid');assert.equal(result.blankBorder,'solid');assert.equal(result.figures,3);assert.equal(result.blanks,5);assert.deepEqual(result.reasons,['…… ①','…… ②','…… ③']);assert.equal(result.score,false);assert.ok(result.math>=12);assert.equal(result.displayMath,0);assert.equal(result.overflow,false);assert.equal(result.overlaps,false);assert.match(result.placement,/DEF.*를 뒤집어/s);assert.deepEqual(result.order,['givenParagraph','figures','placementStep','proofOne','proofTwoIntro','proofTwo','proofThree','congruence','conclusion']);results.push(result);
   await page.screenshot({path:path.join(dir,'web-'+width+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:800,height:1000});await page.pdf({path:path.join(dir,'web-preview.pdf'),format:'A4',printBackground:true});
  for(const score of [false,true]){const download=page.waitForEvent('download',{timeout:120000}).catch(e=>e);await page.evaluate(s=>window.test.docx(s),score).catch(e=>{console.error('EXPORT FAILED:',e);throw e;});const result=await download;if(result instanceof Error)throw result;await result.saveAs(path.join(dir,score?'web-original-score.docx':'web-normal.docx'));}
  assert.ok(requests.includes('/python/structured_docx.py'));assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(dir,'web-verification.json'),JSON.stringify({results,errors,workerStructuredModule:true,remoteConnections:0,revision:bundle.revisionId},null,2));console.log('PASS native mobile renderer, three figures, source leader recovery, editable real web-worker DOCX with optional score. '+dir);
 }finally{await browser?.close();server.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
