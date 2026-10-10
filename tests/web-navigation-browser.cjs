const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/web-navigation'),site=path.join(out,'site'),model=require('../app/bank-exam-model.cjs');
const user={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',email:'ui@example.test',aud:'authenticated',role:'authenticated'};
const names=['가중','나중','다중','라중','마중','바중','사중','아중','자중','차중','하중'];
const sources=names.map((school,i)=>({source_id:'s'+i,source:{school,academicYear:'1999',grade:'중2'},question_count:2,reviewed_count:2,updated_at:'2099-01-01',last_registered_at:i===10?null:`2026-01-${String(i+1).padStart(2,'0')}`,difficulty:{total:2,numericCount:2,average:5,confirmedCount:2}})).reverse();
sources.push({...sources.find(s=>s.source.school==='가중'),source_id:'new-ga',last_registered_at:'2026-10-10'});
const questions=Array.from({length:68},(_,i)=>({question_id:'q'+i,revision_id:'r'+i,visibility:'approved',confirmed:{difficulty:i<60?9:i<62?8:i<65?5:2},metadata:{source:{school:i%2?'나중':'가중',grade:'중2',originalNumber:String(i+1)},difficulty:{},classification:{}},content:{body:i%2?'도형 문항':'대수 문항'},files:[]}));
async function main(){
 let browser;const errors=[],calls=[],summary=model.difficultySummary(questions),result={checks:[],viewports:[],productionWrites:0};
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(site,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');fs.createReadStream(file).pipe(res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
 const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext();await context.addInitScript(user=>{const jwt=btoa('{}')+'.'+btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600}))+'.test';sessionStorage.setItem('sb-test-project-auth-token',JSON.stringify({access_token:jwt,refresh_token:'test-only',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user}));},user);
 await context.route('https://test-project.supabase.co/**',async route=>{const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop(),args=req.postDataJSON()||{};calls.push(name);let data=[];
  if(url.pathname==='/auth/v1/user')data=user;
  else if(name==='bank_join')data={role:'teacher'};
  else if(name==='bank_home_summary')data={dashboard:{summaryVersion:'stored-web-v1',questions:questions.length,sourceExams:sources.length,schools:11,pending:0,difficulty:summary},recentSchools:[],recentSources:[]};
  else if(name==='bank_school_sources')data=sources;
  else if(name==='bank_source_progress_get')data={status:'unknown',version:0};
  else if(name==='bank_search_current'){const all=args.filters?.text?questions.filter(q=>q.content.body.includes(args.filters.text)):questions;data=all.slice(args.start_at,args.start_at+50);}
  else if(!['bank_rating_samples','bank_mock_list','bank_source_questions','bank_catalog','bank_revisions'].includes(name))throw Error('Unexpected request: '+url.pathname);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);const origin='http://127.0.0.1:'+server.address().port;
 await page.goto(origin);await page.locator('.home-killer-stat').waitFor();
 for(const width of [390,1280]){await page.setViewportSize({width,height:900});const buttons=page.locator('.home-primary-actions button');assert.deepEqual(await buttons.locator('strong').allTextContents(),['시험지 만들기','기출문제 복원하기','실전모의고사 출제하기']);assert.equal(await page.locator('.home-action').filter({has:page.getByText('실전모의고사 출제하기',{exact:true})}).count(),1);const a=await buttons.nth(1).boundingBox(),b=await buttons.nth(2).boundingBox();assert(b.y>=a.y+a.height);await page.screenshot({path:path.join(out,'home-'+width+'.png'),fullPage:true});result.viewports.push(width);}
 await page.locator('.home-action').filter({has:page.getByText('실전모의고사 출제하기',{exact:true})}).click();await page.getByRole('button',{name:'새 실전모의고사 출제하기',exact:true}).waitFor();assert(page.url().endsWith('#mock-exams'));result.checks.push('single moved button retains mock route on desktop/mobile');
 const home=async()=>{await page.locator('.brand').click();await page.locator('.home-stat').first().waitFor();};
 for(const [label,expected]of [['원본 시험지','가중'],['기출 등록 학교','가중'],['원본 시험지','가중']]){
  await page.setViewportSize({width:label==='원본 시험지'?390:1280,height:900});await home();const before=calls.length;await page.locator('.home-stat').filter({hasText:label}).click();await page.locator('.school-source-list details').first().waitFor();assert.equal(await page.locator('.school-source-list details').count(),10);assert.equal(await page.locator('.school-source-list details[open]').count(),10);assert.equal(await page.locator('.school-source-list summary').first().innerText(),expected);
  assert.equal(await page.locator('.school-source-list summary').nth(1).innerText(),label==='기출 등록 학교'?'차중':'나중');const rows=page.locator('.school-source-list details').first().locator('button');await rows.first().waitFor();const firstHref=await rows.count();assert.equal(firstHref,2);assert.deepEqual(calls.slice(before),['bank_school_sources']);
  await page.locator('.school-source-list summary').first().click();assert.equal(await page.locator('.school-source-list details[open]').count(),9);await page.getByRole('button',{name:'다음 페이지',exact:true}).click();assert.equal(await page.locator('.school-source-list details[open]').count(),1);assert.equal(await page.locator('.school-source-list summary').innerText(),'하중');await page.getByRole('button',{name:'이전 페이지',exact:true}).click();assert.equal(await page.locator('.school-source-list details[open]').count(),10);
 }
 result.checks.push('11 schools: 10/1, expanded each page, route separation, metadata-only list');
 await page.locator('.school-source-list details button').first().click();await page.getByRole('heading',{name:'원본 시험지 문항',exact:true}).waitFor();result.checks.push('existing source opening route retained');
 await home();assert.equal(await page.locator('.home-killer-stat strong').innerText(),'60');await page.getByRole('button',{name:'킬러 60문항 보기',exact:true}).click();await page.getByText(/전체 60문항/).waitFor();assert.equal(await page.getByLabel('상·중·하 분류',{exact:true}).inputValue(),'killer');
 await page.getByRole('button',{name:'다음 50개',exact:true}).click();await page.getByText(/51번째부터/).waitFor();await page.getByLabel('상·중·하 분류',{exact:true}).selectOption('low');await page.getByText(/전체 3문항/).waitFor();assert.equal(await page.getByRole('button',{name:'이전 50개',exact:true}).count(),0);
 for(const [band,total]of [['middle',3],['high',62],['killer',60]]){await page.getByLabel('상·중·하 분류',{exact:true}).selectOption(band);await page.getByText(new RegExp('전체 '+total+'문항')).waitFor();}
 await page.getByLabel('학교',{exact:true}).selectOption('가중');await page.getByLabel('검색어',{exact:true}).fill('대수');await page.getByRole('button',{name:'검색',exact:true}).click();await page.getByText(/전체 30문항/).waitFor();await page.getByLabel('검색어',{exact:true}).fill('없는내용');await page.getByRole('button',{name:'검색',exact:true}).click();await page.getByText('조건에 맞는 문항이 없습니다. 검색 조건이나 현재 계정을 확인하세요.').waitFor();
 await page.getByRole('button',{name:'난이도 필터 해제',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="상·중·하 분류"]').value===''&&document.querySelector('.search-form')?.getAttribute('aria-busy')==='false');assert.equal(await page.getByLabel('검색어',{exact:true}).inputValue(),'없는내용');assert.equal(await page.getByLabel('학교',{exact:true}).inputValue(),'가중');
 await home();await page.getByRole('button',{name:'킬러 60문항 보기',exact:true}).click();await page.getByText(/전체 60문항/).waitFor();result.checks.push('killer count/filter 60, existing bands, reset page, search/school combination, empty state and clear');assert.deepEqual(errors,[]);result.errors=errors;fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
