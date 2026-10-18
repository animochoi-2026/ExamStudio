'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../app/difficulty-v121/scorer.cjs'),V=require('../app/difficulty-v121/schema.cjs'),A=require('../app/difficulty-v121/answer.cjs'),P=require('../app/difficulty-v121/policy.cjs'),Profile=require('../app/difficulty-v121/profile.cjs'),Run=require('../app/difficulty-v121/run.cjs'),Cut=require('../app/difficulty-v121/cutover.cjs'),I=require('../app/difficulty-v12/input.cjs');
const F=require('./fixtures/difficulty-v12-values.cjs'),{d,route}=F;
const value=(ds=[d('a')],extras={})=>({...F.raw(route(ds)),spec_revision:'1.2.1',derived_answer:'54',answer_type:'numeric',solution_summary:'높이 6, 밑변 18, 넓이는 54',solution_validated:false,answer_confidence:.9,literacy_evidence_type:'',image_evidence_status:'not_required',assessment_uncertainty:[],...extras});
const context={scope:'중2',storedAnswer:'54',choices:[]};
const complete=(tier='T2')=>({validation:{valid:true,solution_validated:true},computed:{status:'complete',problem_tier:tier,score:tier==='T5'?9.8:4.7}});
test('base anchors and literacy +1 K4/K6; historical values are isolated',()=>{
 for(const [axes,e,score]of [[[3,3,3,3],2,9.8],[[4,4,3,4],1,9.9],[[2,2,2,3],2,6.8],[[3,2,2,3],1,6.9],[[2,2,1,2],1,4.7],[[1,1,0,0],1,1.2],[[1,1,0,4],1,1.2],[[1,0,0,4],0,1.1]])assert.equal(S.scoreProblem([route([d('x',...axes)],{execution_load:e})],false).score,score);
 for(const key of ['K4','K6']){const r=S.scoreProblem([route([d(key,2,2,2,3)],{execution_load:2})],true);assert.equal(r.problem_tier,'T4');assert.equal(r.score,8.6);assert.deepEqual(r.promotions,['literacy']);}
});
test('dependent assembly traverses automatic M0; independent discoveries do not assemble',()=>{
 const ds=[d('a'),d('auto',0,0,0,0,['a'],false),d('b',2,2,1,2,['auto']),d('c',2,2,1,2,['b'])];
 assert.deepEqual(S.scoreProblem([route(ds)],false).promotions,['assembly']);
 assert.deepEqual(S.scoreProblem([route(ds.map(x=>({...x,depends_on:[]})))],false).promotions,[]);
});
test('T5 retains actual gate records with zero promotion increase',()=>{
 const r=S.scoreProblem([route([d('a',3,3,3,3)])],true);assert.equal(r.base_tier,'T5');assert.equal(r.problem_tier,'T5');assert.deepEqual(r.promotions,['literacy']);assert.equal(r.promotion_tier_increase,0);assert.equal(r.promotion_capped,true);
});
test('branch max / route min / route E / no powerful-route fallback',()=>{
 const easy=route([d('e')]),hard=route([d('h',3,3,3,3)],{route_id:'b'});
 assert.equal(S.scoreProblem([hard,easy],false).problem_tier,'T2');
 const branches=route([],{execution_load:4,parallel_branch_count:2,independent_branches:[{branch_id:'a',critical_discoveries:easy.critical_discoveries},{branch_id:'b',critical_discoveries:hard.critical_discoveries}]});assert.equal(S.scoreProblem([branches],false).problem_tier,'T5');
 assert.equal(S.scoreProblem([{...hard,uses_powerful_tool:true}],false).score,null);
 assert.equal(S.scoreProblem([],false).score,null);
});
test('strict schema/graphs/booleans/positive gate evidence',()=>{
 const bads=[{literacy_high:true},{literacy_high:true,literacy_evidence:'조건 4개',literacy_evidence_type:''},{reference_student_match:false},{curriculum_scope:''},{confidence:.69},{answer_confidence:.69},{assessment_uncertainty:['solution_unresolved']},{image_evidence_status:'unclear'}];
 for(const changes of bads)assert.equal(V.evaluate(value(undefined,changes),context).computed.status,'failed');
 for(const ds of [[d('a'),d('a')],[d('a',2,2,1,2,['missing'])],[d('a',2,2,1,2,['a'])],[d('a',2,2,1,2,['b']),d('b',2,2,1,2,['a'])]])assert.equal(V.evaluate(value(ds),context).computed.status,'failed');
 for(const field of ['reference_student_match','literacy_high','solution_validated']){const v=value();delete v[field];assert.equal(V.evaluate(v,context).computed.status,'failed');}
 const v=value();v.viable_routes[0].execution_extreme=true;assert.equal(V.evaluate(v,context).computed.status,'failed');
});
test('independent answer verification overrides model boolean and retains raw bytes',()=>{
 const v=value(undefined,{solution_validated:true,score:10}),before=JSON.stringify(v);
 assert.equal(V.evaluate(v,{...context,storedAnswer:'55'}).computed.score,null);
 const result=V.evaluate(v,context);assert.equal(result.validation.solution_validated,true);assert.equal(result.computed.score,4.6);assert.equal(JSON.stringify(v),before);assert.equal(JSON.stringify(result.raw),before);
 assert.equal(V.evaluate(value(),context).raw.solution_validated,false);
 assert.equal(A.verify('①','1',{answerType:'multiple_choice',choices:['x','y']}).valid,true);
 assert.equal(A.verify('③','③ $10\\,\\mathrm{cm}$',{answerType:'multiple_choice',choices:['x','y','z']}).valid,true);
 assert.equal(A.verify('2','1',{answerType:'multiple_choice',choices:['x','y']}).valid,false);
 assert.equal(A.verify('\\frac{2}{4}','0.5',{answerType:'numeric'}).valid,true);
 assert.equal(A.verify('54','54 cm²',{answerType:'numeric'}).valid,false);
 assert.equal(A.verify('합동이다','두 각이 같다',{answerType:'proof'}).valid,false);
});
test('valid low stage 1 accepts; invalid low escalates; stage 2 high accepts; final failure null',()=>{
 assert.equal(P.decide(1,complete()).status,'complete');assert.equal(P.decide(1,complete('T3')).next,2);
 for(const reason of ['answer_mismatch','schema_invalid','confidence_below_0.7','no_eligible_routes'])assert.equal(P.decide(1,{...complete(),validation:{valid:false,reason}}).next,2);
 assert.equal(P.decide(2,complete('T2')).status,'complete');assert.equal(P.decide(2,complete('T5')).status,'complete');
 assert.equal(P.decide(2,{computed:{status:'failed'}}).next,3);assert.equal(P.decide(3,{computed:{status:'failed'}}).status,'failed');
});
function entry(){const input=I.input({question:{body:'넓이를 구하시오.',answer:'54',difficulty:8},scope:'중2'});return {questionId:'q',revisionId:'r1',source:{semester:'2학기',exam:'기말고사',documentId:'s'},input,validationContext:context};}
test('three independent stages, no averaging, uncalled fields null, revision conflict',async()=>{
 let calls=[];const e=entry(),r=await Run.evaluateEntry(e,{runStage:async(x,n,model)=>{calls.push(model.id);assert.equal(x.input.payload.question.answer,undefined);return n===1?{validation:{valid:false,reason:'answer_mismatch'},computed:{status:'failed'}}:complete('T2');}});
 assert.deepEqual(calls,['luna-medium','sol-medium']);assert.equal(r.final_stage,2);assert.equal(r.final_score,4.7);assert.equal(r.stage3_model,null);
 const f=await Run.evaluateEntry(e,{runStage:async()=>({computed:{status:'failed'}})});assert.equal(f.final_score,null);assert.equal(f.final_tier,null);assert.equal(f.final_status,'failed');
 await assert.rejects(Run.evaluateEntry(e,{runStage:async()=>complete(),readCurrent:async()=>({revisionId:'r2',contentHash:e.input.contentHash})}),/question_changed/);
});
test('identity includes revision, assets and validated answer; model settings independent',()=>{
 const e=entry();assert.notEqual(Profile.inputIdentity(e),Profile.inputIdentity({...e,revisionId:'r2'}));
 assert.notEqual(Profile.inputIdentity(e),Profile.inputIdentity({...e,validationContext:{...context,storedAnswer:'55'}}));
 assert.equal(Profile.inputIdentity(e),Profile.inputIdentity({...e,solution_generation_policy:{model:'another',effort:'low'}}));
 const e2=entry();e2.input=I.input({question:{body:'넓이를\n구하시오.'},scope:'중2'});assert.equal(Profile.inputIdentity(e),Profile.inputIdentity(e2));
 assert.ok(!JSON.stringify(e.input.payload).includes('difficulty'));assert.ok(!JSON.stringify(e.input.payload).includes('answer'));
});
test('snapshot and transition remove prior active scores only after complete gates; failed stays null',()=>{
 const current=Array.from({length:20},(_,i)=>({question_id:'q'+i,revision_id:'r',metadata:{source:{schoolId:'school'},processing:{displayCorrection:{a:1}},difficulty:{userScore:9,aiScore:8,history:[{score:7}],scope:{grade:'중2'}}},confirmed:{difficulty:9,answer:'54',review:true}}));
 const backup=Cut.snapshot(current),before=JSON.stringify(current);
 const results=current.map((c,i)=>({question_id:c.question_id,question_revision_id:'r',spec_revision:'1.2.1',prompt_hash:Profile.promptHash,json_schema_hash:Profile.schemaHash,scorer_code_hash:Profile.scorerCodeHash,final_status:i===0?'failed':'complete',final_score:i===0?null:4.7,final_tier:i===0?null:'T2',evaluation_run_id:'run'}));
 const patches=Cut.plan({snapshot:backup,results,current,acceptancePassed:true});assert.equal(JSON.stringify(current),before);
 assert.equal(patches[0].metadata.difficulty.userScore,undefined);assert.equal(patches[0].confirmed.difficulty,undefined);assert.equal(patches[0].confirmed.answer,'54');assert.deepEqual(patches[0].metadata.processing,current[0].metadata.processing);assert.equal(Cut.effective(patches[0].metadata).score,null);
 const later=structuredClone(patches[1].metadata);later.difficulty.teacher_override_active=true;later.difficulty.teacher_override_score=6;assert.equal(Cut.effective(later).score,6);
 assert.throws(()=>Cut.plan({snapshot:backup,results:results.slice(1),current,acceptancePassed:true}));
 assert.throws(()=>Cut.plan({snapshot:backup,results:results.map(r=>({...r,final_status:'failed',final_score:null,final_tier:null})),current,acceptancePassed:true}),/5%/);
 assert.throws(()=>Cut.plan({snapshot:backup,results,current,acceptancePassed:false}));
 const changed=structuredClone(current);changed[0].confirmed.difficulty=8;assert.throws(()=>Cut.plan({snapshot:backup,results,current:changed,acceptancePassed:true}),/concurrent/);
});
test('approved prompt contains d and boundary examples; forced split and target labels absent',()=>{
 assert.match(Profile.instructions,/\(d\).*증명/);assert.match(Profile.instructions,/M2\/M3/);assert.match(Profile.instructions,/최소 3개 같은 발견 개수 하한은 없다/);
 assert.doesNotMatch(Profile.instructions,/문해력\s*\+2|V[1-8]|신구중|9\.8|8\.7|발견으로 나누어 기록하세요/);
 assert.match(Profile.schema.properties.literacy_evidence_type.description,/proof blanks/);
});
test('subscription adapter validates locally, never sends saved answer, and separates revisions',async()=>{
 const fs=require('fs'),os=require('os'),path=require('path'),{EventEmitter}=require('events'),{PassThrough}=require('stream'),R=require('../app/difficulty-v12/subscription.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'v121-adapter-')),e=entry();e.validationContext={...context,storedAnswer:'private_expected_answer'};
 let calls=0;const results=[];
 const launch=(exe,args)=>{calls++;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{};
  child.stdin.on('data',b=>assert.ok(!b.toString().includes('private_expected_answer')));
  setImmediate(()=>{fs.writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify(value()));child.stdout.write(JSON.stringify({type:'turn.completed'})+'\n');child.emit('close',0);});return child;};
 const options={outputRoot:root,scoringProfile:Profile.id,executionProfile:'luna-medium',launch};
 try{
  results.push(await R.runOne(e,options));assert.equal(results[0].status,'failed');assert.equal(results[0].raw.derived_answer,'54');
  await R.runOne(e,options);assert.equal(calls,1);
  results.push(await R.runOne({...e,revisionId:'r2'},options));assert.equal(calls,2);assert.notEqual(results[0].key,results[1].key);
 }finally{for(const r of results){const dir=path.join(root,r.key);for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}fs.rmdirSync(root);}
});
