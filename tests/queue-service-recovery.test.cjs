'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ExamQueue,summary}=require('../app/exam-queue.cjs'),F=require('../app/operation-failure.cjs');
function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'queue-service-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const store={get:()=>({problems:[]})},q=new ExamQueue({directory,store});q.state.items.push({id:'q',status:'pending',steps:{},metadata:{numbering:{}},discoveryIssues:[],move:{}});q.action('resume');return {q,directory,store};}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const until=async fn=>{for(let i=0;!fn();i++){assert.ok(i<1000,'wait timed out');await new Promise(r=>setTimeout(r,2));}};
test('structured exhaustion differs from 429, review, unknown and model errors; secrets redacted',()=>{
 for(const error of [{codexErrorInfo:'usageLimitExceeded'},{codexErrorInfo:'UsageLimitExceeded'},{code:'insufficient_quota'}])assert.equal(F.classify(error).category,'usage');
 assert.equal(F.classify({status:429,message:'quota maybe?'}).category,'rate');assert.equal(F.classify(Error('quota')).category,'item');
 assert.equal(F.classify(Error('원문 판독을 확인한 뒤 정답·풀이를 작성할 수 있습니다.')).category,'review');
 assert.equal(F.classify(Error(JSON.stringify({status:400,error:{type:'invalid_request_error',message:'model is not supported'}}))).category,'configuration');
 assert.equal(F.classify({codexErrorInfo:{httpConnectionFailed:{httpStatusCode:503}}}).category,'service');
 assert.equal(F.classify({codexErrorInfo:'Unauthorized'}).category,'login');
 assert.doesNotMatch(F.message('refresh_token="my-secret" Bearer abcdef'),/my-secret|abcdef/);
});
test('parallel exhaustion closes admission before slot release, saves inflight successes, resumes missing stage only',async t=>{
 const {q,directory,store}=fixture(t);q.action('limits',null,{aiConcurrency:2});const a=deferred(),b=deferred();let calls=0;
 const bridge=q.bridge({run:async request=>{calls++;return request.text==='a'?a.promise:b.promise;}});
 const run=k=>q.stage('q',k+':solve','solve',{k},()=>bridge.run({text:k}),()=>true);
 const work=['a','b','c','d'].map(run);await until(()=>calls===2);a.reject(Object.assign(Error('exhausted'),{codexErrorInfo:'UsageLimitExceeded'}));await until(()=>q.state.mode==='paused');b.resolve({result:'saved'});await Promise.all(work);
 assert.equal(calls,2);assert.equal(q.item('q').steps['a:solve'].status,'waiting_usage');assert.equal(q.item('q').steps['b:solve'].status,'complete');assert.equal(q.item('q').steps['c:solve'].status,'pending');
 const reopened=new ExamQueue({directory,store});reopened.action('resume');const next=reopened.bridge({run:async()=>{calls++;return {result:'new'};}});
 await reopened.stage('q','b:solve','solve',{k:'b'},()=>assert.fail('completed stage rerun'),()=>true);
 await reopened.stage('q','a:solve','solve',{k:'a'},()=>next.run({text:'a'}),result=>!!result);assert.equal(calls,3);assert.equal(reopened.item('q').steps['a:solve'].status,'complete');
});
test('bank login wait gates only uploads, preserves complete stages and resumes with commit lookup',async t=>{
 const {q}=fixture(t);let uploads=0,lookups=0;
 await q.stage('q','a:upload','upload',{},()=>{uploads++;throw Object.assign(Error('Invalid Refresh Token: Already Used'),{code:'auth',service:'supabase'});},()=>false);
 assert.equal(q.state.mode,'running');assert.equal(q.item('q').steps['a:upload'].status,'waiting_login');
 await q.stage('q','b:solve','solve',{},async()=>({kept:true}),()=>true);assert.equal(q.item('q').steps['b:solve'].status,'complete');
 await q.stage('q','b:upload','upload',{},()=>assert.fail('blocked upload dispatched'),()=>false);
 q.action('resume');await q.stage('q','a:upload','upload',{},()=>assert.fail('remote success must not be uploaded again'),()=>{lookups++;return true;});
 assert.equal(uploads,1);assert.equal(lookups,1);assert.equal(q.item('q').steps['a:upload'].status,'complete');
});
test('item review continues others; bulk retry and resume never release review/unknown holds',async t=>{
 const {q}=fixture(t);await q.stage('q','a:solve','solve',{},()=>{throw Error('원문 판독을 확인하세요.');},()=>false);
 await q.stage('q','b:solve','solve',{},async()=>42,()=>true);assert.equal(q.state.mode,'running');assert.equal(q.item('q').steps['b:solve'].status,'complete');
 q.item('q').steps['c:solve']={kind:'solve',status:'unknown',responses:[]};q.action('retry','q');q.action('resume');assert.equal(q.item('q').steps['a:solve'].status,'held');assert.equal(q.item('q').steps['c:solve'].status,'unknown');
});
test('legacy recovery is idempotent, leaves removed items and exact review holds, mutually exclusive counts',t=>{
 const {q,directory,store}=fixture(t),item=q.item('q');item.steps={'a:upload':{kind:'upload',status:'held',reason:'Invalid Refresh Token: Already Used'},'b:solve':{kind:'solve',status:'held',reason:'원문 판독을 확인하세요.'},'b:upload':{kind:'upload',status:'failed',reason:'bad input'}};q.save();
 const next=new ExamQueue({directory,store});assert.equal(next.item('q').steps['a:upload'].status,'waiting_login');assert.equal(next.item('q').steps['b:solve'].status,'held');const before=JSON.stringify(next.item('q').steps);next.recoverServiceWaits();assert.equal(JSON.stringify(next.item('q').steps),before);
 const s=summary(next.item('q'),{problems:[{id:'a'},{id:'b'},{id:'c'}]});assert.equal(s.waitingLogin,1);assert.equal(s.failedQuestions,1);assert.equal(s.heldQuestions,0);assert.equal(s.pendingQuestions,1);
});
test('resume clears old service banner and starting a pending item never displays an obsolete failure',t=>{
 const {q}=fixture(t),i=q.item('q');i.status='waiting';i.reason='AI 설정 확인 필요';i.steps['page:1']={kind:'regions',status:'waiting_service',reason:'old model error'};
 q.action('resume');assert.equal(i.reason,null);assert.equal(i.steps['page:1'].status,'pending');i.reason='old message';q.next();assert.equal(i.reason,null);assert.equal(i.status,'running');
});
test('authorized deferred web review recovers source-review holds and type failures only',t=>{
 const {q,directory,store}=fixture(t);const item=q.item('q');item.status='held';item.steps={'a:recognition':{kind:'recognition',status:'complete'},'a:solve':{kind:'solve',status:'held',reason:'원문 판독을 확인한 뒤 정답·풀이를 작성할 수 있습니다.'},'b:solve':{kind:'solve',status:'unknown'},'c:analysis':{kind:'analysis',status:'complete'},'c:upload':{kind:'upload',status:'failed',failure:{code:'detailed_type_required'}}};q.save();
 fs.writeFileSync(path.join(directory,'queue-review-policy.json'),JSON.stringify({version:1,mode:'approve_then_web_review'}));const next=new ExamQueue({directory,store});
 assert.equal(next.autoReview,true);assert.equal(next.item('q').steps['a:recognition'].status,'complete');assert.equal(next.item('q').steps['a:solve'].status,'pending');assert.equal(next.item('q').steps['b:solve'].status,'unknown');assert.equal(next.item('q').steps['c:analysis'].status,'pending');assert.equal(next.item('q').steps['c:upload'].status,'pending');
});
test('pre-dispatch network retry bounded; uncertain result never retried automatically',async t=>{
 const {q}=fixture(t);q.action('limits',null,{maxRetries:2});let calls=0;const bridge=q.bridge({run:async()=>{calls++;throw Object.assign(Error('network'),{code:'ECONNRESET',dispatched:false,retryAfterMs:1});}});
 await q.stage('q','a:solve','solve',{},()=>bridge.run({text:'a'}),()=>true);assert.equal(calls,3);assert.equal(q.item('q').steps['a:solve'].status,'waiting_service');
 q.action('resume');const uncertain=q.bridge({run:async()=>{calls++;throw Object.assign(Error('lost acknowledgement'),{code:'response_unknown'});}});await q.stage('q','b:solve','solve',{},()=>uncertain.run({text:'b'}),()=>false);
 q.action('resume');await q.stage('q','b:solve','solve',{},()=>assert.fail('uncertain replay'),()=>false);assert.equal(calls,4);
});
