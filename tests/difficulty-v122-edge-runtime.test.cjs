'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const C=require('../app/difficulty-v122/canonical.cjs'),P=require('../app/difficulty-v122/policy.cjs');
const Input=require('../app/difficulty-v122/input.cjs'),Native=require('../app/difficulty-v122/native-source.cjs');
const versions=require('../app/difficulty-v122/candidate-versions.json').versions;
const {wireFixture:fixture}=require('./difficulty-v122-entrypoints.test.cjs');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||process.env.EXAMSTUDIO_TEST_OUTPUT||path.join(root,'artifacts/difficulty-v122-rc1'));
async function harness(engine,mode='normal'){
 const qid='11111111-1111-4111-8111-111111111111',rid='22222222-2222-4222-8222-222222222222',jid='33333333-3333-4333-8333-333333333333';
 const solution='1. Required relation\nThe given angle determines the required angle.';
 const question={id:'native-q',body:'Find the angle.',choices:[],solution,answer:'confirmed'};
 const bytes=Buffer.from(JSON.stringify({questionId:qid,revisionId:rid,native:{targetQuestionId:question.id,project:{
  scope:{grade:'중학교 2학년'},problems:[{original:question,variants:[],cropPaths:[]}]}}}));
 const catalog={question_id:qid,revision_id:rid,space_id:'space',content:{solution},
  metadata:{reviews:{solution:{status:'approved'}}},files:[{id:'native-file',role:'data',size:bytes.length,sha256:C.bytesHash(bytes)}]};
 const prepared=Input.prepare(await Native.fromNative(catalog,JSON.parse(bytes),async()=>bytes));
 const job={id:jid,space_id:'space',actor:'user',kind:'full',status:'approved',version:0,calls:0,retries:0,
  policy:{model_policy_version:P.model_policy_version,criteria_payload_hash:versions.criteria_payload_hash},approval:{maxCalls:3}};
 const item={id:'item',question_id:qid,revision_id:rid,state:{status:'pending'}};
 const posts=[],polls=[],writes=[];let lease=null;
 const fetchImpl=async(url,options={})=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'user',email_confirmed_at:'2026-01-01'});
  if(url.endsWith('/rpc/bank_v12_access'))return Response.json(true);
  if(url.includes('/bank_catalog?'))return Response.json([catalog]);
  if(url.includes('/bank_revisions?'))return Response.json([{id:rid,parent_id:null}]);
  if(url.endsWith('/rpc/bank_v12_service')){
   const {op,v}=JSON.parse(options.body);
   if(op==='status')return Response.json(job);
   if(op==='claim'){
    if(lease||!['pending','processing','submitting'].includes(item.state.status))return Response.json(null);
    lease='lease';return Response.json({lease,job,item});
   }
   if(op==='checkpoint'){
    assert.equal(v.lease,lease);assert.equal(v.expected,job.version);
    assert(v.calls>=job.calls&&v.calls<=job.approval.maxCalls);
    writes.push(op);item.state=structuredClone(v.state);job.version++;job.calls=v.calls;
    return Response.json(null);
   }
   if(op==='release'){assert.equal(v.lease,lease);lease=null;return Response.json(null);}
   throw Error('unapproved mock DB operation '+op);
  }
  if(url.startsWith('https://api.openai.com/v1/responses')){
   if(options.method==='POST'){
    const request=JSON.parse(options.body);posts.push({id:options.headers['Idempotency-Key'],request});
    assert.equal(new Set(posts.map(p=>p.id)).size,posts.length);
    if(mode==='unknown')throw Error('mock lost response');
    if(mode==='background')return Response.json({id:'resp_saved',status:'queued',model:request.model});
   }else polls.push(url);
   const n=posts.length,binding=posts.at(-1).request;
   const raw=mode==='escalate'&&n<3?{}:fixture(prepared);
   return Response.json({id:'resp_'+n,model:binding.model,status:'completed',output_text:JSON.stringify(raw),usage:{input_tokens:1,output_tokens:1}});
  }
  throw Error('unexpected network URL '+url);
 };
 const handler=engine.handler({env:k=>({SUPABASE_URL:'https://mock.invalid',SUPABASE_ANON_KEY:'mock-anon',
  SUPABASE_SERVICE_ROLE_KEY:'mock-service',OPENAI_API_KEY:'mock-provider',
  DIFFICULTY_V122_STAGING_ENABLED:'true'}[k]),fetchImpl,readFile:async()=>bytes});
 const request=async(policy=P.model_policy_version)=>{
  const r=await handler(new Request('https://mock.invalid/evaluate',{method:'POST',
   headers:{authorization:'Bearer mock-user','content-type':'application/json'},
   body:JSON.stringify({action:'evaluate',id:jid,model_policy_version:policy})}));
  return {http:r.status,value:await r.json()};
 };
 return {request,job,item,posts,polls,writes};
}
async function main(){
 const {default:engine}=await import(pathToFileURL(path.join(root,'supabase/functions/bank-difficulty-v12/engine.mjs')).href);
 const checks=[];
 const check=async(name,fn)=>{try{await fn();checks.push({name,pass:true});}catch(e){checks.push({name,pass:false,error:e.message});throw e;}};
 try{
  await check('actual Edge bundle runs canonical evaluator without runtime injection',async()=>{
   const h=await harness(engine),r=await h.request();
   assert.equal(r.http,200);assert.equal(r.value.result.status,'complete');
   assert.equal(r.value.result.criteria_payload_hash,versions.criteria_payload_hash);
   assert.equal(h.posts.length,1);assert.equal(h.posts[0].request.model,'gpt-6-luna');
   assert.equal(h.posts[0].request.reasoning.effort,'medium');
  });
  await check('background response is polled from durable ID without duplicate POST',async()=>{
   const h=await harness(engine,'background');
   assert.equal((await h.request()).value.reason,'response_processing');
   assert.equal((await h.request()).value.result.status,'complete');
   await h.request();assert.equal(h.posts.length,1);assert.equal(h.polls.length,1);
  });
  await check('unknown submission remains unresolved and is never resubmitted',async()=>{
   const h=await harness(engine,'unknown');
   assert.equal((await h.request()).value.result.status,'unresolved');
   await h.request();assert.equal(h.posts.length,1);assert.equal(h.polls.length,0);
  });
  await check('persisted structural failures route medium then high through same evaluator',async()=>{
   const h=await harness(engine,'escalate');
   assert.equal((await h.request()).value.reason,'next_stage_ready');
   assert.equal((await h.request()).value.reason,'next_stage_ready');
   assert.equal((await h.request()).value.result.status,'complete');
   assert.deepEqual(h.posts.map(x=>[x.request.model,x.request.reasoning.effort]),
    [['gpt-6-luna','medium'],['gpt-6.1-sol','medium'],['gpt-6.1-sol','high']]);
  });
  await check('old policy cannot create a checkpoint or model request',async()=>{
   const h=await harness(engine),r=await h.request('old');
   assert.equal(r.value.reason,'difficulty_policy_upgrade_required');assert.equal(h.posts.length,0);assert.equal(h.writes.length,0);
  });
 }catch{process.exitCode=1;}
 const report={at:new Date().toISOString(),checks,passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length,
  actualNetworkRequests:0,actualAIcalls:0,productionWrites:0,computerUse:0};
 fs.writeFileSync(path.join(out,'edge-runtime-integration.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={harness};
