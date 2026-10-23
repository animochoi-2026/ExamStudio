'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const R=path.resolve(__dirname,'..'),O=path.join(R,'artifacts/modern-minimal-20261023');fs.mkdirSync(O,{recursive:true});
const runtime=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies');
const {chromium}=require(process.env.EXAM_PLAYWRIGHT_MODULE||path.join(runtime,'node/node_modules/playwright'));
const logo=process.env.MODERN_REFERENCE_LOGO||path.join(process.env.USERPROFILE,'Documents/munjegongbang-design/modern-minimal-20261022/academy-logo-original.jpg');
(async()=>{
 await require('esbuild').build({entryPoints:[path.join(__dirname,'fixtures/modern-minimal-browser.js')],outfile:path.join(O,'fixture.js'),bundle:true,format:'esm',platform:'browser'});
 const server=http.createServer((req,res)=>{let url=new URL(req.url,'http://localhost').pathname;
  if(url==='/test')return res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/runtime/noto-sans-kr/print-font.css"><link rel="stylesheet" href="/katex.min.css"><div id="view"></div><script type="module" src="/fixture.js"></script>');
  if(url==='/logo.txt')return res.end('data:image/jpeg;base64,'+fs.readFileSync(logo).toString('base64'));
  const f=url==='/fixture.js'?path.join(O,'fixture.js'):url.startsWith('/fonts/')||url==='/katex.min.css'?path.join(R,'node_modules/katex/dist',url):path.join(R,'web-bank',url);
  if(!fs.existsSync(f))return res.writeHead(404).end(url);res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'application/octet-stream');fs.createReadStream(f).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 const results=[];
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1300,height:1000}}),origin='http://127.0.0.1:'+server.address().port;
  await page.route('**/*',r=>r.request().url().startsWith(origin)||r.request().url().startsWith('data:')?r.continue():r.abort());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/test');await page.waitForFunction(()=>window.ready);
  const inspect=()=>page.evaluate(()=>{const sheets=[...document.querySelectorAll('#view .exam-pages .exam-page:not(.answer-page)')];return sheets.map((p,pi)=>{const rect=p.getBoundingClientRect(),scale=(210*96/25.4)/rect.width,box=e=>{const b=e.getBoundingClientRect();return {x:(b.x-rect.x)*.75*scale,y:(b.y-rect.y)*.75*scale,w:b.width*.75*scale,h:b.height*.75*scale};};return {pi,header:p.querySelector('.modern-title')?.textContent,number:p.querySelector('.modern-footer .page-number')?.textContent,font:p.querySelector('.modern-title')?getComputedStyle(p.querySelector('.modern-title')).fontSize:null,brand:p.querySelector('.modern-academy')?.textContent,academyFont:p.querySelector('.modern-academy')?getComputedStyle(p.querySelector('.modern-academy')).fontSize:null,logo:p.querySelector('.modern-logo')?box(p.querySelector('.modern-logo')):null,type:p.querySelector('.modern-type')?.textContent,cols:[...p.querySelectorAll('.exam-column')].map(c=>({box:box(c),items:[...c.querySelectorAll('.print-question')].map(q=>({id:q.dataset.index,box:box(q),body:box(q.querySelector('.native-question')),section:!!q.querySelector('.modern-section'),number:q.querySelector('.question-number')?.textContent,score:q.querySelector('.source-points')?.textContent||null,rule:!!q.querySelector('.modern-number-rule'),text:q.textContent}))}))};});});
  let positions;
  for(const scores of [true,false]){
   const ready=await page.evaluate(options=>fixture(options),{scores});assert(ready.ready,JSON.stringify(ready));const data=await inspect();assert(data.length>=2);assert(data.every((p,i)=>p.number===String(i+1)));
   const qs=data.flatMap(p=>p.cols.flatMap(c=>c.items));assert.equal(qs.length,18);assert.equal(qs.filter(q=>q.section).length,1);assert.equal(qs.find(q=>q.section).id,'5');assert(!qs.find(q=>q.id==='4').text.includes('풀이 과정을 쓰시오'));assert.equal(qs.find(q=>q.id==='5').score,scores?'[7점]':null);assert.equal(qs.find(q=>q.id==='3').score,null);
   for(const p of data)for(const c of p.cols){for(const [i,q]of c.items.entries()){assert(q.box.y+q.box.h<=c.box.y+c.box.h+.5,JSON.stringify(q));if(i)assert(q.box.y>=c.items[i-1].box.y+c.items[i-1].box.h-.5);if(q.section)assert.equal(i,0);}}
   assert.equal(data[0].type,'A1');assert.equal(data[0].header,'실전모의고사 1회');assert(Math.abs(data[0].logo.h-18)<.1);assert(Math.abs(parseFloat(data[0].academyFont)*.75-11)<.1);assert(Math.abs(data[0].cols[0].box.x-42)<.2);assert(Math.abs(data[0].cols[1].box.x-data[0].cols[0].box.x-data[0].cols[0].box.w-38)<.2);
   const pos=qs.map(q=>[q.id,q.box,q.body]);if(positions){for(let i=0;i<pos.length;i++){assert.equal(pos[i][0],positions[i][0]);for(const j of [1,2])for(const k of ['x','y','w','h'])assert(Math.abs(pos[i][j][k]-positions[i][j][k])<.02,'score toggle changed layout');}}else positions=pos;
   await page.waitForFunction(()=>window.handle.ready()&&!document.querySelector('.exam-measure'));await page.waitForTimeout(700);const name=scores?'score-on':'score-off';await page.locator('.exam-viewport .exam-page').first().screenshot({path:path.join(O,name+'.png')});
   const bytes=await page.evaluate(()=>pdf());fs.writeFileSync(path.join(O,name+'.pdf'),Buffer.from(bytes));
   const request=await page.evaluate(()=>nativeSnapshot());const dir=path.join(O,name);fs.mkdirSync(dir,{recursive:true});for(const a of request.assets)fs.writeFileSync(path.join(dir,a.name),Buffer.from(a.bytes));fs.writeFileSync(path.join(dir,'snapshot.json'),JSON.stringify(request.snapshot).replaceAll('/tmp/',dir.replaceAll('\\','/')+'/'));
   results.push({name,pages:data});
  }
  for(const options of [{count:8,noLogo:true,title:'아주 긴 시험 제목을 모두 보존하는 중학교 2학년 삼각형과 사각형 및 확률 실전모의고사 12회'},{count:8,long:true},{count:18,past:true},{count:8,template:'standard'},{count:8,template:'mock'}]){const ready=await page.evaluate(x=>fixture(x),options);assert(ready.ready,JSON.stringify(ready));const data=await inspect();results.push({options,pages:data});if(options.long)assert(data.flatMap(p=>p.cols.flatMap(c=>c.items)).filter(q=>q.id==='2').length>1);}
  await page.evaluate(()=>fixture({count:8}));assert.equal((await page.evaluate(()=>checkCatalog())).filter(f=>f.template==='modern-minimal').length,1);
  await page.evaluate(()=>openSettings());await page.getByLabel('시험지 폼',{exact:true}).selectOption('modern-minimal');
  await page.getByLabel('학원명',{exact:true}).fill('로컬 검증학원');await page.getByLabel('학원명',{exact:true}).press('Tab');
  await page.getByLabel('유형 표시 (회차와 별도)',{exact:true}).fill('B2');await page.getByLabel('유형 표시 (회차와 별도)',{exact:true}).press('Tab');
  await page.getByLabel('배점 표시 (확인된 배점만)',{exact:true}).check();await page.getByLabel('학원 로고 업로드').setInputFiles(logo);await page.getByRole('button',{name:'폼 저장',exact:true}).click();
  const saved=await page.evaluate(()=>checkCatalog().find(f=>f.id.startsWith('saved:')));assert.equal(saved.academyName,'로컬 검증학원');assert.equal(saved.typeLabel,'B2');assert.equal(saved.showOriginalPoints,true);assert(saved.logo.startsWith('data:image/'));
  assert.equal((await page.evaluate(()=>checkCatalog('other-teacher'))).length,3);await page.evaluate(()=>openSettings());assert.equal(await page.getByLabel('학원명',{exact:true}).inputValue(),'로컬 검증학원');
  assert.equal(await page.getByLabel('배점 표시 (확인된 배점만)',{exact:true}).isChecked(),true);
  results.push({accountScopedSaveAndReopen:true});assert.deepEqual(errors,[]);fs.writeFileSync(path.join(O,'browser-checks.json'),JSON.stringify({results,errors},null,2));console.log('PASS browser: score parity, metadata, real image PDF, native export snapshots, multipage/long questions/past-print/legacy forms, account settings');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
