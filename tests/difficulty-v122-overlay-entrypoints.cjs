'use strict';
require('./offline-guard.cjs');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const C=require('../app/difficulty-v122/canonical.cjs'),P=require('../app/difficulty-v122/policy.cjs'),A=require('../app/difficulty-v122/adapters.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/difficulty-v122-role-overlay'),source=require('../artifacts/difficulty-v122-evidence-rc/inputs/sources.json')[0],raw=require('../artifacts/difficulty-v122-simple-contract/latest-11.json');
async function main(){
 const checks=[];let actualNetworkRequests=0;
 const run=async(name,fn)=>{try{await fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.message});}};
 const runtime=()=>({versions:require('../app/difficulty-v122/candidate-versions.json').versions,policyVersion:P.model_policy_version,smoke:true,
  store:require('../app/difficulty-v122/ledger.cjs').fileStore(fs.mkdtempSync(path.join(out,'mock-ledger-'))),
  runStage:async req=>{const wire=structuredClone(raw);for(const d of wire.viable_routes[0].critical_discoveries)for(const k of ['role','role_reason','premise_source_id'])delete d[k];return {status:'complete',model:req.model,effort:req.effort,request_binding_hash:req.request_envelope.envelope_hash,raw:wire};}});
 const verify=r=>{assert.equal(r.result.status,'complete');assert.equal(r.result.system_projection_role_overlay.shared_premise_count,1);assert.equal(r.result.system_projection_role_overlay.required_nodes.length,5);};
 await run('desktop representative overlay mock',async()=>verify(await A.desktop(source,runtime())));
 await run('real API representative overlay mock',async()=>{
  const handler=require('../app/difficulty-v12/server.cjs').handler({env:k=>({SUPABASE_URL:'https://mock.invalid',SUPABASE_SERVICE_ROLE_KEY:'mock-service',SUPABASE_ANON_KEY:'mock-anon'}[k]),canonicalRuntime:runtime(),loadConfirmedSource:async()=>source,
   fetchImpl:async url=>{if(url.endsWith('/auth/v1/user'))return Response.json({id:'user',email_confirmed_at:'2026-01-01'});if(url.endsWith('/rpc/bank_v12_access'))return Response.json(true);throw Error('unexpected mock request '+url);}});
  const response=await handler(new Request('https://mock.invalid/evaluate',{method:'POST',headers:{authorization:'Bearer mock-user','content-type':'application/json'},body:JSON.stringify({action:'evaluate',questionId:source.question_id,revisionId:source.revision_id,spaceId:'mock-space',model_policy_version:P.model_policy_version})}));
  assert.equal(response.status,200);verify(await response.json());
 });
 await run('actual batch representative overlay mock',async()=>{const values=await require('../scripts/run-difficulty-v122.cjs').run({sources:[source],target_snapshot_hash:C.hash([source])},runtime());verify(values[0]);});
 await run('actual Edge bundle representative no-overlay mock',async()=>{const {default:engine}=await import(pathToFileURL(path.join(root,'supabase/functions/bank-difficulty-v12/engine.mjs')).href);const h=await require('./difficulty-v122-edge-runtime.test.cjs').harness(engine);const r=await h.request();assert.equal(r.http,200);assert.equal(r.value.result.status,'complete');assert.equal(h.posts.length,1);assert.equal(h.posts[0].request.model,'gpt-6-luna');});
 const result={checks,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,actualNetworkRequests,actualAIcalls:0,productionWrites:0,deployments:0};
 fs.writeFileSync(path.join(out,'entrypoint-mocks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(result.failed)process.exitCode=1;
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
