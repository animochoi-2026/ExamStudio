const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const out=path.resolve('tests/artifacts/past-print-sections');fs.mkdirSync(out,{recursive:true});
 await require('esbuild').build({entryPoints:['tests/fixtures/past-print-sections.js'],bundle:true,format:'esm',outfile:path.join(out,'fixture.js')});
 const server=http.createServer((req,res)=>{const file=req.url==='/fixture.js'?path.join(out,'fixture.js'):req.url==='/style.css'?'web-bank/style.css':req.url==='/katex.css'?'node_modules/katex/dist/katex.min.css':req.url.startsWith('/fonts/')?'node_modules/katex/dist'+req.url:null;if(file){res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');return res.end(fs.readFileSync(file));}res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/katex.css"><main></main><script type="module" src="/fixture.js"></script>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.checkSections);const r=await page.evaluate(()=>checkSections());
 assert.deepEqual(r.answerCalls,{load:24,render:0});assert.deepEqual(r.questionCalls,{load:0,render:24});
 assert.equal(r.answer.questions,0);assert.equal(r.question.answers,0);assert.equal(r.answer.text,r.both.text);assert.equal(r.answer.answers,r.both.answers);assert.equal(r.question.questions,r.both.questions);assert.equal(r.question.questionText,r.both.questionText);
 assert.match(r.override.text,/저장한 수정 풀이/);assert.equal(r.stages,0);assert.equal(r.answer.timings.questionLayoutMs,0);assert.equal(r.question.timings.answerLayoutMs,0);
 console.log(JSON.stringify({pass:true,answerCalls:r.answerCalls,questionCalls:r.questionCalls,questionPages:r.question.questions,answerPages:r.answer.answers}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
