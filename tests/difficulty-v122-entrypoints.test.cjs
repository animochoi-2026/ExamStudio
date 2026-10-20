'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||process.env.EXAMSTUDIO_TEST_OUTPUT||path.join(root,'artifacts/difficulty-v122-rc1'));
fs.mkdirSync(out,{recursive:true});
const C=require('../app/difficulty-v122/canonical.cjs'),Input=require('../app/difficulty-v122/input.cjs'),P=require('../app/difficulty-v122/policy.cjs');
const Schema=require('../app/difficulty-v122/schema.cjs'),K=require('../app/difficulty-v122/contracts.cjs');
const Adapter=require('../app/difficulty-v122/adapters.cjs'),{fileStore}=require('../app/difficulty-v122/ledger.cjs');
const versions=require('../app/difficulty-v122/candidate-versions.json').versions;
const source={question_id:'mock-q',revision_id:'mock-r',question:{body:'Find the angle.',choices:[]},scope:{grade:'중학교 2학년'},
 difficulty_basis:'1. Required relation\nThe given angle determines the required angle.',difficulty_basis_source:'confirmed_solution',
 approved_routes:[{route_id:'approved-main',source:'confirmed_solution',solution_excerpt:'1. Required relation\nThe given angle determines the required angle.'}],images:[]};
