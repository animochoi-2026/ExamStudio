const test=require('node:test'),assert=require('node:assert/strict');
const id='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222';
async function fixture({foreign=false,verifyStatus=200,googleFailure=false}={}){
 const {schoolRegistrationHandler}=await import('../supabase/functions/_shared/school-registration-handler.mjs');const calls=[];
 const fetchImpl=async(url,opt={})=>{calls.push({url,body:opt.body&&JSON.parse(opt.body)});
  if(url.endsWith('/user'))return Response.json({id:actor,email_confirmed_at:'2026-01-01'});
  if(url.includes('/bank_entries?'))return Response.json([{owner_id:foreign?id:actor,props:{role:'commit',revisionId:id}}]);
  if(url.endsWith('/bank-verify'))return Response.json(verifyStatus===200?{verified:true}:{error:'conflict',code:'PT409'},{status:verifyStatus});
  if(url.includes('googleapis')){if(googleFailure)return new Response('',{status:503});return Response.json({places:[]});}
  if(url.endsWith('/bank_school_region_registration'))return Response.json(JSON.parse(opt.body).value?{saved:true}:{claimed:true,school:{name:'검증중',version:1}});
  throw Error('unexpected request');
 };
 const env=k=>({SUPABASE_URL:'https://fixture.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',GOOGLE_MAPS_API_KEY:'private-key'}[k]);
 const result=await schoolRegistrationHandler(env,fetchImpl)(new Request('https://fixture.test',{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify({id})}));
 return {result,calls};
}
test('registration verifies original commit first and stores region without exposing key',async()=>{const {result,calls}=await fixture();assert.equal(result.status,200);const data=await result.text();assert(!data.includes('private-key'));assert(calls.findIndex(x=>x.url.endsWith('/bank-verify'))<calls.findIndex(x=>x.url.includes('googleapis')));assert.equal(calls.at(-1).body.actor,actor);});
test('foreign uploader and verifier conflict never trigger Google',async()=>{for(const options of [{foreign:true},{verifyStatus:409}]){const {result,calls}=await fixture(options);assert.equal(result.status,options.foreign?403:409);assert(!calls.some(x=>x.url.includes('googleapis')));}});
test('Google outage preserves successful registration and stores failed lookup',async()=>{const {result,calls}=await fixture({googleFailure:true});assert.equal(result.status,200);assert.equal((await result.json()).verified,true);assert.equal(calls.at(-1).body.value.status,'failed');});
