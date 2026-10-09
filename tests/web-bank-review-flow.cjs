'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {localServer}=require('./shared-bank-local-server.cjs');

(async()=>{const server=await localServer(),directory=fs.mkdtempSync(path.join(__dirname,'../data/validation/web-bank-review-'));let browser,web;
 try{
  const call=(u,n,args)=>server.auth(u).request('/rest/v1/rpc/'+n,{method:'POST',body:args});
  await call(server.A,'bank_join',{s:server.S});await call(server.A,'bank_invite',{s:server.S,email_address:'teacher-b@example.test',enabled_value:true});await call(server.B,'bank_join',{s:server.S});
  const q=crypto.randomUUID(),r=crypto.randomUUID(),f=crypto.randomUUID(),unitId=crypto.randomUUID(),typeId=crypto.randomUUID();await server.db.exec('reset role');
  await server.db.query("insert into bank_taxonomy(space_id,id,label,kind) values($1,$2,'삼각형의 외심','unit'),($1,$3,'외심 도형 계산','type')",[server.S,unitId,typeId]);
  await server.db.query("insert into bank_questions(id,space_id,owner_id,owner_email) values($1,$2,$3,'animochoi@gmail.com')",[q,server.S,server.A]);
  await server.db.query("insert into bank_revisions(id,question_id,actor_id,committed,visibility) values($1,$2,$3,true,'shared_pending')",[r,q,server.A]);
  await server.db.query("insert into bank_entries(id,space_id,name,kind,owner_id) values($1,$2,'commit','file',$3)",[f,server.S,server.A]);
  await server.db.query("insert into bank_catalog(revision_id,space_id,question_id,commit_id,metadata,content,files) values($1,$2,$3,$4,$5,$6,'[]')",[r,server.S,q,f,{source:{kind:'학교기출',school:'광희중',academicYear:'2026',grade:'중2',semester:'2학기',exam:'중간고사',originalNumber:'16',originalPoints:'4'},difficulty:{aiScore:null},management:{review:'approved'},reviews:{recognition:{confirmed:true}}},{body:'$\\triangle ABC$의 넓이는?',solution:'$\\angle ABC$를 확인한다.',answer:'4'}]);
  const config=path.join(directory,'public-config.json');fs.writeFileSync(config,JSON.stringify(server.auth(server.A).config()));const dist=await require('../scripts/build-bank-web.cjs').build(config,path.join(directory,'site'));
  web=http.createServer((req,res)=>{const file=path.join(dist,req.url==='/'?'index.html':req.url.split('?')[0]);if(!file.startsWith(dist)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(file));});await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));
  const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));browser=await chromium.launch({channel:'msedge',headless:true});
  async function pageFor(uid,width=390){const context=await browser.newContext({viewport:{width,height:844}}),jwt=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test',email=uid===server.B?'teacher-b@example.test':'animochoi@gmail.com';await context.addInitScript(({uid,jwt,email})=>sessionStorage.setItem('sb-test-project-auth-token',JSON.stringify({access_token:jwt,refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:uid,email,aud:'authenticated',role:'authenticated'}})),{uid,jwt,email});const page=await context.newPage();await page.route('https://test-project.supabase.co/**',async route=>{const req=route.request(),response=await server.fetch(req.url(),{method:req.method(),headers:req.headers(),body:req.postData()||undefined});await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});});await page.goto('http://127.0.0.1:'+web.address().port);return page;}
  const b=await pageFor(server.B);b.setDefaultTimeout(10000);await b.locator('#nav').getByRole('button',{name:'검수함'}).click();await b.getByRole('button',{name:'상세 보기'}).click();await b.getByText('원문 배점: 4점',{exact:false}).waitFor();
  await b.getByText('시험범위·풀이 검수',{exact:true}).click();await b.locator('.panel .katex').first().waitFor();
  await b.getByLabel('이 풀이가 완전하고 선택한 개념만 사용함을 확인').check();await b.getByLabel('문제 조건과 풀이의 개념을 실제로 확인했습니다').check();await b.getByRole('button',{name:'확인한 개념·풀이 저장'}).click();await b.getByText('개념·풀이 검수를 저장했습니다.').waitFor();
  await b.reload();await b.getByText('시험범위·풀이 검수',{exact:true}).click();assert.equal(await b.getByLabel('이 풀이가 완전하고 선택한 개념만 사용함을 확인').isChecked(),true);assert.equal(await b.getByLabel('문제 조건과 풀이의 개념을 실제로 확인했습니다').isChecked(),true);
  await b.getByLabel('직접 수정 점수 (선택)').fill('5.0');await b.getByRole('button',{name:'검수 저장',exact:true}).click();await b.getByText('검수 내용을 저장했습니다. 검수 완료 후에도 수정할 수 있습니다.').waitFor();
  await b.getByRole('button',{name:'검수 저장',exact:true}).click();await b.getByText('검수 내용을 저장했습니다. 검수 완료 후에도 수정할 수 있습니다.').waitFor();
  const a=await pageFor(server.A,1280);await a.locator('#nav').getByRole('button',{name:'문항찾기'}).click();await a.getByRole('button',{name:'상세 보기'}).click();await a.getByText('공동 검수자: teacher-b@example.test').waitFor();
  await b.getByLabel('출제유형',{exact:true}).fill('도형 해석 계산');await b.getByRole('button',{name:'검수 저장',exact:true}).click();await b.getByText('검수 내용을 저장했습니다. 검수 완료 후에도 수정할 수 있습니다.').waitFor();
  await a.reload();assert.equal(await a.getByLabel('출제유형',{exact:true}).inputValue(),'도형 해석 계산');
  await b.getByLabel('대표 단원',{exact:true}).fill('삼각형의 외심');await b.getByLabel('출제유형',{exact:true}).fill('외심 도형 계산');await b.getByRole('button',{name:'검수 저장',exact:true}).click();await b.getByText('검수 내용을 저장했습니다. 검수 완료 후에도 수정할 수 있습니다.').waitFor();
  await a.reload();assert.equal(await a.getByLabel('출제유형',{exact:true}).inputValue(),'외심 도형 계산');assert.equal(await a.getByLabel('공동 유형 기준').count(),0);
  await b.screenshot({path:path.join(directory,'mobile-review.png'),fullPage:true});await a.screenshot({path:path.join(directory,'pc-approved.png'),fullPage:true});console.log('PASS local browser review persistence and cross-account reviewer visibility',directory);
 }finally{await browser?.close();if(web)await new Promise(resolve=>web.close(resolve));await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