function defaults(s){
 if(s.anyOf)return null;
 if(s.type==='object')return Object.fromEntries(Object.entries(s.properties).map(([k,x])=>[k,defaults(x)]));
 if(s.type==='array')return [];
 if(s.enum)return s.enum[0];
 return s.type==='string'?'evidence':s.type==='boolean'?false:0;
}
function fixture(prepared){
 const raw=defaults(Schema.schema),r=defaults(Schema.schema.properties.viable_routes.items),m=prepared.registry,b=m.basis_steps[0],t=m.targets[0],route=m.approved_routes[0];
 Object.assign(raw,{difficulty_basis_hash:prepared.identities.difficulty_basis_hash,source_manifest_hash:m.source_manifest_hash,difficulty_basis_source:'confirmed_solution',approved_route_ids:[route.id]});
 const ds=[];
 for(let i=0;i<3;i++){
  const d=defaults(Schema.schema.properties.viable_routes.items.properties.critical_discoveries.items);
  Object.assign(d,{id:'d'+i,step_kind:'relation_transfer',C:1,R:1,B:1,H:1,role:'required_derivation',target_statement_id:t.id,
   basis_step_ids:[b.id],source_span_ids:[b.source_span_id],relation_kind:'relation-'+i,depends_on:i?['d'+(i-1)]:[],dependency_semantics:i?'all_required':'none'});
  ds.push(d);
 }
 Object.assign(r,{route_id:route.id,approved_route_id:route.id,approved_route_source:'confirmed_solution',route_is_official:true,critical_discoveries:ds,
  targets:[{target_statement_id:t.id,source_span_id:t.source_span_id,source_quote:'display only paraphrase',conclusion_ids:['d2']}],conclusion_ids:['d2'],execution_load:0});
 raw.viable_routes=[r];for(const x of Object.values(raw.literacy_audit))x.problem_level=true;
 return raw;
}
function wireFixture(prepared){
 const raw=fixture(prepared);delete raw.source_manifest_hash;
 for(const r of raw.viable_routes)for(const t of r.targets){t.conclusion_discovery_id=t.conclusion_ids[0];delete t.conclusion_ids;}
 const E=require('../app/difficulty-v122/evidence.cjs');
 raw.evidence_contract_version=E.version;
 for(const r of raw.viable_routes)for(const d of r.critical_discoveries){
  d.evidence_relation_ids=[];
  for(const id of d.basis_step_ids){
   const choices=prepared.payload.evidence_relations.relations.filter(e=>e.basis_step_id===id&&e.route_id===r.approved_route_id&&e.role===d.role);
   if(choices.length>1)d.evidence_relation_ids.push(choices.find(e=>e.allowed_branch_ids.includes(d.target_statement_id)).evidence_relation_id);
  }
  for(const field of E.systemFields)delete d[field];
 }
 return raw;
}
async function main(){
 const checks=[];let modelInvocations=0,networkWrites=0;
 const sourceInput=Input.prepare(source),settings={model:'unchanged-solution-model',effort:'high'};
 const runtime={policyVersion:P.model_policy_version,versions,instructions:require('../app/difficulty-v122/prompt.cjs').instructions,
  store:fileStore(fs.mkdtempSync(path.join(out,'entrypoint-ledger-'))),
  runStage:async req=>{modelInvocations++;return {model:req.model,effort:req.effort,status:'complete',request_binding_hash:req.request_envelope.envelope_hash,raw:wireFixture(req.prepared),usage:{input_tokens:0,output_tokens:0}};}};
 const test=async(name,fn)=>{try{await fn();checks.push({name,pass:true});}catch(e){checks.push({name,pass:false,error:e.message});throw e;}};
 try{
  await test('desktop canonical adapter and policy isolation',async()=>{
   const before=C.hash(settings),r=await Adapter.desktop(source,{...runtime,solutionSettings:settings});
   assert.equal(r.result.status,'complete');assert.equal(modelInvocations,1);assert.equal(C.hash(settings),before);K.verifyEnvelope(r.result);
  });
  await test('real server API handler uses canonical evaluator and reuses same key',async()=>{
   const handler=require('../app/difficulty-v12/server.cjs').handler({env:k=>({SUPABASE_URL:'https://mock.invalid',SUPABASE_SERVICE_ROLE_KEY:'mock-service',SUPABASE_ANON_KEY:'mock-anon'}[k]),
    canonicalRuntime:runtime,loadConfirmedSource:async()=>source,
    fetchImpl:async(url,options)=>{
     if(url.endsWith('/auth/v1/user'))return Response.json({id:'mock-user',email_confirmed_at:'2026-01-01'});
     if(url.endsWith('/rpc/bank_v12_access'))return Response.json(true);
     networkWrites++;throw Error('unexpected request '+url);
    }});
   const response=await handler(new Request('https://mock.invalid/evaluate',{method:'POST',headers:{authorization:'Bearer mock-user','content-type':'application/json'},
    body:JSON.stringify({action:'evaluate',questionId:source.question_id,revisionId:source.revision_id,spaceId:'mock-space',model_policy_version:P.model_policy_version})}));
   const r=await response.json();assert.equal(response.status,200);assert.equal(r.reused,true);assert.equal(modelInvocations,1);assert.equal(networkWrites,0);
  });
  await test('actual batch runner uses the same evaluator key',async()=>{
   const sources=[source],r=await require('../scripts/run-difficulty-v122.cjs').run({sources,target_snapshot_hash:C.hash(sources)},runtime);
   assert.equal(r[0].reused,true);assert.equal(r[0].result.criteria_payload_hash,versions.criteria_payload_hash);assert.equal(modelInvocations,1);
  });
  await test('old model policy rejected',async()=>{
   await assert.rejects(()=>Adapter.desktop(source,{...runtime,policyVersion:'old'}),/difficulty_policy_upgrade_required/);
   assert.equal(modelInvocations,1);
  });
  await test('actual desktop upload path reaches canonical evaluator',async()=>{
   const q={id:'local-q',body:source.question.body,choices:[],solution:source.difficulty_basis,answer:'confirmed'};
   const project={scope:source.scope,problems:[{id:'p',original:q,variants:[],cropPaths:[]}]};
   const bank={dir:fs.mkdtempSync(path.join(out,'desktop-mock-')),ensure:()=>({id:source.question_id,baseRevisionId:source.revision_id,metadata:{}})};
   const r=await require('../app/difficulty-v122/upload.cjs').evaluate({bank,store:{get:()=>project},projectId:'project',questionId:q.id,difficultyRuntime:runtime});
   assert.equal(r.result.status,'complete');assert.equal(r.result.criteria_payload_hash,versions.criteria_payload_hash);
   const count=modelInvocations,upload=require('../app/difficulty-v122/upload.cjs');
   const options={bank,store:{get:()=>project},projectId:'project',questionId:q.id,difficultyRuntime:runtime};
   assert.equal((await upload.savedResult(options)).evaluation_key,r.result.evaluation_key);
   q.body+=' Changed input.';
   assert.equal(await upload.savedResult(options),null);
   assert.equal(modelInvocations,count,'checkpoint lookup must not call a provider');
  });
  await test('actual desktop call site supplies a canonical runtime without test injection',async()=>{
   const text=fs.readFileSync(path.join(root,'app/bank-analysis.cjs'),'utf8');
   const call=text.match(/return require\('\.\/difficulty-v122\/upload\.cjs'\)\.afterAnalysis\(([^;]+)\);/);
   assert(call,'actual upload call site missing');
   // Merely forwarding an optional test dependency does not wire production.
   const upload=fs.readFileSync(path.join(root,'app/difficulty-v122/upload.cjs'),'utf8');
   assert(/(?:require\('\.\/runtime\.cjs'\)|createRuntime\()/u.test(upload),'desktop default runtime missing: difficultyRuntime is only externally injected');
  });
 }catch(e){process.exitCode=1;}
 const report={at:new Date().toISOString(),passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length,checks,mockProviderInvocations:modelInvocations,actualAIcalls:0,productionWrites:0,networkWrites,computerUse:0};
 fs.writeFileSync(path.join(out,'entrypoint-integration.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}
module.exports={fixture,wireFixture};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
