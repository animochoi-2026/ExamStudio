const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.EXAM_PLAYWRIGHT_MODULE||'playwright');
const source=path.resolve(__dirname,'..'),dir=path.resolve(process.env.EXAM_EXPORT_TEST_OUTPUT||fs.mkdtempSync(path.join(require('node:os').tmpdir(),'exam-browser-export-'))),site=path.join(dir,'site'),out=path.join(dir,'results');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const config=path.join(dir,'config.json');fs.writeFileSync(config,JSON.stringify({url:'https://fixture.supabase.co',spaceId:'00000000-0000-4000-8000-000000000001',publishableKey:'sb_publishable_fixture'}));
 await require('../scripts/build-bank-web.cjs').build(config,site);
 const entry=`
 import {examEditor} from ${JSON.stringify(path.join(source,'web-bank/exam-editor.js'))};
 import {mathText} from ${JSON.stringify(path.join(source,'web-bank/question-renderer.js'))};
 const node=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
 const action=(text,fn)=>{const b=node('button',text);b.onclick=fn;return b;};
 const field=(p,label,value='',type='text')=>{const l=node('label',label),i=node(type==='textarea'?'textarea':'input');i.type=type;i.value=value;l.append(i);p.append(l);return i;};
 const catalogs=Array.from({length:5},(_,i)=>({question_id:'q'+i,revision_id:'r'+i,metadata:{source:{school:'복원 경로 검증',academicYear:2026,grade:'중2',term:'2학기',exam:'중간고사',originalNumber:String(i+1)}}}));
 const text=value=>({kind:'text',text:value,label:'',border:'none',widthEm:0,align:'left',origin:'printed'});
 const questions=catalogs.map((c,i)=>({id:c.question_id,sourceId:c.question_id,kind:'original',body:(i+1)+'. 다음 식의 값을 구하시오. $\\\\frac{6}{2}$',answer:'3',solution:'6을 2로 나누면 3이다.',choices:[],...(i===0?{layoutDocument:{version:1,features:['multiElementBox','interleavedFlow'],nodes:[{id:'intro',type:'paragraph',parentId:null,origin:'printed',align:'left',widthRatio:1,inlines:[text('1. 다음 식의 값을 구하시오.')]},{id:'box',type:'box',parentId:null,origin:'printed',align:'left',widthRatio:1,inlines:[]},{id:'inside',type:'paragraph',parentId:'box',origin:'printed',align:'left',widthRatio:1,inlines:[text('6 ÷ 2')]}]}}:{})}));
 const bs=String.fromCharCode(92);questions[1].body='직선 $'+bs+'ell_1'+bs+'parallel'+bs+'ell_2$를 확인하시오.';questions[1].solution='$'+bs+'boxed{3}$';questions[2].solution='$'+bs+'begin{aligned}x&=1+2'+bs+bs+'&=3'+bs+'end{aligned}$';
 const rpc=async name=>{if(name==='bank_source_questions')return catalogs;if(name==='bank_source_progress_get')return {status:'complete',expected_count:5};if(name==='bank_source_exams'||name==='bank_search_current')return [];throw Error('Unexpected RPC '+name);};
 const reader={render:async id=>{const i=catalogs.findIndex(c=>c.revision_id===id),q=structuredClone(questions[i]),element=node('div','','native-question');element.append(mathText(q.body));return {question:q,catalog:catalogs[i],element,figures:[]};}};
 window.exportSnapshots=[];const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{postMessage(data,...rest){if(data.snapshot)window.exportSnapshots.push(structuredClone(data.snapshot));return super.postMessage(data,...rest)}};
 await examEditor({root:document.getElementById('view'),examId:'new',sourceExam:'unsaved-original',chosen:[],reader,rpc,rows:async()=>[],config:{spaceId:'fixture'},user:{id:'fixture'},save:()=>{},navigate:()=>{},message:()=>{},node,action,field});
 window.ready=true;
 `;
 await require('esbuild').build({stdin:{contents:entry,resolveDir:source},outfile:path.join(site,'fixture.js'),bundle:true,format:'esm',platform:'browser',target:['chrome110']});
 const server=http.createServer((req,res)=>{if(req.url==='/test'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/katex.min.css"><div id="view"></div><script type="module" src="/fixture.js"></script>');}const f=path.resolve(site,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(site+path.sep)||!fs.existsSync(f)){res.writeHead(404).end();return;}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.wasm')?'application/wasm':f.endsWith('.css')?'text/css':'application/octet-stream');fs.createReadStream(f).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch({channel:process.env.EXAM_EXPORT_BROWSER||(process.platform==='win32'?'msedge':undefined),headless:true});const page=await browser.newPage({viewport:{width:1300,height:1000},acceptDownloads:true});const origin='http://127.0.0.1:'+server.address().port;await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());page.on('pageerror',e=>console.log('PAGE ERROR '+e.message));await page.goto(origin+'/test');await page.waitForFunction(()=>window.ready);
 const layout=await page.locator('.exam-page:not(.answer-page) .exam-column').evaluateAll(cols=>cols.map(c=>({height:c.getBoundingClientRect().height,questions:[...c.querySelectorAll('.print-question')].map(q=>({index:q.dataset.index,top:parseFloat(q.style.top)}))})));assert.deepEqual(layout.map(c=>c.questions.map(q=>q.index)),[['0','1'],['2','3'],['4'],[]]);for(const col of layout)for(const [i,q]of col.questions.entries())assert.ok(Math.abs(q.top-i*col.height/2)<.1);console.log('Unsaved restoration midpoint layout passed');
 await page.locator('.exam-pages').screenshot({path:path.join(out,'preview.png')});const downloads=[];
 for(const format of ['DOCX','HWPX']){const waiting=page.waitForEvent('download',{timeout:120000}).catch(()=>null);await page.getByRole('button',{name:new RegExp('^'+format+' 다운로드')}).click();await page.waitForFunction(()=>/완료|실패/.test(document.querySelector('.export-progress-dialog h2')?.textContent||''),null,{timeout:120000});const result=await page.locator('.export-progress-dialog').innerText();if(result.includes('실패'))throw Error(result);const file=await waiting;assert.ok(file,result);await file.saveAs(path.join(out,'restored.'+format.toLowerCase()));downloads.push({format,result});await page.locator('.export-progress-dialog').getByRole('button',{name:'닫기',exact:true}).click();console.log('DOWNLOADED '+format);}
 const snapshots=await page.evaluate(()=>window.exportSnapshots);assert.equal(snapshots.length,2);
 for(const snapshot of snapshots){assert.equal(snapshot.settings.quadrantLayout,true);assert.deepEqual(snapshot.settings.measuredPages,[[['q0','q1'],['q2','q3']],[['q4'],[]]]);}
 const diagnostic=await page.evaluate(()=>new Promise((resolve,reject)=>{
  const worker=new Worker('./export-worker.js'),snapshot=structuredClone(window.exportSnapshots[0]);
  snapshot.questions[0].body='$'+String.fromCharCode(92)+'unknownOne$';snapshot.questions[1].answer='$'+String.fromCharCode(92)+'unknownTwo$';
  const timeout=setTimeout(()=>{worker.terminate();reject(Error('Preflight timeout'))},120000);
  worker.onmessage=({data})=>{if(data.error||data.bytes){clearTimeout(timeout);worker.terminate();resolve(data.error||'unexpected output')}};
  worker.onerror=e=>{clearTimeout(timeout);worker.terminate();reject(Error(e.message))};worker.postMessage({format:'docx',snapshot,assets:[]});
 }));
 assert.match(diagnostic,/1번 본문/);assert.match(diagnostic,/2번 정답/);assert.ok(!diagnostic.includes('Traceback'));
 console.log('Browser all-question preflight passed');
 console.log('Browser artifacts: '+out);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({layout,downloads,unsavedRestoration:true,aiCalls:0},null,2));
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
