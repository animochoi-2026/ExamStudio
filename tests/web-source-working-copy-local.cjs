'use strict';
// Isolated browser session; all RPCs are local read fixtures. No remote data or writes.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'tmp/arrow-pdf-followup-20261004'),entry=path.join(dir,'working-copy-entry.js'),bundle=path.join(dir,'working-copy.js');
 fs.writeFileSync(entry,`
 import {examEditor,pageContentHeight} from '../../web-bank/exam-editor.js';
 import {examSession} from '../../web-bank/exam-session.js';
 const catalogs=Array.from({length:25},(_,i)=>({question_id:'q'+(i+1),revision_id:'r'+(i+1),metadata:{source:{school:'local',academicYear:2026,grade:'중2',term:'2학기',exam:'중간고사',originalNumber:String(i+1)}}}));
 const calls=[],errors=[];const node=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
 const action=(text,fn)=>{const b=node('button',text);b.onclick=fn;return b;};
 const field=(parent,label,value='',type='text')=>{const l=node('label',label),i=node(type==='textarea'?'textarea':'input');if(type!=='textarea')i.type=type;i.value=value;l.append(i);parent.append(l);return i;};
 const rpc=async(name,args)=>{calls.push(name);if(name==='bank_source_questions')return catalogs;if(name==='bank_source_progress_get')return{status:'complete',expected_count:25};if(name==='bank_source_exams'||name==='bank_search_current')return[];throw Error('Unexpected RPC '+name);};
 const reader={render:async id=>{const c=catalogs.find(c=>c.revision_id===id),element=node('div','Local editable question '+c.question_id,'native-question');element.style.minHeight='38px';return{element,catalog:c,figures:[],question:{body:'Local editable question',choices:[],answer:'①',solution:''}};}};
 const ctx={examId:'new',sourceExam:'fixture-source',chosen:[],reader,rpc,rows:async()=>[],config:{spaceId:'local'},user:{id:'fixture-user'},save:()=>{},navigate:()=>{},message:(s,e)=>{if(e)errors.push(s);},node,action,field};
 window.readWorking=()=>examSession.read('fixture-user','new');window.openWorking=async source=>{const old=document.getElementById('view');old?.remove();const root=node('div');root.id='view';document.body.append(root);await examEditor({...ctx,root,sourceExam:source});return{draft:window.readWorking(),pages:root.querySelectorAll('.exam-page:not(.answer-page)').length,names:root.querySelectorAll('.exam-page:not(.answer-page) .exam-name-line').length,answerCounts:[...root.querySelectorAll('.answer-page .exam-column')].map(c=>c.children.length),height:pageContentHeight()};};
 window.calls=calls;window.errors=errors;window.ready=true;
 `);
 await require('esbuild').build({entryPoints:[entry],outfile:bundle,bundle:true,format:'esm',platform:'browser',logLevel:'silent'});
 const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('content-type','text/html');return res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/web-bank/style.css"><script type="module" src="/tmp/arrow-pdf-followup-20261004/working-copy.js"></script>');}const f=path.resolve(root,'.'+req.url);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.writeHead(404).end();return;}res.setHeader('content-type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(f));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1200,height:1000}}),base='http://127.0.0.1:'+server.address().port;page.on('pageerror',e=>{throw e;});await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());await page.goto(base);await page.waitForFunction(()=>window.ready);
  const first=await page.evaluate(()=>window.openWorking('fixture-source'));assert.equal(first.draft.items[15].workspaceMm,0);assert.equal(first.draft.items[16].breakBefore,null);assert.equal(first.names,1);assert.deepEqual(first.answerCounts,[25,0]);assert(Math.abs(first.height-259*96/25.4)<1);
  await page.locator('.exam-layout-tools > summary').click();await page.locator('[data-question-id="q16"] > summary').click();
  await page.locator('[data-question-id="q16"] input').fill('45');await page.locator('[data-question-id="q16"] input').dispatchEvent('change');await page.waitForFunction(()=>window.readWorking().items[15].workspaceMm===45&&document.querySelectorAll('.exam-item-tool').length===25);
  await page.locator('[data-question-id="q20"] > summary').click();await page.locator('[data-question-id="q20"] select').selectOption('column');await page.waitForFunction(()=>window.readWorking().items[19].breakBefore==='column'&&document.querySelectorAll('.exam-item-tool').length===25);
  const reopened=await page.evaluate(()=>window.openWorking('fixture-source'));assert.equal(reopened.draft.items[15].workspaceMm,45);assert.equal(reopened.draft.items[16].breakBefore,null);assert.equal(reopened.draft.items[19].breakBefore,'column');assert.equal(reopened.names,1);assert.deepEqual(reopened.answerCounts,[25,0]);
  const other=await page.evaluate(()=>window.openWorking('different-source'));assert.equal(other.draft.items[15].workspaceMm,0);assert.equal(other.draft.items[19].breakBefore,null);
  const activity=await page.evaluate(()=>({calls:window.calls,errors:window.errors}));assert(!activity.calls.some(c=>/save|delete|insert|update/.test(c)));assert.deepEqual(activity.errors,[]);
  fs.writeFileSync(path.join(dir,'working-copy-verification.json'),JSON.stringify({first,reopened,other,activity,aiCalls:0,remoteConnections:0,operatingWrites:0},null,2));console.log('PASS source reopening preserves workspace and user breaks; 17 remains automatic; 25 quick answers in one column; 259mm body; first-page name; no writes.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
