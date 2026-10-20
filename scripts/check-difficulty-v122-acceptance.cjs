'use strict';
// Local acceptance checks. Blocked evidence is explicit, never counted as pass.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'app/difficulty-v122'),base=path.join(root,'artifacts/difficulty-v122-rc1');
const out=path.resolve(process.argv[2]||path.join(base,'batch-preflight-20261020/final'));
fs.mkdirSync(out,{recursive:true});
const load=n=>require(path.join(dir,n+'.cjs')),C=load('canonical'),I=load('input'),Source=load('source'),V=load('validate'),S=load('scorer'),
 P=load('projection'),L=load('legacy-resolver'),K=load('contracts'),Policy=load('policy'),Router=load('router'),E=load('evaluator');
const {fixture}=require('../tests/difficulty-v122-entrypoints.test.cjs'),versions=require(path.join(dir,'candidate-versions.json')).versions;
const D=require(path.join(base,'baseline/shindong-m2-three-stage-20261020/detect-db-writes.cjs'));
const source={question_id:'accept-q',revision_id:'accept-r',question:{body:'Find the angle.',choices:[]},scope:{grade:'중2'},
 difficulty_basis:'1. Relation\nGiven mathematical relation.',approved_routes:[{route_id:'approved-main',source:'confirmed_solution',solution_excerpt:'1. Relation\nGiven mathematical relation.'}]};
function fresh(){const prepared=I.prepare(structuredClone(source)),raw=fixture(prepared);return {prepared,raw,r:raw.viable_routes[0],ds:raw.viable_routes[0].critical_discoveries};}
const blocked=reason=>{throw Object.assign(Error(reason),{blocked:true});};
const checks=[];
async function check(id,name,fn){try{await fn();checks.push({id,name,status:'passed'});}catch(e){checks.push({id,name,status:e.blocked?'blocked_by_dependency':'failed',error:e.message});}}
function invalid(mut){const x=fresh();mut(x);assert.equal(V.evaluate(x.raw,x.prepared.payload).validation.valid,false);}
function result(x){return S.score(x.raw,x.prepared.payload);}
function axes(d){Object.assign(d,{C:2,R:2,B:1,H:3,is_non_obvious:true});}
function optional(x){const d=structuredClone(x.ds[2]);Object.assign(d,{id:'extra',role:'optional_illustration',depends_on:[],dependency_semantics:'none'});d.work.calculation_steps=30;x.ds.push(d);x.r.excluded_explanation_ids.push(d.id);}
function independent(){const x=fresh();x.r.targets=[];for(let i=0;i<3;i++){
 const id='choice-'+i;Object.assign(x.ds[i],{target_statement_id:id,depends_on:[],dependency_semantics:'none'});axes(x.ds[i]);
 x.r.targets.push({target_statement_id:id,conclusion_ids:[x.ds[i].id],source_quote:id});
 }delete x.prepared.payload.source_registry;return x;}
function saved(number){const report=JSON.parse(fs.readFileSync(path.join(out,'saved/report.json')));
 const row=report.rows.find(r=>r.school==='shindong'&&r.number===number);if(row.status!=='passed')blocked('Saved replay prerequisite: '+number);
 return JSON.parse(fs.readFileSync(path.join(out,'saved',row.question_id+'.json'))).evaluated.computed;}
function memoryStore(){const data=new Map(),claims=new Set();return {get:k=>data.get(k),claim:k=>{if(claims.has(k))return false;claims.add(k);return true;},
 stage:()=>{},finish:(k,v)=>data.set(k,v)};}
