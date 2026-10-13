'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const out=path.resolve('artifacts/solution-memory');fs.mkdirSync(out,{recursive:true});
 const old=cp.execFileSync('git',['show','c2d9610:web-bank/solution-flow.js'],{encoding:'utf8'}).replace('for(let i=0;i<count;i++){', 'window.baselineCount=count;for(let i=window.singlePage??0;i<(window.singlePage==null?count:window.singlePage+1);i++){');
 const entry=`import {appendSolutionPages as current} from './web-bank/solution-flow.js';import {appendSolutionPages as before} from 'baseline-flow';import {mathText} from './web-bank/math-text.js';
 const node=(t,s='',c='')=>{const e=document.createElement(t);e.textContent=s;e.className=c;return e;};
 window.run=async(mode,count,long)=>{const pages=document.querySelector('.exam-pages');pages.replaceChildren();const loaded=window.sample?.loaded||Array.from({length:count},(_,i)=>({question:{answer:String(i+1),solution:Array.from({length:long&&i===0?115:12},(_,j)=>'문항 '+(i+1)+' 단계 '+(j+1)+': 조건을 적용하여 $\\\\frac{x+1}{2}=3$임을 확인한다.').join('\\n')}}));const items=loaded.map((_,i)=>({originalNumber:String(i+1)}));const started=performance.now();await (mode==='before'?before:current)({pages,loaded,items,node,mathText,height:window.sample?.height??259*96/25.4,markAnswers:true});return {pages:pages.children.length,nodes:pages.querySelectorAll('*').length,math:pages.querySelectorAll('.katex').length,visibleBases:[...pages.querySelectorAll('.katex-html > .base,.katex-html > .katex-base')].filter(e=>{const r=e.getBoundingClientRect(),f=e.closest('.solution-flow-frame').getBoundingClientRect();return r.left>=f.left-1&&r.right<=f.right+1&&r.top>=f.top-1&&r.bottom<=f.bottom+1;}).length,ms:performance.now()-started,text:mode==='before'?pages.querySelector('.solution-flow').textContent:[...pages.querySelectorAll('.solution-flow')].map(e=>e.textContent).join('')};};`;
 await require('esbuild').build({stdin:{contents:entry,resolveDir:process.cwd()},bundle:true,format:'esm',outfile:path.join(out,'test.js'),plugins:[{name:'baseline',setup(b){b.onResolve({filter:/^baseline-flow$/},()=>({path:'baseline',namespace:'baseline'}));b.onLoad({filter:/.*/,namespace:'baseline'},()=>({contents:old,loader:'js',resolveDir:path.resolve('web-bank')}));}}]});
 const server=http.createServer((req,res)=>{const n=req.url.split('?')[0],f=n==='/test.js'?path.join(out,'test.js'):n==='/style.css'?path.resolve('web-bank/style.css'):n==='/katex.css'?path.resolve('node_modules/katex/dist/katex.min.css'):n.startsWith('/fonts/')?path.resolve('node_modules/katex/dist'+n):null;res.setHeader('Content-Type',n.endsWith('.js')?'text/javascript':n.endsWith('.css')?'text/css':'text/html;charset=utf-8');res.end(f?fs.readFileSync(f):'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/katex.css"><main><div class="exam-pages"></div></main><script type="module" src="/test.js"></script>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1000,height:1200}}),errors=[];page.on('console',m=>{if(m.type()==='error')console.log(m.text());});page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('crash'));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.run);
  const results=[];
  for(const [count,long]of [[3,true],[60,false]]){
   const before=await page.evaluate(([n,l])=>run('before',n,l),[count,long]);
   if(count===3)for(let i=0;i<before.pages;i++)await page.locator('.solution-flow-page').nth(i).screenshot({path:path.join(out,'before-'+i+'.png')});
   const after=await page.evaluate(([n,l])=>run('after',n,l),[count,long]);
   assert.equal(after.text,before.text,'all text and complete math retained in reading order');assert.equal(after.pages,before.pages,'native column/page breaks retained');assert(after.math>0);assert.equal(after.math,before.math/before.pages,'each formula occurs once');
   console.log({count,beforeNodes:before.nodes,afterNodes:after.nodes,pages:before.pages,math:before.math});assert(after.nodes<before.nodes/(before.pages*.8),'DOM growth is linear in content');
   if(count===3){const sharp=require('sharp');for(let i=0;i<after.pages;i++){
    const file=path.join(out,'after-'+i+'.png');await page.locator('.solution-flow-page').nth(i).screenshot({path:file});
    const a=await sharp(path.join(out,'before-'+i+'.png')).removeAlpha().raw().toBuffer(),b=await sharp(file).removeAlpha().raw().toBuffer();assert.equal(a.length,b.length);let pixels=0;for(let j=0;j<a.length;j+=3)if(Math.max(Math.abs(a[j]-b[j]),Math.abs(a[j+1]-b[j+1]),Math.abs(a[j+2]-b[j+2]))>40)pixels++;assert(pixels/(a.length/3)<.015,'visible layout changed: '+pixels/(a.length/3));
   }}
   delete before.text;delete after.text;results.push({count,long,before,after});
  }
  await page.evaluate(()=>window.sample={height:120,loaded:[{question:{answer:'1',solution:'앞 문장.\n'.repeat(4)+'$'+Array.from({length:90},(_,i)=>'x_'+i).join('+')+'$\n마지막 문장.'}}]});
  const wrappedBefore=await page.evaluate(()=>run('before',1,false));const wrappedAfter=await page.evaluate(()=>run('after',1,false));assert.equal(wrappedAfter.text,wrappedBefore.text,'wrapping inline math retained');assert.equal(wrappedAfter.visibleBases,wrappedBefore.visibleBases,'wrapped math remains visible across columns');
  await page.evaluate(()=>window.sample=null);
  if(process.env.REAL_SOLUTION_SAMPLE){
   const sample=JSON.parse(fs.readFileSync(process.env.REAL_SOLUTION_SAMPLE,'utf8'));await page.evaluate(s=>window.sample=s,sample);
   const after=await page.evaluate(()=>run('after',60,false));
   for(let i=0;i<after.pages;i++){const sheet=page.locator('.solution-flow-page').nth(i);await sheet.evaluate(e=>e.style.cssText+=';position:fixed;top:0;left:0;margin:0;z-index:100');await sheet.screenshot({path:path.join(out,'real-after-'+i+'.png')});await sheet.evaluate(e=>e.style.cssText='');}
   const differences=[];let before;
   for(let i=0;i<after.pages;i++){
    await page.evaluate(i=>window.singlePage=i,i);before=await page.evaluate(()=>run('before',60,false));assert.equal(await page.evaluate(()=>baselineCount),after.pages);assert.equal(after.text,before.text);
    const file=path.join(out,'real-before-'+i+'.png');await page.locator('.solution-flow-page').evaluate(e=>e.style.cssText+=';position:fixed;top:0;left:0;margin:0;z-index:100');await page.locator('.solution-flow-page').screenshot({path:file});
    const sharp=require('sharp'),a=await sharp(file).removeAlpha().raw().toBuffer(),b=await sharp(path.join(out,'real-after-'+i+'.png')).removeAlpha().raw().toBuffer();let pixels=0;for(let j=0;j<a.length;j+=3)if(Math.max(Math.abs(a[j]-b[j]),Math.abs(a[j+1]-b[j+1]),Math.abs(a[j+2]-b[j+2]))>40)pixels++;differences.push(pixels/(a.length/3));
   }
   fs.writeFileSync(path.join(out,'real-visual-comparison.json'),JSON.stringify({pages:after.pages,differences,beforeNodesPerPage:before.nodes,afterNodes:after.nodes},null,2));assert(differences.every(x=>x<.015),'actual solution geometry differs: '+JSON.stringify(differences));
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
