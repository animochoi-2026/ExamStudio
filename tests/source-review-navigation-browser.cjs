// Full application navigation with synthetic auth/data; no live service requests.
// Build with build-bank-web.cjs first. Optional --live checks the deployed assets.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const out=path.resolve('artifacts/school-review-button'),dist=path.join(out,'release-web'),live=process.argv.includes('--live');
const base='https://examstudio-shared-bank.pages.dev',config=JSON.parse(fs.readFileSync(path.join(dist,'config.json')));
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',member={role:'teacher',roleVersion:1,status:'approved'};
const rows=Array.from({length:55},(_,i)=>{const n=55-i;return {question_id:'q'+n,revision_id:'r'+n,visibility:'shared_pending',content:{body:'검증 문항 '+n},metadata:{source:{school:'대명중',region:'강남구',grade:'중2',academicYear:'2026',semester:'2학기',exam:'중간고사',originalNumber:String(n)},difficulty:{},reviews:n===2||n===52?{answer:{status:'needs_review'}}:{}},confirmed:{}};});
// An acknowledged warning and an approved question must not enter the needed list.
rows.find(c=>c.question_id==='q3').metadata.reviews={answer:{status:'failed'}};
rows.find(c=>c.question_id==='q3').visibility='approved';
const acknowledged=rows.find(c=>c.question_id==='q4');acknowledged.metadata.reviews={answer:{status:'failed'}};
acknowledged.confirmed.uploadReview={revisionId:'r4',evidence:{reviews:acknowledged.metadata.reviews,management:{}},reasons:['정답 확인 필요']};
const source={source_id:'fixture-source',source:rows[0].metadata.source,question_count:55,reviewed_count:1,registration_state:'user_confirmed',progress:{expected_count:55,status:'complete'},contributors:[]};
const blobs=new Map();for(const c of rows){const q={id:c.question_id,body:c.content.body,answer:'1',solution:'검증 풀이'};const b=Buffer.from(JSON.stringify({schemaVersion:1,questionId:c.question_id,revisionId:c.revision_id,files:[],native:{targetQuestionId:q.id,project:{problems:[{original:q}]}}}));const id='f-'+c.revision_id;blobs.set(id,b);c.files=[{id,role:'data',size:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')}];}
const results=[],errors=[],blocked=[];
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [390,1280])for(const entry of ['schools','schools-name'])for(const empty of [false,true]){
  const ctx=await browser.newContext({viewport:{width,height:900}}),calls=[];
  await ctx.addInitScript(({uid,host})=>{const enc=x=>btoa(JSON.stringify(x)),expiry=Math.floor(Date.now()/1000)+3600;
   sessionStorage.setItem('sb-'+host.split('.')[0]+'-auth-token',JSON.stringify({access_token:enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:uid,exp:expiry,aud:'authenticated',role:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:3600,expires_at:expiry,user:{id:uid,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated'}}));sessionStorage.setItem('bank-grade:'+uid,'m2');
  },{uid,host:new URL(config.url).hostname});
  await ctx.route('**/*',async r=>{const u=new URL(r.request().url()),p=u.pathname,json=x=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(x)});
   if(u.origin===base&&r.request().method()==='GET'){
    if(live)return r.continue();const f=path.join(dist,p==='/'?'index.html':decodeURIComponent(p));
    if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});
   }
   if(u.origin===config.url){
    if(p.startsWith('/rest/v1/rpc/')){const n=p.split('/').at(-1),a=r.request().postDataJSON()||{};calls.push({name:n,args:a});
     if(n==='bank_join'||n==='bank_access_context')return json(member);
     if(n==='bank_home_summary')return json({dashboard:{summaryVersion:'stored-web-v1',questions:55,sourceExams:1,schools:1,pending:2,difficulty:{total:55,counts:{low:0,middle:0,high:0,unknown:55},killerCount:0}},recentSchools:['대명중'],recentSources:[]});
     if(n==='bank_source_list_page')return json({page:0,pages:1,total:1,exam_count:1,options:{years:['2026'],districts:[{value:'강남구',label:'강남구'}]},items:a.mode==='schools'?[{school:'대명중',region:'강남구',exams:[source]}]:[source]});
     if(n==='bank_source_progress_get')return json({expected_count:55,status:'complete',version:1});
     if(n==='bank_source_questions')return json(rows.slice(a.start_at,a.start_at+50).map(c=>empty?{...c,visibility:'approved'}:c));
     if(['bank_rating_samples','bank_question_sets_get'].includes(n))return json([]);
    }
    if(p==='/rest/v1/bank_school_regions')return json([{name:'대명중',school_key:'강남구|대명중',district:'강남구',province:'서울특별시',status:'verified'}]);
    if(p==='/rest/v1/bank_catalog'){const id=(u.searchParams.get('revision_id')||'').replace(/^eq\./,'');return json(rows.find(c=>c.revision_id===id));}
    if(p==='/rest/v1/bank_entries'){const id=(u.searchParams.get('id')||'').replace(/^eq\./,''),b=blobs.get(id);if(b)return json({id,verified:true,size:b.length,chunks:1,sha256:crypto.createHash('sha256').update(b).digest('hex')});}
    if(p==='/functions/v1/bank-storage'){const a=r.request().postDataJSON();return json({provider:'r2',url:'https://fixture.r2.cloudflarestorage.com/'+a.key.split('/').at(-2)});}
    if(p.startsWith('/storage/v1/object/')){const b=blobs.get(p.split('/').at(-2));if(b)return r.fulfill({body:b});}
   }
   if(u.hostname==='fixture.r2.cloudflarestorage.com'){const b=blobs.get(p.slice(1));if(b)return r.fulfill({body:b});}
   blocked.push({path:p,host:u.hostname,method:r.request().method()});return r.abort();
  });
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await page.goto(base+'/#home');
  await page.locator('.home-stat').filter({hasText:entry==='schools'?'기출 등록 학교':'원본 시험지'}).click();
  await page.locator('.school-source-list .recent-row').click();
  const needed=page.getByRole('button',{name:'검수 필요 문항 '+(empty?0:2),exact:true}),all=page.getByRole('button',{name:'모든 문항 55',exact:true});
  await needed.waitFor();assert(await needed.isVisible());assert.equal(await needed.isDisabled(),empty);
  assert.deepEqual(calls.filter(c=>c.name==='bank_source_questions').map(c=>c.args.start_at),[0,50]);
  const numbers=()=>page.locator('.cards .source-line').allTextContents();
  if(!empty){assert.equal(await needed.getAttribute('aria-pressed'),'true');assert.deepEqual((await numbers()).map(t=>t.match(/원문 (\d+)번/)[1]),['2','52']);}
  else{assert.equal(await all.getAttribute('aria-pressed'),'true');assert.match(await page.locator('.source-review-caption').innerText(),/검수가 필요한 문항이 없습니다/);}
  const bounds=await page.locator('.source-review-heading').evaluate(el=>{const b=el.querySelector('.actions').getBoundingClientRect(),r=el.getBoundingClientRect(),next=el.parentElement.querySelector('details.panel').getBoundingClientRect();return {rightGap:r.right-b.right,bottom:b.bottom,progressTop:next.top,overflow:document.documentElement.scrollWidth>innerWidth};});
  assert(bounds.rightGap<3);assert(bounds.bottom<=bounds.progressTop);assert.equal(bounds.overflow,false);
  await page.screenshot({path:path.join(out,`${live?'live':'local'}-${entry}-${width}-${empty?'none':'needed'}.png`)});
  await all.click();assert.equal(await page.locator('.cards .card').count(),50);assert.match((await numbers())[0],/원문 1번/);
  await page.getByRole('button',{name:'다음 문항',exact:true}).click();assert.equal(await page.locator('.cards .card').count(),55);assert.match((await numbers())[54],/원문 55번/);
  if(!empty){await needed.click();assert.equal(await page.locator('.cards .card').count(),2);assert.equal(await page.getByRole('button',{name:'다음 문항',exact:true}).isVisible(),false);}
  await page.getByRole('button',{name:'시험지 목록',exact:true}).click();assert.equal(new URL(page.url()).hash,'#'+entry);
  results.push({width,entry,needed:empty?0:2,all:55,pagesFetched:2,headerBounds:bounds,returnedToList:true});await ctx.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);fs.writeFileSync(path.join(out,`${live?'live':'local'}-browser.json`),JSON.stringify({results,errors,blocked,productionApiRequests:0,productionWrites:0,realLogin:false},null,2));console.log(JSON.stringify(results));
 }finally{await browser.close();}})().catch(e=>{console.error(e);console.error(JSON.stringify({errors,blocked}));process.exitCode=1;});
