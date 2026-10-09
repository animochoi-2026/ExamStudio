const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {SharedBankAuth}=require('../app/shared-bank-auth.cjs'),{QuestionBank}=require('../app/question-bank.cjs');
test('web Supabase RPC preserves 409 and makes exactly one HTTP attempt',async()=>{
 let calls=0;const {createClient}=require('@supabase/supabase-js');const client=createClient('https://fixture.supabase.co','fixture-public',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>{calls++;return Response.json({code:'PT409',message:'수정 충돌'},{status:409});}}});
 const {error,status}=await client.rpc('bank_finish',{});assert.equal(status,409);assert.equal(error.code,'PT409');assert.equal(calls,1);
});
test('Edge preserves actual PT409 HTTP status; desktop never retries conflicts',async()=>{
 let handler,rpcCalls=0;const f='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',user={id:'teacher',email_confirmed_at:'yes'},bytes=Buffer.from('fixture');
 await require('./edge-verifier-fixture.cjs').loadVerifier({Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://test.supabase.co':'test'},serve:fn=>handler=fn},fetch:async u=>{
  if(u.includes('/auth/'))return Response.json(user);
  if(u.includes('/bank_entries'))return Response.json([{id:f,owner_id:'teacher',kind:'file',props:{role:'asset'},space_id:'test',size:bytes.length,chunks:1,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),md5:crypto.createHash('md5').update(bytes).digest('hex')}]);
  if(u.includes('/storage/'))return new Response(bytes);
  rpcCalls++;return Response.json({code:'PT409',message:'수정 충돌: fixture'},{status:409});
 },Response,Request,TextDecoder,Uint8Array,JSON,Error,Math,String,Set});
 const r=await handler(new Request('https://test/functions',{method:'POST',body:JSON.stringify({id:f})}));assert.equal(r.status,409);assert.equal((await r.json()).code,'PT409');assert.equal(rpcCalls,1);
 const auth=new SharedBankAuth({directory:os.tmpdir(),fetchImpl:async()=>Response.json({code:'PT409',error:'수정 충돌: fixture'},{status:409})});auth.config=()=>({url:'https://test.supabase.co',publishableKey:'public'});
 await assert.rejects(auth.request('/functions/v1/bank-verify',{method:'POST',body:{id:f}}),e=>e.code==='conflict'&&!e.retryable);
 auth.fetch=async()=>Response.json({message:'busy'},{status:503});await assert.rejects(auth.request('/rest/v1/rpc/test'),e=>e.code==='failed'&&e.retryable);
});
test('conflict queue survives restart and cannot resume the stale request',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bank-conflict-')),auth={status:()=>({}),cancel(){}};let calls=0;
 const b=new QuestionBank({directory:dir,auth});b.wake=()=>{};b.state.jobs.push({id:'r',revisionId:'r',parentRevisionId:null,questionId:'q',status:'queued',attempts:0});b.process=async()=>{calls++;throw Object.assign(Error('수정 충돌'),{code:'conflict',retryable:true});};await b.pump();assert.equal(b.state.jobs[0].status,'conflict');await b.pump();assert.equal(calls,1);b.close();
 const next=new QuestionBank({directory:dir,auth});assert.equal(next.state.jobs[0].status,'conflict');assert.throws(()=>next.retry('r'),/같은 기준/);next.pause('r');assert.throws(()=>next.retry('r'),/같은 기준/);next.close();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
});
test('PostgREST statement timeout stops the queue; retries are explicit and bounded',async t=>{
 const response=Response.json({code:'57014',message:'canceling statement due to statement timeout'},{status:500});
 const authRequest=new SharedBankAuth({directory:os.tmpdir(),fetchImpl:async()=>response.clone()});
 authRequest.config=()=>({url:'https://test.supabase.co',publishableKey:'public'});
 await assert.rejects(authRequest.request('/rest/v1/bank_entries'),e=>e.code==='timeout'&&!e.retryable);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bank-timeout-')),auth={status:()=>({}),cancel(){}};
 const bank=new QuestionBank({directory:dir,auth});bank.wake=()=>{};
 for(let n=0;n<3;n++)bank.state.jobs.push({id:'r'+n,revisionId:'r'+n,questionId:'q'+n,status:'queued',attempts:0});
 let calls=0;bank.process=async()=>{calls++;throw Object.assign(Error('canceling statement due to statement timeout'),{code:'timeout'});};
 await bank.pump();assert.equal(calls,1);assert.deepEqual(bank.state.jobs.map(j=>j.status),['failed','paused','paused']);
 assert.deepEqual(bank.state.jobs.map(j=>j.attempts),[1,0,0]);
 assert.equal(bank.retryTimedOut(1).retried,1);await bank.pump();assert.equal(calls,2);
 assert.equal(bank.retryTimedOut('all').retried,3);await bank.pump();assert.equal(calls,3);
 bank.close();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
});
test('older failed uploads are preserved but cannot overwrite a newer retry for the same question',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bank-timeout-versions-')),auth={status:()=>({}),cancel(){}};
 const bank=new QuestionBank({directory:dir,auth});bank.wake=()=>{};
 for(let n=0;n<4;n++)bank.state.jobs.push({id:'r'+n,revisionId:'r'+n,questionId:'same',parentRevisionId:null,status:'failed',error:'canceling statement due to statement timeout'});
 assert.deepEqual(bank.status().jobs.map(j=>j.superseded),[true,true,true,false]);
 assert.throws(()=>bank.retry('r0'),/오래된 실패본/);
 assert.equal(bank.retryTimedOut('all').retried,1);
 assert.deepEqual(bank.state.jobs.map(j=>j.status),['failed','failed','failed','queued']);
 bank.close();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
});
