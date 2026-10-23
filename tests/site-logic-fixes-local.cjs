// Local harness for the same production components; no external API requests.
const fs=require('node:fs'),http=require('node:http'),esbuild=require('esbuild');
const bundles=new Map();
for(const [url,entry]of [['/fixture.js','tests/fixtures/site-logic-fixes.js'],['/exam-composition-worker.js','web-bank/exam-composition-worker.js']])bundles.set(url,esbuild.buildSync({entryPoints:[entry],bundle:true,format:'esm',write:false}).outputFiles[0].contents);
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost').pathname;
 if(bundles.has(url)){res.setHeader('Content-Type','text/javascript');return res.end(bundles.get(url));}
 const file={'/style.css':'web-bank/style.css','/exam-workflow.css':'web-bank/exam-workflow.css','/katex.min.css':'node_modules/katex/dist/katex.min.css'}[url]||(url.startsWith('/fonts/')&&!url.includes('..')?'node_modules/katex/dist'+url:null);
 if(file){res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'application/octet-stream');return res.end(fs.readFileSync(file));}
 if(url!=='/'){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>문제공방 · 합성 자료 검증</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/exam-workflow.css"><link rel="stylesheet" href="/katex.min.css"><main id="view" style="max-width:1050px;margin:auto;padding:16px"></main><script type="module" src="/fixture.js"></script>');
}).listen(4184,'127.0.0.1',()=>console.log('Synthetic review: http://127.0.0.1:4184/?mode=mock (exam/past)'));
