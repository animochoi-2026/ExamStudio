'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Deploy=require('../app/difficulty-v123/deployment.cjs'),Policy=require('../app/difficulty-v122/policy.cjs'),Server=require('../app/difficulty-v122/server.cjs');
const Display=require('../app/difficulty-display.cjs'),V=require('../app/difficulty-v123/display.cjs'),A=require('../app/difficulty-assessment.cjs');
const manifest='32150b5cb2399497f597fc9546d1ce72509bb194ddd80b3ff3af0962b8bad452';
test('server and built Edge share manifest; old contracts do not load sources or AI',async()=>{
 assert.equal(Deploy.manifest_hash,manifest);let calls=0;const body={action:'policy',model_policy_version:Policy.model_policy_version,spaceId:'test-space'};
 assert.equal((await Server.dispatch({body})).policy.evaluation_manifest_hash,manifest);
 assert.equal((await Server.dispatch({body:{...body,action:'evaluate'},loadConfirmedSource:()=>{calls++;throw Error('must not load');}})).reason,'difficulty_contract_upgrade_required');
 const engine=(await import('../supabase/functions/bank-difficulty-v12/engine.mjs')).default;
 const handler=engine.handler({env:k=>({SUPABASE_URL:'https://mock.invalid',SUPABASE_ANON_KEY:'mock',SUPABASE_SERVICE_ROLE_KEY:'mock-service'})[k],readFile:()=>{throw Error('no file access');},fetchImpl:async(url)=>{
  calls++;if(url.endsWith('/auth/v1/user'))return Response.json({id:'mock',email_confirmed_at:'2026-01-01'});
  if(url.endsWith('/rpc/bank_v123_policy'))return Response.json({evaluation_manifest_hash:manifest});throw Error('unexpected network '+url);
 }});
 const req=b=>new Request('https://mock.invalid/function',{method:'POST',headers:{authorization:'Bearer mock'},body:JSON.stringify(b)});
 const response=await handler(req(body));assert.equal(response.status,200);assert.equal((await response.json()).policy.evaluation_manifest_hash,manifest);
 assert.equal((await (await handler(req({...body,action:'evaluate'}))).json()).reason,'difficulty_contract_upgrade_required');assert.equal(calls,3);
 assert.throws(()=>require('../app/difficulty-v122/adapters.cjs').desktop({}, {outputPolicyVersion:'old-capped'}),/difficulty_output_policy_upgrade_required/);
});
test('stored 1266 values retain score, tier, promotion and projection distribution',()=>{
 const input=JSON.parse(fs.readFileSync(process.env.V123_ACTIVATION_INPUT)),counts={};let total=0;
 for(const x of input.rows){const r=x.result,c={revision_id:x.revision_id,metadata:{difficulty:{v123Active:r}},confirmed:{}};
  assert.equal(V.active(c).score,r.final_score);assert.equal(A.effective(c).number,r.final_score);assert.deepEqual(V.active(c).computed.promotions,r.computed.promotions);
  const band=Display.fromProjection(V.active(c));assert.equal(band,V.tiers[r.final_tier]);assert.equal(A.compositionBand(c),band==='killer'?'high':band);counts[r.final_tier]=(counts[r.final_tier]||0)+1;total++;
  const manual={...c,confirmed:{difficulty:3.1}};assert.equal(V.active(manual).score,3.1);assert.equal(A.effective(manual).number,3.1);
  assert.equal(V.active({...c,revision_id:'changed'}).score,null);
 }
 assert.equal(total,1266);assert.deepEqual(counts,{T0:230,T1:333,T2:413,T3:189,T4:65,T5:36});
});
