const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.EXAM_PLAYWRIGHT_MODULE||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'artifacts/download-security'),site=path.join(out,'site');
(async()=>{
 const fixture=`
 import {exportDocx,exportHwpx,exportPdf} from './web-bank/web-export.js';
 import security from './app/download-security.cjs';
 const questions=[0,1].map(i=>({id:'q'+i,sourceId:'s'+i,kind:'original',include:true,body:'방정식 $x+1=3$의 해를 구하시오.',answer:'2',solution:'$x=2$이다.'}));
 const draft={title:'웹 출력 보존 검사',rules:{units:[]},items:questions.map(q=>({questionId:q.id,revisionId:q.id,workspaceMm:20})),bodyFontSize:10,answerMode:'all'};
 const loaded=questions.map((question,i)=>({question,catalog:{revision_id:question.id,metadata:{}},figures:[],element:document.querySelector('[data-index="'+i+'"]')}));
 const layout={pages:[{columns:[questions.map(q=>({questionId:q.id})),[]]}]};
 const pages=document.querySelector('#pages'),status=document.querySelector('#status');
 const calls=[];const rpc=async(name,args)=>{calls.push({name,args});return name.endsWith('begin')?{identifier:'0042'}:{allowed:true};};
 for(const format of ['pdf','docx','hwpx'])await security.officialDownload({rpc,spaceId:'fixture',requestId:crypto.randomUUID(),format,revisions:['r1','r2'],generate:securityWatermark=>format==='pdf'?exportPdf(pages,draft.title,status,{download:false,securityWatermark,questionCount:2}):(format==='docx'?exportDocx:exportHwpx)({draft,loaded,layout,status,download:false,securityWatermark}),publish:async file=>{const response=await fetch('/result/'+format,{method:'POST',body:file.blob});if(!response.ok)throw Error('Save failed');}});
 window.result={calls};
 `;
 await require('esbuild').build({stdin:{contents:fixture,resolveDir:root},outfile:path.join(site,'security-fixture.js'),bundle:true,platform:'browser',format:'esm'});
 const server=http.createServer((req,res)=>{
  if(req.method==='POST'&&/^\/result\/(pdf|docx|hwpx)$/.test(req.url)){const chunks=[];req.on('data',b=>chunks.push(b));req.on('end',()=>{fs.writeFileSync(path.join(out,'web.'+req.url.split('/').pop()),Buffer.concat(chunks));res.end('ok');});return;}
  if(req.url==='/test'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/katex.min.css"><div id="pages"><section class="exam-page" style="width:210mm;height:297mm;background:white;padding:20mm;position:relative"><h2>웹 출력 보존 검사</h2><article class="print-question" data-index="0">1. 방정식 x+1=3의 해를 구하시오.</article><article class="print-question" data-index="1" style="margin-top:80mm">2. 방정식 x+1=3의 해를 구하시오.</article></section></div><p id="status"></p><script type="module" src="/security-fixture.js"></script>');return;}
  const f=path.resolve(site,'.'+new URL(req.url,'http://local').pathname);if(!f.startsWith(site+path.sep)||!fs.existsSync(f)){res.writeHead(404).end();return;}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.wasm')?'application/wasm':'application/octet-stream');fs.createReadStream(f).pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const origin='http://127.0.0.1:'+server.address().port;await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());page.on('pageerror',e=>console.error(e.message));await page.goto(origin+'/test');await page.waitForFunction(()=>window.result,null,{timeout:120000});const result=await page.evaluate(()=>window.result);assert.equal(result.calls.length,6);assert(result.calls.filter(x=>x.name.endsWith('finish')).every(x=>x.args.generated));fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify(result,null,2));console.log('Browser PDF/DOCX/HWPX: official flow completed using synthetic RPC responses');}
 finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
