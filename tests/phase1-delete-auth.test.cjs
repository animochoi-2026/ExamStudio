'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/bank-delete-question/index.ts'),'utf8');
function handler(fetch){let run;vm.runInNewContext(stripTypeScriptTypes(source),{Deno:{env:{get:key=>({SUPABASE_URL:'https://local.test',SUPABASE_ANON_KEY:'public-anon'})[key]},serve:fn=>{run=fn;}},fetch,Response,Request,JSON,Error,String});return run;}
const body={questionId:'11111111-1111-4111-8111-111111111111',token:'a'.repeat(32)};
const request=token=>new Request('https://local.test/delete',{method:'POST',headers:token?{Authorization:'Bearer '+token}:{},body:JSON.stringify(body)});
test('delete function explicitly disables gateway legacy JWT validation and authenticates before privileged RPC',async()=>{
 const config=fs.readFileSync(path.join(__dirname,'../supabase/config.toml'),'utf8');assert.match(config,/\[functions\.bank-delete-question\][\s\S]*?verify_jwt\s*=\s*false/);
 let calls=0;const run=handler(async()=>{calls++;return Response.json({error:'invalid'},{status:401});});
 assert.equal((await run(request(null))).status,401);assert.equal(calls,0);
 for(const token of ['invalid','expired','anonymous-public-key'])assert.equal((await run(request(token))).status,401);
 assert.equal(calls,3,'only Auth is reached; no deletion RPC or Storage');
 for(const user of [{id:'user',email_confirmed_at:null},{id:'user',email_confirmed_at:'date',is_anonymous:true},{}]){
  let n=0;const denied=handler(async url=>{n++;assert.equal(url,'https://local.test/auth/v1/user');return Response.json(user);});assert.equal((await denied(request('caller'))).status,403);assert.equal(n,1);
 }
});
test('authenticated delete forwards the same caller JWT through Auth, claim, Storage and finish',async()=>{
 const routes=[],caller='synthetic-asymmetric-caller-token';
 const run=handler(async(url,options)=>{routes.push(url);assert.equal(options.headers.Authorization,'Bearer '+caller);assert.equal(options.headers.apikey,'public-anon');
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner',email_confirmed_at:'date'});
  if(url.endsWith('_claim'))return Response.json({complete:false,spaceId:'space',files:[{id:'file',chunks:2}]});
  if(url.includes('/storage/')){assert.equal(options.method,'DELETE');assert.deepEqual(JSON.parse(options.body),{prefixes:['space/file/000','space/file/001']});return Response.json([]);}
  assert.ok(url.endsWith('_finish'));return new Response(null,{status:204});
 });
 const response=await run(request(caller));assert.equal(response.status,200);assert.equal((await response.json()).complete,true);assert.equal(routes.length,4);assert.ok(routes[0].endsWith('/auth/v1/user'));
});
test('claim authorization failure never reaches Storage or completion',async()=>{
 const routes=[];const run=handler(async url=>{routes.push(url);if(url.endsWith('/auth/v1/user'))return Response.json({id:'non-owner',email_confirmed_at:'date'});assert.ok(url.endsWith('_claim'));return Response.json({message:'owner required'},{status:403});});
 const response=await run(request('non-owner'));assert.equal(response.status,400);assert.equal((await response.json()).complete,false);assert.equal(routes.length,2);
});

test('completed deletion retry returns success without Storage or finish calls',async()=>{
 const routes=[];const run=handler(async url=>{routes.push(url);if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner',email_confirmed_at:'date'});assert.ok(url.endsWith('_claim'));return Response.json({complete:true});});
 const response=await run(request('owner'));assert.equal(response.status,200);assert.equal((await response.json()).complete,true);assert.equal(routes.length,2);
});

test('Storage and finish failures remain failures and are never automatically retried',async()=>{
 for(const stage of ['storage','finish']){
  const routes=[];const run=handler(async url=>{routes.push(url);
   if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner',email_confirmed_at:'date'});
   if(url.endsWith('_claim'))return Response.json({complete:false,spaceId:'space',files:[{id:'file',chunks:1}]});
   if(url.includes('/storage/'))return stage==='storage'?new Response(null,{status:403}):Response.json([]);
   assert.ok(url.endsWith('_finish'));return Response.json({message:'revision conflict'},{status:409});
  });
  const response=await run(request('owner')),data=await response.json();assert.equal(response.status,400);assert.equal(data.complete,false);assert.equal(routes.length,stage==='storage'?3:4);if(stage==='finish')assert.equal(data.error,'revision conflict');
 }
});