const good=t=>({status:'complete',computed:{problem_tier:t}}),bad={status:'failed',computed:{reason:'difficulty_structure_invalid'}};
async function main(){
 await check(1,'valid IDs with paraphrased display quote',()=>{const x=fresh();x.ds[0].basis_quote='display paraphrase';assert(V.evaluate(x.raw,x.prepared.payload).validation.valid);});
 await check(2,'valid IDs with LaTeX spacing',()=>{const x=fresh();x.ds[0].basis_quote='$ a \\\\quad = b $';assert(V.evaluate(x.raw,x.prepared.payload).validation.valid);});
 await check(3,'unknown source ID rejected',()=>invalid(x=>x.ds[0].basis_step_ids=['absent']));
 for(const [id,key]of [[4,'question_id'],[5,'revision_id'],[6,'difficulty_basis_hash']])
  await check(id,'foreign '+key+' rejected',()=>invalid(x=>{
   const other=I.prepare({...source,[key]:'foreign'});
   x.ds[0].basis_step_ids=[other.registry.basis_steps[0].id];
  }));
 await check(7,'foreign approved route rejected',()=>invalid(x=>x.r.approved_route_id='foreign'));
 await check(8,'wrong role rejected',()=>invalid(x=>x.ds[0].role='optional_illustration'));
 await check(9,'target conclusion identity rejected',()=>invalid(x=>x.ds[2].target_statement_id='foreign'));
 await check(10,'zero legacy candidates unresolved',()=>assert.notEqual(L.resolve('absent',[{id:'a',text:'different'}]).status,'resolved'));
 await check(11,'two legacy candidates unresolved',()=>assert.notEqual(L.resolve('text',[{id:'a',text:'text'},{id:'b',text:'text'}]).status,'resolved'));
 await check(12,'unique legacy span resolved',()=>assert.equal(L.resolve('given relation',[{id:'a',text:'given relation'}]).matched_id,'a'));
 await check(13,'no fuzzy nearest matching',()=>assert.notEqual(L.resolve('given relational',[{id:'a',text:'given relation'}]).status,'resolved'));
 await check(14,'optional illustration does not affect score',()=>{const x=fresh(),before=result(x);optional(x);assert.equal(result(x).score,before.score);});
 await check(15,'answer collection alone cannot assemble',()=>{const x=fresh();optional(x);x.ds.at(-1).role='answer_aggregation';x.r.excluded_explanation_ids=[];assert.equal(result(x).assembly_triggered,false);});
 await check(16,'independent M2 targets do not assemble',()=>assert.equal(result(independent()).assembly_triggered,false));
 await check(17,'premise alias does not create discoveries',()=>{const x=fresh();x.ds[0].role='shared_premise';const before=P.project(x.r);
  const alias=structuredClone(x.ds[0]);alias.id='alias';alias.premise_source_id=x.ds[0].id;x.ds.splice(1,0,alias);x.ds[2].depends_on=['alias'];
  const after=P.project(x.r);assert.equal(after.retained_node_ids.length,before.retained_node_ids.length);assert.deepEqual(after.work,before.work);});
 await check(18,'single real M2 relationship retained',()=>{const x=fresh();axes(x.ds[1]);assert.equal(result(x).moves[1].move_class,'M2');});
 await check(19,'required counterexample M2 remains retained',()=>{const x=fresh();axes(x.ds[1]);x.ds[1].summary='Required counterexample';assert(P.project(x.r).retained_node_ids.includes(x.ds[1].id));assert.equal(result(x).base_tier,'T2');});
 await check(20,'optional numerical example cannot add M5/work',()=>{const x=fresh();optional(x);axes(x.ds.at(-1));const a=result(x);assert.equal(a.execution_audit.strong_signal,false);assert(!a.moves.some(d=>d.id==='extra'));});
 for(const [id,name]of [[21,'Shingu10 scoped reviewed fixture 4.8 T2'],[22,'Shingu10 required M2 count'],[23,'Shingu10 no extra promotions']])
  await check(id,name,()=>blocked('Original acceptance requires a question/revision/basis-bound reviewed projection; synthetic M2 4.8 example is insufficient.'));
 await check(24,'six choice checks do not become six calculations',()=>{const x=fresh();x.ds[0].work.choice_check_count=6;x.r.execution_load=3;assert.equal(result(x).projection.work.required_sequential_calculation_steps,0);});
 await check(25,'seven reasoning nodes do not become seven calculations',()=>{const x=fresh();for(let n=3;n<7;n++){const d=structuredClone(x.ds[2]);d.id='d'+n;d.depends_on=['d'+(n-1)];x.ds.push(d);}x.r.targets[0].conclusion_ids=['d6'];assert.equal(result(x).projection.work.required_sequential_calculation_steps,0);});
 await check(26,'optional work excluded from strong signal',()=>{const x=fresh();optional(x);assert.equal(result(x).execution_audit.strong_signal,false);});
 await check(27,'six genuine sequential calculations preserve strong signal',()=>{const x=fresh();x.ds.forEach((d,i)=>{d.work.calculation_steps=2;d.work.calculation_depends_on=i?[x.ds[i-1].id]:[];});assert(result(x).execution_audit.strong_signal);});
 for(const [id,num,score]of [[28,'6',6.8],[29,'21',8.7],[30,'서답형 1',9.7]])
  await check(id,'saved execution '+num,()=>{const c=saved(num);assert.equal(c.score,score);assert(c.promotions.includes('execution'));});
 await check(31,'nonobvious cannot be M0',()=>{const x=fresh();x.ds[0].is_non_obvious=true;assert(S.move(x.ds[0])>0);});
 await check(32,'real dependent chain supports T1 floor',()=>assert(result(fresh()).route_floor_applied));
 await check(33,'independent choice count cannot support T1 floor',()=>assert.equal(result(independent()).route_floor_applied,false));
 await check(34,'chain assembly through routine bridge',()=>{const x=fresh();x.ds.forEach(axes);const bridge=structuredClone(x.ds[1]);Object.assign(bridge,{id:'bridge',C:0,R:0,B:0,H:0,is_non_obvious:false});x.ds[1].depends_on=['bridge'];x.ds.splice(1,0,bridge);assert.equal(result(x).assembly_mode,'chain');});
 await check(35,'independent required structures converge',()=>{const x=fresh();axes(x.ds[0]);axes(x.ds[1]);x.ds[0].structure_key='structure-A';x.ds[1].structure_key='structure-B';x.ds[1].depends_on=[];x.ds[1].dependency_semantics='none';x.ds[2].depends_on=['d0','d1'];assert.equal(result(x).assembly_mode,'convergence');});
 await check(36,'independent targets cannot converge',()=>assert.notEqual(result(independent()).assembly_mode,'convergence'));
 await check(37,'base T5 retains promotion records',()=>{const x=fresh();x.ds.forEach(d=>Object.assign(d,{C:4,R:4,B:4,H:4,is_non_obvious:true}));const c=result(x);assert.equal(c.base_tier,'T5');assert(c.promotions.length);assert.equal(c.final_tier,'T5');});
 await check(38,'powerful tool label alone does not exclude',()=>{const x=fresh();x.r.uses_powerful_tool=true;assert.equal(result(x).status,'complete');});
 await check(39,'trusted core bypass eligibility excludes route',()=>{const x=fresh();x.prepared.payload.approved_routes[0].eligibility='excluded_core_bypass';assert.equal(result(x).status,'failed');});
 await check(40,'no official route gives failed/null',()=>{const x=fresh();x.r.route_is_official=false;assert.equal(result(x).score,null);});
 await check(41,'Luna T2 final',()=>assert.equal(V.nextStage(1,good('T2')),null));
 await check(42,'Luna T3 to medium',()=>assert.equal(V.nextStage(1,good('T3')),2));
 await check(43,'Luna structural failure to medium',()=>assert.equal(V.nextStage(1,bad),2));
 await check(44,'Sol medium valid T2 final',()=>assert.equal(V.nextStage(2,good('T2')),null));
 await check(45,'Sol medium structural failure to high',()=>assert.equal(V.nextStage(2,bad),3));
 await check(46,'confirmed subscription failure to high',()=>assert.equal(V.nextStage(2,{status:'failed',raw:null,computed:{reason:'subscription_execution_failed'},evidence:{completed:false,usage:null,exitCode:1,errors:[{type:'turn.failed',message:'execution failed'}]}}),3));
 for(const [id,reason]of [[47,'timeout'],[48,'result_unknown']])await check(id,reason+' no next call',()=>assert.equal(V.nextStage(2,{status:'unresolved',computed:{reason}}),null));
 await check(49,'same common validator failure on two items stops',()=>{const c=Router.circuit(),r={validation:{valid:false,reason:'difficulty_structure_invalid',detail:'same'}};assert(!c.observe('q1',r));assert(c.observe('q2',r));});
 await check(50,'low score cannot cause high call',()=>assert.equal(V.nextStage(2,good('T0')),null));
 for(const [id,field]of [[51,'derived_answer'],[52,'solution_validated'],[53,'answer_confidence']])await check(id,'schema excludes '+field,()=>assert(!C.json(V.schema).includes('"'+field+'"')));
 await check(54,'canonical evaluator imports no answer validator',()=>{const text=['validate','evaluator','references','scorer'].map(n=>fs.readFileSync(path.join(dir,n+'.cjs'),'utf8')).join('\n');assert(!/require\([^)]*(?:answer-equivalence|solution-validat)/.test(text));});
 await check(55,'no confidence threshold in validator',()=>assert(!/confidence\s*(?:<=|>=|<|>)/.test(fs.readFileSync(path.join(dir,'validate.cjs'),'utf8'))));
 await check(56,'source warning does not invalidate difficulty',()=>{const x=fresh();x.raw.source_warning=['source contradiction retained'];assert(V.evaluate(x.raw,x.prepared.payload).validation.valid);});
 await check(57,'AST DB write scan canonical files',()=>{
  for(const f of fs.readdirSync(dir).filter(n=>n.endsWith('.cjs'))){const r=D.scan(fs.readFileSync(path.join(dir,f),'utf8'));assert.deepEqual(r.writes,[],f);assert.deepEqual(r.unresolved,[],f);}
 });
 await check(58,'Array.from allowed',()=>assert.equal(D.scan('Array.from({length:3},(_,i)=>i)').writes.length,0));
 await check(59,'all DB mutation methods blocked',()=>{for(const m of ['insert','update','upsert','delete'])assert.equal(D.scan('client.from("x").'+m+'(payload)').writes.length,1);});
 await check(60,'write RPC blocked',()=>assert.equal(D.scan('client.rpc("bank_v121_review_import",{})').writes.length,1));
 await check(61,'storage write blocked',()=>assert.equal(D.scan('storage.putFile(file)').writes.length,1));
 await check(62,'read/select allowed',()=>assert.equal(D.scan('client.from("x").select("*"); client.rpc("bank_search_current",{})').writes.length,0));
 await check(63,'protected baseline hashes preserved',()=>{const start=JSON.parse(fs.readFileSync(path.join(base,'batch-preflight-20261020/start.json')));for(const [f,h]of Object.entries(start.protectedFiles))assert.equal(C.bytesHash(fs.readFileSync(path.join(root,f))),h,f);});
 await check(64,'fresh read-only production snapshot unchanged',()=>{const f=path.join(out,'production-after.json');if(!fs.existsSync(f))blocked('Final production read-back pending');assert.deepEqual(JSON.parse(fs.readFileSync(f)).rows,JSON.parse(fs.readFileSync(path.join(base,'production-before-current.json'))).rows);});
 await check(65,'no real provider intents in new staging',()=>{const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);assert(!walk(path.join(base,'batch-preflight-20261020')).some(f=>/smoke.*\.intent\.json$/.test(f)));});
 await check(66,'no Computer Use import in candidate',()=>{for(const n of fs.readdirSync(dir).filter(n=>n.endsWith('.cjs')))assert(!/cua_repl|pyautogui|playwright|selenium/.test(fs.readFileSync(path.join(dir,n),'utf8')));});
 await check(67,'same input yields stable IDs/hash',()=>assert.deepEqual(I.prepare(source),I.prepare(structuredClone(source))));
 await check(68,'source span enumeration does not change its ID',()=>{
  const text='First relation.\nSecond relation.',spans=[{origin:'basis',start:0,end:15,text:'First relation.',allowed_roles:['required_derivation']},
   {origin:'basis',start:16,end:text.length,text:'Second relation.',allowed_roles:['required_derivation']}];
  const input={question_id:'q',revision_id:'r',difficulty_basis_hash:'b',question:source.question,
   approved_routes:[{route_id:'approved',solution_excerpt:text,reviewed_spans:spans}]};
  const first=Source.build(input);input.approved_routes[0].reviewed_spans.reverse();
  assert.deepEqual(first,Source.build(input));
 });
 await check(69,'revision/basis changes IDs and reuse key',()=>{for(const key of ['revision_id','difficulty_basis_hash']){const a=I.prepare(source),b=I.prepare({...source,[key]:'other'});assert.notEqual(a.registry.source_manifest_hash,b.registry.source_manifest_hash);assert.notEqual(K.evaluationKey(K.identity(a,versions)),K.evaluationKey(K.identity(b,versions)));}});
 await check(70,'source ID collision rejected',()=>{const m=fresh().prepared.registry;m.entries.push(m.entries[0]);const {source_manifest_hash,...rest}=m;m.source_manifest_hash=C.hash(rest);assert.throws(()=>Source.verify(m),/collision/);});
 const x=fresh(),evaluated=V.evaluate(x.raw,x.prepared.payload);
 const envelope=K.envelope(x.prepared,versions,1,{status:'complete',raw:x.raw,started_at:'2026-10-20T00:00:00Z',completed_at:'2026-10-20T00:00:01Z'},evaluated);
 await check(71,'all mandatory envelope identity fields enforced',()=>{for(const k of [...K.required,'request_id','stage_request_id','idempotency_key']){const e=structuredClone(envelope);delete e[k];assert.throws(()=>K.verifyEnvelope(e));}});
 await check(72,'manifest hash mismatch rejected',()=>invalid(x=>x.raw.source_manifest_hash='different'));
 await check(73,'same completed key reused without provider',async()=>{let calls=0;const store=memoryStore(),args={source,policyVersion:Policy.model_policy_version,versions,store,runStage:async req=>{calls++;return {status:'complete',raw:fixture(req.prepared)};}};await E.evaluate(args);assert((await E.evaluate(args)).reused);assert.equal(calls,1);});
 await check(74,'duplicate in-flight request blocked',async()=>{let calls=0,release;const wait=new Promise(r=>release=r),store=memoryStore(),args={source,policyVersion:Policy.model_policy_version,versions,store,runStage:async req=>{calls++;await wait;return {status:'complete',raw:fixture(req.prepared)};}};
  const first=E.evaluate(args);await new Promise(r=>setImmediate(r));const second=await E.evaluate(args);assert.equal(second.reason,'evaluation_already_claimed');release();await first;assert.equal(calls,1);});
 await check(75,'content/image/basis/policy keys cannot reuse',()=>{const i=K.identity(I.prepare(source),versions);for(const k of ['question_content_hash','image_asset_hash','difficulty_basis_hash','model_policy_version'])assert.notEqual(K.evaluationKey(i),K.evaluationKey({...i,[k]:'changed'}));});
 for(const [id,index,name]of [[76,4,'actual desktop'],[77,1,'actual API'],[78,2,'actual batch'],[79,2,'criteria hash equality'],[80,3,'old policy'],[81,0,'solution settings isolation']])
  await check(id,name,()=>{const r=JSON.parse(fs.readFileSync(path.join(out,'entrypoint-integration.json')));assert.equal(r.checks[index]?.pass,true);});
 await check(82,'no new UI confirmation popup',()=>{for(const n of ['upload','adapters','evaluator'])assert(!/\b(?:confirm|alert|showMessageBox)\s*\(/.test(fs.readFileSync(path.join(dir,n+'.cjs'),'utf8')));});
 await check(83,'no raw payload/auth logging in canonical modules',()=>{for(const f of fs.readdirSync(dir).filter(n=>n.endsWith('.cjs')))assert(!/console\.(?:log|error|warn)\s*\(/.test(fs.readFileSync(path.join(dir,f),'utf8')),f);});
 const report={at:new Date().toISOString(),total:checks.length,passed:checks.filter(x=>x.status==='passed').length,failed:checks.filter(x=>x.status==='failed').length,
 blocked:checks.filter(x=>x.status==='blocked_by_dependency').length,untested:83-checks.length,checks,actualAIcalls:0};
 fs.writeFileSync(path.join(out,'acceptance-83.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,checks:checks.filter(x=>x.status!=='passed')},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
