'use strict';
// Offline, collect-all supplementary gates. This never invokes an evaluator transport.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'artifacts/difficulty-v122-rc1');
const out=path.resolve(process.argv[2]||path.join(base,'offline-preflight-20261020')),dir=path.join(root,'app/difficulty-v122');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
const load=n=>require(path.join(dir,n+'.cjs')),C=load('canonical'),I=load('input'),Schema=load('schema'),Policy=load('policy');
const old=path.join(base,'baseline/shindong-m2-three-stage-20261020');
const official='C:/Users/reals/.codex/worktrees/registration-ui-20261017/문제생성기/artifacts/difficulty-v121';
const checks=[],blocked=s=>{throw Object.assign(Error(s),{blocked:true});};
async function check(name,fn){try{const evidence=await fn();checks.push({name,status:'passed',evidence});}
 catch(e){checks.push({name,status:e.blocked?'blocked_by_dependency':'failed',error:e.message});}}
function save(n,v){fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n');}
async function main(){
 const start=read(path.join(base,'batch-preflight-20261020/start.json')),saved=read(path.join(out,'saved/report.json'));
 await check('protected baseline and saved response hashes',()=>{
  const files={...Object.fromEntries(Object.entries(start.protectedFiles).map(([f,h])=>[path.join(root,f),h])),...saved.snapshotFiles};
  for(const [f,h]of Object.entries(files))assert.equal(C.bytesHash(fs.readFileSync(f)),h,f);
  return {verifiedFiles:Object.keys(files).length,changed:0};
 });
 await check('criteria and projection unchanged by this repair',()=>{
  for(const name of ['scorer.cjs','validate.cjs','prompt.json','policy.cjs'])
   assert.equal(C.bytesHash(fs.readFileSync(path.join(dir,name))),start.candidateFiles?.['app/difficulty-v122/'+name]||
    C.bytesHash(fs.readFileSync(path.join(base,'batch-preflight-20261020/before/app/difficulty-v122',name))));
  // User-authorized dynamic schema portability repair; the scoring schema
  // itself must remain identical to the preserved pre-repair schema.
  assert.deepEqual(Schema.schema,require(path.join(base,'batch-preflight-20261020/before/app/difficulty-v122/schema.cjs')).schema);
  const S=load('scorer'),parent=require(path.join(old,'scorer.cjs'));
  const functions=['effective','move','graph','chain','routeFloor','assembly','literacy','groups','path','decimal','quoteNorm'];
  for(const k of functions)assert.equal(S[k].toString(),parent[k].toString(),k);
  assert.equal(load('projection').project.toString(),require(path.join(old,'projection.cjs')).project.toString());
  return {unchangedFunctions:functions.concat('project'),projectionMetadata:load('projection').version};
 });
 await check('candidate content hashes recomputed, still unfrozen',()=>{
  const v=read(path.join(dir,'candidate-versions.json'));assert.equal(v.status,'unfrozen_candidate');
  for(const [f,h]of Object.entries(v.files))assert.equal(C.bytesHash(fs.readFileSync(path.join(dir,f))),h,f);
  return {files:Object.keys(v.files).length,status:v.status};
 });
 await check('exact model bindings and subscription argument mapping',()=>{
  const Sub=require('../app/difficulty-v12/subscription.cjs'),bindings=[];
  for(const s of Policy.stages){
   const profile=s.stage===1?'luna-medium':s.stage===2?'sol-medium':'sol-high',actual=Sub.execution(profile);
   assert.equal(actual.model,s.model);assert.equal(actual.effort,s.effort);
   const args=Sub.argsFor({cwd:'fixture',schemaFile:'schema',outputFile:'result',images:[],executionProfile:profile});
   assert.equal(args[args.indexOf('--model')+1],s.model);assert(args.includes('model_reasoning_effort="'+s.effort+'"'));
   bindings.push({...s,profile});
  }
  const cache=read('C:/Users/reals/.codex/models_cache.json');
  const models=cache.models.filter(m=>bindings.some(b=>b.model===m.slug)).map(m=>({
   model:m.slug,context_window:m.context_window,input_modalities:m.input_modalities,
   efforts:m.supported_reasoning_levels.map(x=>x.effort)}));
  for(const s of bindings)assert(models.find(m=>m.model===s.model)?.efforts.includes(s.effort));
  save('model-bindings.json',{at:new Date().toISOString(),policy:Policy.model_policy_version,bindings,
   localCacheEvidence:models,cacheFreshness:'local cached capability evidence; no live request'});
  return bindings;
 });
 await check('rule consistency lint',()=>{
  const S=load('scorer'),P=load('projection'),schema=Schema.schema;
  assert.equal(S.version,Policy.projection_version);assert.equal(P.version,Policy.projection_version);
  assert.equal(Schema.policy,Policy.model_policy_version);
  const text=JSON.stringify(schema);
  for(const forbidden of ['derived_answer','solution_validated','answer_confidence'])assert(!text.includes('"'+forbidden+'"'));
  const ex=schema.properties.viable_routes.items.properties.execution_audit.properties;
  assert(!Object.hasOwn(ex,'raw_case_count'));assert(!Object.hasOwn(ex,'raw_sequential_step_count'));
  const prompt=load('prompt').instructions;
  assert(prompt.includes('문구 복제나 표현 동치성은 구조 검증 조건이 아니다'));
  assert(!/basis_quote.*(?:연속된 정확한 부분문자열|그대로 인용해야)/.test(prompt));
  assert.equal(Policy.automaticRetries,0);
  return {versionAlignment:true,forbiddenAnswerFields:0,modelReportedRawWorkFields:0,quoteMatchingRequirement:false};
 });
 await check('AST database write controls and canonical module scan',()=>{
  const D=require(path.join(old,'detect-db-writes.cjs'));
  for(const op of ['insert(payload)','update(payload)','upsert(payload)','delete()'])
   assert.equal(D.scan('client.from("example").'+op).writes.length,1);
  for(const code of ['Array.from({length:3},(_,i)=>i)','client.from("example").select("*")','client.rpc("bank_search_current",{})'])
   assert.equal(D.scan(code).writes.length,0);
  assert.equal(D.scan('client.rpc("bank_v121_review_import",payload)').writes.length,1);
  assert.equal(D.scan('storage.putFile(file)').writes.length,1);
  const files=fs.readdirSync(dir).filter(n=>n.endsWith('.cjs'));
  for(const f of files){const r=D.scan(fs.readFileSync(path.join(dir,f),'utf8'));assert.equal(r.writes.length,0,f);assert.equal(r.unresolved.length,0,f);}
  return {files:files.length,positiveControls:6,negativeControls:3,
   limitation:'AST known-client inspection; pre-existing Edge staging RPC is tested with mocks, never executed against production'};
 });
 await check('secret redaction and no raw transport logging',()=>{
  const F=require('../app/difficulty-v121/failures.cjs'),Sub=require('../app/difficulty-v12/subscription.cjs');
  const fake='sk-proj-'+'x'.repeat(50),clean=F.redact('Authorization: Bearer '+fake);
  assert(!clean.includes(fake));
  const env=Sub.cleanEnv({OPENAI_API_KEY:fake,ACCESS_TOKEN:fake,SERVICE_ROLE:fake,PATH:'fixture'});
  assert.deepEqual(env,{PATH:'fixture'});
  for(const f of fs.readdirSync(dir).filter(n=>n.endsWith('.cjs')))
   assert(!/console\.(log|error|warn)\s*\(/.test(fs.readFileSync(path.join(dir,f),'utf8')),f);
  return {redactionControls:2,rawTransportLogging:false};
 });
 await check('desktop queue asynchronous saved-result checkpoint',()=>{
  const q=fs.readFileSync(path.join(root,'app/exam-queue-main.cjs'),'utf8');
  assert(q.includes("await require('./difficulty-v122/upload.cjs').savedResult("));
  assert(q.includes("require('./difficulty-v122/candidate-versions.json').versions.criteria_payload_hash"));
  assert(q.includes('if(!v121&&'));
  assert(fs.readFileSync(path.join(root,'app/exam-queue.cjs'),'utf8').includes('await verify('));
  return {queueStarted:false,checkpointUsesCanonicalResult:true};
 });
 await check('old Shingu scorer independent replay',()=>{
  const d=path.join(official,'shingu-direct-routing-fixed-20261020'),S=require(path.join(d,'scorer.cjs'));
  const rows=[];
  for(const item of read(path.join(d,'manifest.json'))){
   const f=read(path.join(d,'run-three-stage',item.id,'final.json'));
   if(f.status!=='complete'){rows.push({number:item.number,status:'blocked_by_dependency',reason:'old final not complete'});continue;}
   const stage=read(path.join(d,'run-three-stage',item.id,'stage-'+f.finalStage,'result.json')),ctx=read(path.join(d,item.contextFile));
   const actual=S.score(stage.raw,ctx);
   assert.equal(actual.score,f.computed.score,item.number);assert.equal(actual.problem_tier,f.computed.problem_tier,item.number);
   assert.deepEqual(actual.promotions,f.computed.promotions,item.number);
   rows.push({number:item.number,status:'passed',score:actual.score,tier:actual.problem_tier});
  }
  save('shingu-original-scorer-replay.json',{rows,canonicalMigration:false,AIcalls:0});
  return {passed:rows.filter(r=>r.status==='passed').length,blocked:rows.filter(r=>r.status!=='passed').length,
   note:'Independent original-scorer preservation only; does not clear new-contract replay gate'};
 });
 await check('canonical schema and all corpus dynamic schemas meta validation',async()=>{
  // Python is an independently launched, offline metadata checker. Never
  // grant test subprocess permissions just to run this gate.
  const f=path.join(out,'schema-meta.json');
  if(!fs.existsSync(f))blocked('Independent offline schema metadata validation has not completed.');
  const result=read(f),exported=path.join(out,'schemas.json');
  assert.equal(C.bytesHash(fs.readFileSync(exported)),result.input_sha256);
  assert.equal(result.schema_module_sha256,C.bytesHash(fs.readFileSync(path.join(dir,'schema.cjs'))));
  assert.equal(result.total,read(path.join(out,'corpus-preflight.json')).total+1);
  assert.equal(result.failed,0);assert.equal(result.portability.failed,0);return result;
 });
 await check('provider payload/image limit evidence',()=>{
  const corpus=read(path.join(out,'corpus-preflight.json'));
  save('input-limit-review.json',{status:'blocked_by_dependency',payloadBytes:corpus.payload_bytes,imageBytes:corpus.image_bytes,
   imageCount:corpus.image_count,sourceIds:corpus.source_ids,
   reason:'Local model cache exposes text context windows but not a verified image/request byte limit for the actual subscription transport. No guessed threshold or input alteration applied.'});
  blocked('Provider image/request byte limit is not verified; largest total image input is '+corpus.image_bytes.max+' bytes.');
 });
 await check('production rows unchanged',()=>{
  assert.deepEqual(read(path.join(out,'production-after.json')).rows,read(path.join(out,'production-before.json')).rows);
  return {catalogRows:1629,activationResults:1266,activationBatches:1,changes:0};
 });
 const report={at:new Date().toISOString(),passed:checks.filter(c=>c.status==='passed').length,
  failed:checks.filter(c=>c.status==='failed').length,blocked:checks.filter(c=>c.status==='blocked_by_dependency').length,
  untested:0,checks,actualAIcalls:0};
 save('supplementary-preflight.json',report);console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
