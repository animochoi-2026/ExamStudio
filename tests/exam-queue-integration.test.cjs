'use strict';
require('./offline-guard.cjs');
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
// Historical combined-assessment fixtures explicitly exercise their original
// version. The canonical queue path has its own mock-transport test below.
const canonicalFlag=require('../app/difficulty-v121-config.json');
const originalCanonicalEnabled=canonicalFlag.enabled;
before(()=>{canonicalFlag.enabled=false;});
after(()=>{canonicalFlag.enabled=originalCanonicalEnabled;});
const {ProjectStore}=require('../app/store.cjs'),{Workflow}=require('../app/workflow.cjs'),{ExamQueue}=require('../app/exam-queue.cjs'),{RegionDetector}=require('../app/region-detector.cjs'),{QuestionBank}=require('../app/question-bank.cjs'),{BankAnalysis}=require('../app/bank-analysis.cjs'),{SharedBankStorage}=require('../app/shared-bank-storage.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBvUAAAAASUVORK5CYII=','base64');
let server;before(async()=>{server=await require('./shared-bank-local-server.cjs').localServer();});after(async()=>server.close());
const numbering={section:'objective',total:null,objectiveCount:null,writtenCount:null,confirmed:false,uncertain:false,evidence:'인쇄 객관식 번호'};
const classification={primaryUnitId:'m1-4.3',relatedUnitIds:[],conditionUnitIds:[],solutions:[{label:'일차방정식',unitIds:['m1-4.3'],concepts:['이항'],lastUnitId:'m1-4.3'}],types:[{id:'task.expression',evidence:'x의 값을 구하시오',repeatKey:'task.expression|m1-4.3|isolate_variable',coreName:'일차방정식의 상수 이항',coreDefinition:'일차방정식 양변에서 상수를 빼 미지수의 값을 구한다.'}],typeReason:'인쇄 요구 작업'};
const features={conceptCombination:'한 개념',keyInsight:'이항',reasoningSteps:'두 단계',calculationLoad:'낮음',caseSplit:'없음',geometryInterpretation:'없음'};
function recognition(){return {...require('./workflow-fixtures.cjs').recognition(),body:'1. $x+1=3$일 때 x의 값을 구하시오. [4.2점]',originalNumber:'1',sourceNumbering:numbering,layoutDocument:null,choices:['1','2','3','4','5'],conditions:[],marks:[],observedDiagram:null,domains:['algebra']};}
function solve(){const validation=require('./workflow-fixtures.cjs').validation();validation.correctChoiceIndices=[1];return {reply:'풀이',answer:'②',solution:'양변에서 1을 빼면 x=2이다. 대입해서 확인한다.',questionType:'single_choice',validation,holdReason:'',assessment:{status:'estimated',answer:'2',solutionSummary:'양변에서 1을 빼 x=2',scopeCheck:'일차방정식 범위',baselineCertificate:{rule:'B0',originalObjectsOnly:true,sameRepresentation:true,evidence:'인쇄된 식에서 직접 상수를 이항'},mainDiscovery:'양변에서 1을 뺀다',selectionCue:'x+1=3',justification:'등식의 성질',missingGuidance:'없음',accessLevel:'S0',levelRationale:'주어진 식에 등식의 성질 직접 적용',lowerLevelCheck:'기본 성질 직접 적용',remainingAfterHint:{hint:'양변에서 1을 뺀다',remaining:'계산',independentStructuralTransfer:false,evidence:'추가 구조 없음'},easiestAlternative:'직접 대입',reasoningLevel:'R0',residualReasoning:'추가 추론 없음',limitations:[]},queueClassification:classification};}
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-phase2-integration-'));t.after(()=>{bank.close();assert.equal(path.dirname(dir),os.tmpdir());fs.rmSync(dir,{recursive:true,force:true});});const file=path.join(dir,'신구중 2026 중2 2학기 기말고사.png');fs.writeFileSync(file,png);const store=new ProjectStore(path.join(dir,'data')),queue=new ExamQueue({directory:store.dataDir,store}),calls=[];queue.action('limits',null,{remainingPercent:null});let reply=null;
 const bridge={run:async request=>{calls.push(request);if(reply)return reply(request);if(request.execution.task==='region_detection')return {result:{regions:[{order:1,x:0,y:0,width:1,height:1,kind:'question',group:'objective:1',continuationOf:null}]}};return {result:request.execution.task==='recognition'?{reply:'인식',recognition:recognition()}:solve(),tokens:{totalTokens:10}};}};
 const getSettings=()=>({model:'fixture-sol',effort:'high'}),workflow=new Workflow({store,directory:store.dataDir,getBridge:()=>queue.bridge(bridge),getSettings}),regionDetector=new RegionDetector({store,getBridge:()=>queue.bridge(bridge),getSettings});
 const auth=server.auth(server.A),storage=new SharedBankStorage({auth,fetchImpl:server.fetch}),bank=new QuestionBank({directory:path.join(dir,'bank'),store,storage,auth,appVersion:'0.4.13',buildDocx:async(_,file)=>fs.writeFileSync(file,Buffer.from('isolated docx fixture'))});bank.autonomous=false;
 const analysis=new BankAnalysis({store,getBridge:()=>queue.bridge(bridge),getSettings}),handlers={};require('../app/exam-queue-main.cjs').installExamQueue({queue,store,workflow,regionDetector,bankAccess:()=>({bank:()=>bank,analysis}),handle:(key,fn)=>handlers[key]=fn,busy:new Map()});
 const item=queue.item(queue.add([file]).added[0].id);queue.edit(item.id,{scope:{grade:'중2',semester:'2학기',domains:['algebra'],units:['일차방정식'],prerequisites:['이항'],forbidden:[],restrictions:''},scopeConfirmed:true,metadata:{numbering:{total:1,objectiveCount:1,writtenCount:0,confirmed:true}}});queue.action('start');return {dir,file,store,queue,item,workflow,bank,storage,calls,handlers,setReply:r=>reply=r};}
async function prepare(f){await f.bank.root();await f.handlers.examQueuePrepare({id:f.item.id});await f.handlers.examQueueDiscovery({id:f.item.id,pages:1});const regions=await f.handlers.examQueueRegions({id:f.item.id,page:1,imageDataUrl:'data:image/png;base64,'+png.toString('base64'),provider:'codex'});assert.equal(regions.held,undefined,JSON.stringify(regions));const project=f.handlers.examQueueCapture({id:f.item.id,page:1,index:0,region:regions.result.regions[0],imageDataUrl:'data:image/png;base64,'+png.toString('base64'),hint:regions.result.hints[0]});return project.problems[0].id;}
async function step(f,id,stage){const result=await f.handlers.examQueueStep({id:f.item.id,problemId:id,stage,provider:'codex'});assert.equal(result.held,undefined,stage+': '+JSON.stringify(result));return result;}

test('canonical queue uses explicit mock difficulty transport and saved checkpoint without external IO',async t=>{
 const Subscription=require('../app/difficulty-v122/subscription.cjs'),originalProvider=Subscription.provider;
 const blocked=globalThis[Symbol.for('examstudio.offline-test-guard')].blocked.length;
 let mockCalls=0;
 canonicalFlag.enabled=true;
 Subscription.provider=()=>async request=>{
  mockCalls++;
  return {status:'complete',model:request.model,effort:request.effort,
   raw:require('./difficulty-v122-entrypoints.test.cjs').fixture(request.prepared)};
 };
 try{
  const f=fixture(t),id=await prepare(f);
  for(const stage of ['recognition','solve','analysis'])await step(f,id,stage);
  assert.equal(mockCalls,1);
  const saved=await require('../app/difficulty-v122/upload.cjs').savedResult({
   bank:f.bank,store:f.store,projectId:f.item.projectId,questionId:f.store.get(f.item.projectId).problems[0].original.id});
  assert.equal(saved.status,'complete');
  await step(f,id,'analysis');
  assert.equal(mockCalls,1);
  assert.equal(globalThis[Symbol.for('examstudio.offline-test-guard')].blocked.length,blocked);
 }finally{Subscription.provider=originalProvider;canonicalFlag.enabled=false;}
});

test('stored-only recovery imports saved metadata and uploads without AI or resetting another exam',async t=>{
 const f=fixture(t),pid=await prepare(f);for(const kind of ['recognition','solve'])await step(f,pid,kind);
 const otherFile=path.join(f.dir,'other.png');fs.writeFileSync(otherFile,Buffer.concat([png,Buffer.from('other')]));
 const other=f.queue.item(f.queue.add([otherFile]).added[0].id);other.status='waiting';other.steps.test={kind:'solve',status:'waiting_login',reason:'preserve'};
 f.queue.action('pause');const before=JSON.stringify(other),calls=f.calls.length,original=structuredClone(f.store.get(f.item.projectId).problems[0].original);
 const result=await f.handlers.examQueueRecoverStored({id:f.item.id});assert(!result.results.some(r=>r.held||r.stopped),JSON.stringify(result));
 assert.equal(f.calls.length,calls);assert.equal(JSON.stringify(other),before);assert.equal(f.queue.state.mode,'paused');assert.equal(f.bank.state.jobs.at(-1).committed,true);
 const current=f.store.get(f.item.projectId).problems[0].original;assert.equal(current.solution,original.solution);assert.equal(current.answer,original.answer);assert.equal(current.approval.status,'pending');
 const count=f.bank.state.jobs.length;await f.handlers.examQueueRecoverStored({id:f.item.id});assert.equal(f.bank.state.jobs.length,count);assert.equal(f.calls.length,calls);
});

test('manual committed revision reconciles only exact current upload input without retransmission',async t=>{
 const f=fixture(t),pid=await prepare(f);for(const kind of ['recognition','solve','analysis','upload'])await step(f,pid,kind);
 const project=f.store.get(f.item.projectId),q=project.problems[0].original;
 const entry=Object.values(f.bank.state.items).find(i=>i.problemId===pid);
 // Simulate an explicit manual registration with the same current content.
 entry.metadata.management.note='manual registration';
 await f.bank.enqueue(project.id,[q.id],{},{queueWebReview:true});const job=f.bank.state.jobs.at(-1);await f.bank.process(job);
 assert.equal(job.queueManaged,undefined);assert(job.committed);
 const checkpoint=f.item.steps[pid+':upload'];checkpoint.status='pending';checkpoint.fingerprint='old-input';
 f.queue.action('pause');const calls=f.calls.length,count=f.bank.state.jobs.length;
 const remote=f.bank.remoteHeads.bind(f.bank);
 for(const heads of [[],[{revisionId:job.revisionId},{revisionId:'other-head'}]]){
  f.bank.remoteHeads=async()=>heads;
  const blocked=await f.handlers.examQueueStep({id:f.item.id,problemId:pid,stage:'upload',lookupOnly:true});
  assert(blocked.held);assert.notEqual(checkpoint.status,'complete');
 }
 f.bank.remoteHeads=remote;
 const result=await f.handlers.examQueueRecoverStored({id:f.item.id});
 assert(!result.results.some(r=>r.held),JSON.stringify(result));assert.equal(checkpoint.status,'complete');
 assert.equal(checkpoint.result.revisionId,job.revisionId);assert(checkpoint.result.reconciledManualUpload);assert(checkpoint.history.length);
 assert.equal(f.bank.state.jobs.length,count);assert.equal(f.calls.length,calls);
});

test('manual revision with stale content cannot satisfy queue upload',async t=>{
 const f=fixture(t),pid=await prepare(f);for(const kind of ['recognition','solve','analysis','upload'])await step(f,pid,kind);
 const job=f.bank.state.jobs.at(-1);delete job.queueManaged;delete job.queueInputFingerprint;
 const checkpoint=f.item.steps[pid+':upload'];checkpoint.status='pending';checkpoint.fingerprint='old-input';
 f.store.updateProblem(f.item.projectId,pid,p=>{p.original.body+=' changed';});f.queue.action('pause');
 const result=await f.handlers.examQueueStep({id:f.item.id,problemId:pid,stage:'upload',lookupOnly:true});
 assert(result.held);assert.equal(result.retryable,false);assert.notEqual(checkpoint.status,'complete');assert.equal(f.bank.state.jobs.length,1);
});

test('stored-only recovery refuses missing solution and never dispatches AI',async t=>{
 const f=fixture(t),pid=await prepare(f);await step(f,pid,'recognition');f.queue.action('pause');const calls=f.calls.length;
 const result=await f.handlers.examQueueRecoverStored({id:f.item.id});assert(result.results.some(r=>r.held),JSON.stringify(result));assert.equal(f.calls.length,calls);assert.equal(f.bank.state.jobs.length,0);
});

test('stored-only recovery retries existing failed revision after remote lookup',async t=>{
 const f=fixture(t),pid=await prepare(f);for(const kind of ['recognition','solve','analysis'])await step(f,pid,kind);
 const process=f.bank.process.bind(f.bank);f.bank.process=async()=>{throw Error('복합 배치 그림을 표시할 수 없습니다: fixture');};
 await f.handlers.examQueueStep({id:f.item.id,problemId:pid,stage:'upload'});f.queue.action('pause');f.bank.process=process;
 const calls=f.calls.length,job=f.bank.state.jobs.at(-1),result=await f.handlers.examQueueRecoverStored({id:f.item.id});
 assert(!result.results.some(r=>r.held||r.stopped),JSON.stringify(result));assert.equal(f.calls.length,calls);assert.equal(f.bank.state.jobs.length,1);assert.equal(job.committed,true);
});

test('old scope draft does not block a newly requested bulk solve or approve the source',async t=>{
 const f=fixture(t),id=await prepare(f);await step(f,id,'recognition');
 f.store.updateProblem(f.item.projectId,id,p=>{p.original.solutionDraft={answer:'old scope',solution:'old draft',holdReason:'범위 밖',validation:{status:'failed',scopeStatus:'incompatible'}};});
 await step(f,id,'solve');const p=f.store.get(f.item.projectId).problems[0];
 assert.equal(p.original.solutionDraft,undefined);assert.equal(p.original.solutionDraftHistory.length,1);assert.equal(p.recognition.confirmed,false);assert.notEqual(p.original.approval.status,'approved');
 assert.equal(f.calls.filter(c=>c.execution.task==='solve').length,1);
});

test('bulk set proposal uploads pending without creating a reviewed set',async t=>{
 const f=fixture(t),id=await prepare(f);await step(f,id,'recognition');
 // The local server fixture predates the set registry. Stub only its empty
 // read response; revision upload and commit still use the real local database.
 const rpc=f.storage.rpc.bind(f.storage);f.storage.rpc=(name,args)=>{assert.notEqual(name,'bank_question_set_save');return name==='bank_question_sets_get'?Promise.resolve([]):rpc(name,args);};
 f.store.updateProblem(f.item.projectId,id,p=>{p.original.body='[1~2] 공통 조건 '+p.original.body;});
 await step(f,id,'solve');await step(f,id,'analysis');await step(f,id,'upload');
 const item=Object.values(f.bank.state.items).find(i=>i.problemId===id);
 assert.equal(item.metadata.reviews.questionSet.status,'pending');assert.equal(item.metadata.relations.questionSet.complete,false);
 assert.equal(f.bank.state.jobs.at(-1).committed,true);
 const registry=await f.storage.rpc('bank_question_sets_get',{s:f.bank.auth.config().spaceId});assert.equal(registry.length,0);
});

test('intended solution with deferred combined assessment continues metadata then upload without repeating solution',async t=>{
 const f=fixture(t);f.queue.autoReview=true;const id=await prepare(f);await step(f,id,'recognition');
 f.setReply(async request=>{assert.equal(request.execution.task,'solve');return {result:{...solve(),intendedSolution:{answer:'②',interpretation:'출제 의도인 x+1=3으로 계산한다.',sourceError:'인쇄된 부가 조건 오류'},assessment:{...solve().assessment,status:'deferred',limitations:['원문 조건 오류']}}};});
 await step(f,id,'solve');const before=structuredClone(f.store.get(f.item.projectId).problems[0].original);
 f.setReply(async request=>{assert.equal(request.execution.task,'bank_metadata');assert.equal(JSON.parse(request.text).question.intendedSolution.answer,'②');return {result:{...classification,originalNumber:'1',assessment:solve().assessment}};});
 await step(f,id,'analysis');await step(f,id,'upload');
 const after=f.store.get(f.item.projectId).problems[0].original;assert.equal(after.body,before.body);assert.equal(after.solution,before.solution);assert.equal(after.answer,before.answer);
 assert.equal(f.calls.filter(c=>c.execution.task==='solve').length,1);assert.equal(f.calls.filter(c=>c.execution.task==='bank_metadata').length,1);assert.equal(f.bank.state.jobs.length,1);assert.equal(f.bank.state.jobs[0].committed,true);
 await step(f,id,'analysis');await step(f,id,'upload');assert.equal(f.calls.filter(c=>c.execution.task==='bank_metadata').length,1);assert.equal(f.bank.state.jobs.length,1);
});

test('bulk queue preserves recognition warnings and commits pending for web review without teacher approval',async t=>{
 const f=fixture(t);f.queue.autoReview=true; // Even a legacy in-memory flag cannot auto-approve.
 const id=await prepare(f);await step(f,id,'recognition');
 const warning={kind:'reading',text:'원문 기호 확인',location:{regionIndex:null,description:'기호'}};
 f.store.updateProblem(f.item.projectId,id,p=>{p.recognition.confirmed=false;p.recognition.uncertainties=[warning];p.warnings=[warning.text];});
 const before=structuredClone(f.store.get(f.item.projectId).problems[0].recognition);
 for(const stage of ['solve','analysis','upload'])await step(f,id,stage);
 const project=f.store.get(f.item.projectId),p=project.problems[0],item=f.bank.ensure(project,p,p.original);
 for(const k of ['body','choices','conditions','marks','version','confirmed','uncertainties','observedDiagram'])assert.deepEqual(p.recognition[k],before[k],k);assert.deepEqual(p.warnings,[warning.text]);
 assert.equal(p.original.approval.status,'pending');assert.equal(p.original.needsReview,true);
 assert.equal(item.metadata.management.review,'pending');assert.deepEqual(item.metadata.reviews.recognition.uncertainties,[warning]);
 assert.equal(f.bank.state.jobs[0].status,'complete');assert.equal(f.queue.status().items[0].summary.reviewed,0);
 const revision=(await f.storage.rows('bank_revisions','id=eq.'+f.bank.state.jobs[0].revisionId))[0];assert.equal(revision.visibility,'shared_pending');assert.equal(revision.review_version,0);
 const call=f.calls.find(c=>c.execution.task==='solve');assert.match(call.execution.instructions,/웹 검수 예정/);assert.ok(call.images.length);
 assert.deepEqual(JSON.parse(call.text.split('현재 작업 자료(분석 대상):\n')[1].split('\n\n사용자 요청:')[0]).source.uncertainties,[warning]);
 for(const stage of ['solve','analysis','upload'])await step(f,id,stage);
 assert.equal(f.calls.filter(c=>c.execution.task==='solve').length,1);assert.equal(f.calls.filter(c=>c.execution.task==='recognition').length,1);assert.equal(f.bank.state.jobs.length,1);
});

test('legacy broad type is repaired from saved solution without OCR solution or difficulty replacement',async t=>{
 const f=fixture(t),id=await prepare(f);await step(f,id,'recognition');await step(f,id,'solve');
 f.store.updateProblem(f.item.projectId,id,p=>{p.original.queueClassification.value.types=[{id:'task.expression',repeatKey:'task.expression',coreName:'식 계산',coreDefinition:'식 계산',evidence:'x의 값을 구하시오'}];});
 const before=structuredClone(f.store.get(f.item.projectId).problems[0].original),score=before.assessment;
 f.setReply(async request=>{assert.equal(request.execution.task,'bank_types');return {result:{types:classification.types,typeReason:'저장 풀이의 이항'},tokens:{totalTokens:1}};});
 await step(f,id,'analysis');await step(f,id,'upload');const after=f.store.get(f.item.projectId).problems[0].original;
 assert.equal(after.body,before.body);assert.equal(after.solution,before.solution);assert.deepEqual(after.assessment,score);assert.equal(f.calls.filter(c=>c.execution.task==='bank_types').length,1);assert.equal(f.calls.filter(c=>c.execution.task==='solve').length,1);assert.equal(f.bank.state.jobs[0].status,'complete');
});

test('zero-AI metadata repair preserves saved solution and actual warnings without treating absent solutions as done',async t=>{
 const f=fixture(t),pid=await prepare(f);for(const stage of ['recognition','solve','analysis'])await step(f,pid,stage);
 f.queue.action('pause');const before=structuredClone(f.store.get(f.item.projectId).problems[0]),calls=f.calls.length;
 f.store.updateProblem(f.item.projectId,pid,p=>{p.recognition.points=null;p.original.originalPoints=null;p.recognition.originalRecognizedBody='printed question (4.2점)';});
 const result=f.handlers.examQueueRepairMetadata({id:f.item.id,problemIds:[pid]});assert.equal(result.results[0].pointsRecovered,true);
 const after=f.store.get(f.item.projectId).problems[0];assert.equal(after.recognition.points,4.2);assert.equal(after.original.originalPoints,4.2);assert.equal(after.original.body,before.original.body);assert.equal(after.original.answer,before.original.answer);assert.equal(after.original.solution,before.original.solution);assert.equal(after.id,before.id);assert.equal(f.calls.length,calls);assert.equal(f.item.steps[pid+':solve'].status,'complete');
});

test('zero-AI upload-only retry resumes a partial existing revision once without resetting other checkpoints',async t=>{
 const f=fixture(t),pid=await prepare(f);for(const stage of ['recognition','solve','analysis'])await step(f,pid,stage);
 const process=f.bank.process.bind(f.bank);let transfers=0;f.bank.process=async job=>{transfers++;if(transfers===1){job.status='uploading';f.bank.save();throw Object.assign(Error('network disconnected'),{code:'network'});}return process(job);};
 const first=await f.handlers.examQueueStep({id:f.item.id,problemId:pid,stage:'upload'});assert.equal(first.status,'unknown');
 const job=f.bank.state.jobs.at(-1),jobId=job.id,revision=job.revisionId,calls=f.calls.length,protectedStages=JSON.stringify(Object.fromEntries(Object.entries(f.item.steps).filter(([k])=>!k.endsWith(':upload'))));
 f.queue.action('pause');const recovery=await f.handlers.examQueueRetryUpload({id:f.item.id,problemId:pid});assert.equal(recovery.held,undefined,JSON.stringify(recovery));assert.equal(f.queue.state.mode,'paused');assert.equal(f.item.steps[pid+':upload'].uploadRecoveryRetries,1);assert.equal(f.bank.state.jobs.length,1);assert.equal(job.id,jobId);assert.equal(job.revisionId,revision);assert.equal(job.committed,true);assert.equal(transfers,2);assert.equal(f.calls.length,calls);assert.equal(JSON.stringify(Object.fromEntries(Object.entries(f.item.steps).filter(([k])=>!k.endsWith(':upload')))),protectedStages);
});

test('zero-AI upload recovery queries lost commit response without retransfer and lookup failure never authorizes retry',async t=>{
 const f=fixture(t),pid=await prepare(f);for(const stage of ['recognition','solve','analysis','upload'])await step(f,pid,stage);
 const job=f.bank.state.jobs.at(-1),s=f.item.steps[pid+':upload'],calls=f.calls.length;job.committed=false;job.status='uploading';delete job.remote.commit;s.status='unknown';s.reason='network response lost';f.queue.action('pause');
 const heads=f.bank.remoteHeads.bind(f.bank);f.bank.remoteHeads=async()=>{throw Object.assign(Error('network lookup lost'),{code:'network'});};
 const blocked=await f.handlers.examQueueRetryUpload({id:f.item.id,problemId:pid});assert.equal(blocked.held,true);assert.equal(s.uploadRecoveryRetries,undefined);assert.equal(s.status,'unknown');
 f.bank.remoteHeads=heads;f.bank.process=async()=>{throw Error('must not retransfer committed revision');};
 const recovered=await f.handlers.examQueueRetryUpload({id:f.item.id,problemId:pid});assert.equal(recovered.reused,true);assert.equal(s.status,'complete');assert.equal(s.uploadRecoveryRetries,undefined);assert.equal(f.calls.length,calls);assert.equal(f.bank.state.jobs.length,1);
});

test('zero-AI repeated upload failure consumes only one recovery and keeps original job',async t=>{
 const f=fixture(t),pid=await prepare(f);for(const stage of ['recognition','solve','analysis'])await step(f,pid,stage);
 let transfers=0;f.bank.process=async()=>{transfers++;throw Object.assign(Error('network upload lost'),{code:'network'});};
 await f.handlers.examQueueStep({id:f.item.id,problemId:pid,stage:'upload'});f.queue.action('pause');const calls=f.calls.length;
 const failed=await f.handlers.examQueueRetryUpload({id:f.item.id,problemId:pid});assert.equal(failed.status,'unknown');assert.equal(transfers,2);
 await assert.rejects(f.handlers.examQueueRetryUpload({id:f.item.id,problemId:pid}),/상한/);assert.equal(transfers,2);assert.equal(f.bank.state.jobs.length,1);assert.equal(f.calls.length,calls);assert.equal(f.queue.state.mode,'paused');
});
test('confirmed header counts resolve cropped total uncertainty; an unrecognized neighbor does not block a normal upload',async t=>{
 const f=fixture(t);f.queue.edit(f.item.id,{metadata:{numbering:{total:2,objectiveCount:2,writtenCount:0,confirmed:true}}});const p=await prepare(f);
 f.handlers.examQueueCapture({id:f.item.id,page:1,index:1,region:{x:0,y:0,width:1,height:1},imageDataUrl:'data:image/png;base64,'+png.toString('base64'),hint:{kind:'question',group:'objective:2'}});
 f.setReply(async request=>({result:request.execution.task==='recognition'?{reply:'cropped recognition',recognition:{...recognition(),sourceNumbering:{...numbering,uncertain:true,evidence:'문항 번호 1과 객관식 선택지가 보임. 전체 문항 수 표제는 보이지 않음.'}}}:solve(),tokens:{totalTokens:10}}));
 for(const stage of ['recognition','solve','analysis','upload'])await step(f,p,stage);
 const project=f.store.get(f.item.projectId),r=project.problems[0].recognition;assert.equal(r.sourceNumbering.total,2);assert.equal(r.aiSourceNumbering.total,null);assert.equal(r.uncertainties.length,0);assert.equal(f.calls.filter(c=>c.execution.task==='recognition').length,1);assert.equal(f.bank.state.jobs.length,1);assert.equal(f.bank.state.jobs[0].status,'complete');assert.equal(project.problems.length,2);assert.equal(require('../app/exam-queue.cjs').summary(f.item,project).whole,false);assert.equal(fs.existsSync(f.file),true);
});
test('existing recognition + one combined solve + shared local registration, review pending and no original copies',async t=>{const f=fixture(t),p=await prepare(f);for(const stage of ['recognition','solve','analysis','upload'])await step(f,p,stage);
 assert.deepEqual(f.calls.map(c=>c.execution.task),['region_detection','recognition','solve']);const question=f.store.get(f.item.projectId).problems[0].original;assert.equal(question.approval.status,'pending');assert.equal(f.store.get(f.item.projectId).problems[0].recognition.points,4.2);assert.equal(f.bank.state.jobs.length,1);assert.equal(f.bank.state.jobs[0].status,'complete');const metadata=f.bank.ensure(f.store.get(f.item.projectId),f.store.get(f.item.projectId).problems[0],question).metadata;assert.equal(metadata.difficulty.aiScore,'2.0');assert.equal(metadata.difficulty.aiBand,'쉬움');assert.equal(metadata.classification.primaryUnit.id,'m1-4.3');
 const outbox=path.join(f.bank.dir,'outbox',f.bank.state.jobs[0].id,'native','assets');assert.equal(fs.readdirSync(outbox).some(n=>n===path.basename(f.file)),false);const finished=f.handlers.examQueueFinish({id:f.item.id});assert.equal(finished.items[0].move.status,'complete');assert.equal(fs.existsSync(f.file),false);assert.equal(f.store.get(f.item.projectId).source.path,f.item.currentPath);
 f.queue.action('retry',f.item.id);f.queue.action('resume');await f.handlers.examQueuePrepare({id:f.item.id});for(const stage of ['recognition','solve','analysis','upload'])await step(f,p,stage);assert.equal(f.calls.length,3);assert.equal(f.bank.state.jobs.length,1);
});
test('unknown grade and scope permit OCR but hold solve until scope is explicit',async t=>{const f=fixture(t);f.queue.edit(f.item.id,{metadata:{grade:''},scope:null,scopeConfirmed:false});const p=await prepare(f);await step(f,p,'recognition');let result=await f.handlers.examQueueStep({id:f.item.id,problemId:p,stage:'solve'});assert.equal(result.held,true);assert.equal(f.calls.filter(c=>c.execution.task==='solve').length,0);f.queue.edit(f.item.id,{scope:{grade:'중2',semester:'2학기',domains:['algebra'],units:['일차방정식'],prerequisites:[],forbidden:[],restrictions:''},scopeConfirmed:true});await f.handlers.examQueuePrepare({id:f.item.id});await step(f,p,'recognition');await step(f,p,'solve');assert.equal(f.calls.filter(c=>c.execution.task==='recognition').length,1);});
test('page retry and explicit continuation keep one question ID across two regions',async t=>{const f=fixture(t),p=await prepare(f);const saved=f.handlers.examQueueCapture({id:f.item.id,page:2,index:0,region:{x:0,y:0,width:1,height:1},imageDataUrl:'data:image/png;base64,'+png.toString('base64'),hint:{kind:'question',group:'objective:1',continuationOf:'objective:1'}});assert.equal(saved.problems.length,1);assert.equal(saved.problems[0].id,p);assert.equal(saved.problems[0].regions.length,2);assert.equal(f.handlers.examQueueCapture({id:f.item.id,page:2,index:0,region:{x:0,y:0,width:1,height:1},imageDataUrl:'data:image/png;base64,'+png.toString('base64')}).problems[0].regions.length,2);});
test('manual edit during a solve rejects stale AI response and preserves existing question',async t=>{const f=fixture(t),p=await prepare(f);await step(f,p,'recognition');let release;f.setReply(async()=>{await new Promise(r=>release=r);return {result:solve()};});const promise=f.handlers.examQueueStep({id:f.item.id,problemId:p,stage:'solve'});await new Promise(resolve=>setImmediate(resolve));assert.ok(release);const before=f.store.get(f.item.projectId).problems[0].original.id;f.store.updateProblem(f.item.projectId,p,x=>{x.original.body='수동 교정 원문';x.recognition.body='수동 교정 원문';x.recognition.correctedByUser=true;x.recognition.version++;});release();assert.equal((await promise).held,true);const q=f.store.get(f.item.projectId).problems[0].original;assert.equal(q.body,'수동 교정 원문');assert.equal(q.id,before);assert.equal(q.answer,'');});
test('missing metadata holds upload only and retains processed content',async t=>{const f=fixture(t),p=await prepare(f);for(const stage of ['recognition','solve','analysis'])await step(f,p,stage);f.queue.edit(f.item.id,{metadata:{school:''}});const result=await f.handlers.examQueueStep({id:f.item.id,problemId:p,stage:'upload'});assert.equal(result.held,true);assert.equal(f.bank.state.jobs.length,0);assert.ok(f.store.get(f.item.projectId).problems[0].original.solution);assert.equal(fs.existsSync(f.file),true);});
test('actual local shared commit response loss is reconciled without new revision or file upload',async t=>{const f=fixture(t),p=await prepare(f);for(const stage of ['recognition','solve','analysis'])await step(f,p,stage);let puts=0,lost=false;const put=f.storage.put.bind(f.storage);f.storage.put=async args=>{puts++;const result=await put(args);if(args.properties.role==='commit'&&!lost){lost=true;throw Object.assign(Error('network response lost after commit'),{code:'ECONNRESET'});}return result;};const first=await f.handlers.examQueueStep({id:f.item.id,problemId:p,stage:'upload'});assert.equal(first.status,'unknown');const before=puts;assert.equal(f.bank.state.jobs.length,1);const second=await step(f,p,'upload');assert.equal(second.reused,true);assert.equal(puts,before);assert.equal(f.bank.state.jobs.length,1);assert.equal(f.bank.state.jobs[0].committed,true);});
test('manual source edit invalidates affected downstream checkpoints, scope never invalidates OCR',async t=>{const f=fixture(t),p=await prepare(f);for(const stage of ['recognition','solve','analysis','upload'])await step(f,p,stage);f.workflow.saveScope(f.item.projectId,{grade:'중2',semester:'2학기',domains:['algebra'],units:['일차방정식'],prerequisites:['유리수'],forbidden:[],restrictions:''});assert.equal(f.item.steps[p+':recognition'].status,'complete');for(const s of ['solve','analysis','upload'])assert.equal(f.item.steps[p+':'+s].status,'pending');assert.equal(f.item.projectId,f.store.get(f.item.projectId).id);assert.deepEqual(f.item.scope.prerequisites,['유리수']);f.handlers.examQueuePrepare({id:f.item.id});assert.deepEqual(f.store.get(f.item.projectId).scope.prerequisites,['유리수']);f.handlers.examQueueDiscovery({id:f.item.id,issue:'ENOSPC project crop write failed'});assert.equal(f.queue.state.mode,'paused');});

test('native move failure and lost reply retain actual committed upload without new revision',async t=>{const f=fixture(t),p=await prepare(f);for(const stage of ['recognition','solve','analysis','upload'])await step(f,p,stage);const initialJobs=f.bank.state.jobs.length,initialCalls=f.calls.length;f.queue.moveFile=()=>{throw Object.assign(Error('device move denied'),{code:'EACCES'});};f.handlers.examQueueFinish({id:f.item.id});assert.equal(f.item.move.status,'failed');assert.equal(fs.existsSync(f.file),true);assert.equal(f.bank.state.jobs.at(-1).status,'complete');for(const stage of ['recognition','solve','analysis','upload'])await step(f,p,stage);assert.equal(f.bank.state.jobs.length,initialJobs);assert.equal(f.calls.length,initialCalls);const native=require('../app/windows-move.cjs').moveNoReplace;let renames=0;f.queue.moveFile=(source,target,options)=>{renames++;native(source,target,options);throw Object.assign(Error('response lost after native move'),{moveResultUnknown:true});};f.handlers.examQueueMove({id:f.item.id});assert.equal(f.item.move.status,'complete');assert.equal(fs.existsSync(f.file),false);assert.equal(renames,1);assert.equal(f.bank.state.jobs.length,initialJobs);assert.equal(f.calls.length,initialCalls);f.handlers.examQueueMove({id:f.item.id});assert.equal(renames,1);});

test('changed original after checkpoints holds direct upload and resume without modifying saved question',async t=>{const f=fixture(t),p=await prepare(f);for(const stage of ['recognition','solve','analysis'])await step(f,p,stage);const original=structuredClone(f.store.get(f.item.projectId).problems[0].original);fs.appendFileSync(f.file,Buffer.from('changed original'));assert.throws(()=>f.handlers.examQueuePrepare({id:f.item.id}));const result=await f.handlers.examQueueStep({id:f.item.id,problemId:p,stage:'upload'});assert.equal(result.held,true);assert.equal(f.bank.state.jobs.length,0);assert.deepEqual(f.store.get(f.item.projectId).problems[0].original,original);assert.equal(fs.existsSync(f.file),true);});
test('restart reconciles recorded commit response loss before explicit retry can create a revision',async t=>{const f=fixture(t),p=await prepare(f);for(const stage of ['recognition','solve','analysis'])await step(f,p,stage);let puts=0,lost=false,queries=0;const put=f.storage.put.bind(f.storage);f.storage.put=async args=>{puts++;const result=await put(args);if(args.properties.role==='commit'&&!lost){lost=true;throw Object.assign(Error('response lost after committed upload'),{code:'ECONNRESET'});}return result;};assert.equal((await f.handlers.examQueueStep({id:f.item.id,problemId:p,stage:'upload'})).status,'unknown');const before=puts;f.bank.close();const bank=new QuestionBank({directory:path.dirname(f.bank.dir),store:f.store,storage:f.storage,auth:server.auth(server.A),appVersion:'0.4.13',buildDocx:async(_,file)=>fs.writeFileSync(file,Buffer.from('fixture'))});bank.autonomous=false;assert.match(bank.state.jobs.at(-1).error,/response lost/);const heads=bank.remoteHeads.bind(bank);bank.remoteHeads=async(...args)=>{queries++;return heads(...args);};require('../app/exam-queue-main.cjs').installExamQueue({queue:f.queue,store:f.store,workflow:f.workflow,regionDetector:null,bankAccess:()=>({bank:()=>bank}),handle:(key,fn)=>f.handlers[key]=fn,busy:new Map()});f.queue.action('retry',f.item.id);f.queue.action('resume');await step(f,p,'upload');assert.ok(queries>0);assert.equal(puts,before);assert.equal(bank.state.jobs.length,1);assert.equal(bank.state.jobs.at(-1).committed,true);});

test('changed metadata cannot silently relabel a committed job with the new stage input',async t=>{const f=fixture(t),p=await prepare(f);for(const stage of ['recognition','solve','analysis','upload'])await step(f,p,stage);const questionId=f.store.get(f.item.projectId).problems[0].original.id,job=f.bank.state.jobs.at(-1),firstRevision=job.revisionId,fingerprint=job.queueInputFingerprint;f.queue.edit(f.item.id,{metadata:{school:'수정중'}});const result=await f.handlers.examQueueStep({id:f.item.id,problemId:p,stage:'upload'});assert.equal(result.held,true);assert.equal(f.item.steps[p+':upload'].status,'held');assert.equal(f.bank.state.jobs.length,1);assert.equal(job.revisionId,firstRevision);assert.equal(job.queueInputFingerprint,fingerprint);assert.equal(f.store.get(f.item.projectId).problems[0].original.id,questionId);assert.equal(f.store.get(f.item.projectId).problems.length,1);});

test('curriculum scope canonical comparison keeps completed solve current and restores only false legacy scope diagnostics',async t=>{
 const f=fixture(t),scope=require('../app/curriculum.js').build(['m1-4.3'],{restrictions:'',extraForbidden:[],extraPrerequisites:[]});f.queue.edit(f.item.id,{scope,scopeConfirmed:true});const p=await prepare(f);let project=f.store.get(f.item.projectId);project.scope.prerequisites.push('legacy redundant prerequisite');f.store.write(project);for(const stage of ['recognition','solve'])await step(f,p,stage);
 f.store.updateProblem(f.item.projectId,p,x=>{x.original.solutionStale=true;x.original.reviewReasons=['시험 범위가 변경되었습니다.'];});project=f.store.get(f.item.projectId);
 project=f.workflow.decorate(f.store.get(f.item.projectId));assert.equal(project.problems[0].original.solutionStale,false);assert.deepEqual(project.problems[0].original.reviewReasons,[]);assert.equal(project.problems[0].original.approval.status,'pending');
 const before=f.calls.length;for(const stage of ['solve','analysis','upload'])await step(f,p,stage);assert.equal(f.calls.length,before);
 project=f.store.get(f.item.projectId);const q=project.problems[0].original;q.body='manual changed body';q.solutionStale=true;q.reviewReasons=['시험 범위가 변경되었습니다.'];project.scope.prerequisites.push('another redundant prerequisite');f.store.write(project);assert.equal(f.workflow.decorate(f.store.get(f.item.projectId)).problems[0].original.solutionStale,true);
});

test('an existing held solution draft keeps its real reason without another automatic request',async t=>{const f=fixture(t),p=await prepare(f);await step(f,p,'recognition');f.setReply(async()=>({result:{...solve(),holdReason:'source volume and area conflict'}}));let first=await f.handlers.examQueueStep({id:f.item.id,problemId:p,stage:'solve'});assert.equal(first.held,true);assert.ok(f.store.get(f.item.projectId).problems[0].original.solutionDraft);const before=f.calls.length,reason=first.reason;const second=await f.handlers.examQueueStep({id:f.item.id,problemId:p,stage:'solve'});assert.equal(second.held,true);assert.equal(second.reason,reason);assert.equal(f.calls.length,before);});

test('local artifact failure reuses the persisted upload job and revision after explicit retry',async t=>{const f=fixture(t),p=await prepare(f);for(const stage of ['recognition','solve','analysis'])await step(f,p,stage);const build=f.bank.buildDocx;f.bank.buildDocx=async()=>{throw Error('fixture png write failure');};let r=await f.handlers.examQueueStep({id:f.item.id,problemId:p,stage:'upload'});assert.equal(r.held,true);const job=f.bank.state.jobs.at(-1),id=job.id,calls=f.calls.length;f.bank.buildDocx=build;f.item.steps[p+':upload'].status='pending';await step(f,p,'upload');assert.equal(f.calls.length,calls);assert.equal(f.bank.state.jobs.length,1);assert.equal(f.bank.state.jobs[0].id,id);assert.equal(f.bank.state.jobs[0].status,'complete');});

test('failed artifact resume waits for the ordinary upload pump and then keeps the existing revision',{timeout:15000},async t=>{
 const f=fixture(t),p=await prepare(f);for(const stage of ['recognition','solve','analysis'])await step(f,p,stage);
 const build=f.bank.buildDocx;f.bank.buildDocx=async()=>{throw Error('fixture png write failure');};assert.equal((await f.handlers.examQueueStep({id:f.item.id,problemId:p,stage:'upload'})).held,true);f.bank.buildDocx=build;
 const job=f.bank.state.jobs[0],id=job.id,revision=job.revisionId,calls=f.calls.length,process=f.bank.process.bind(f.bank);let release,entered,queueProcessCalls=0;
 const waiting=new Promise(resolve=>entered=resolve);f.bank.state.jobs.push({id:'ordinary-pump-fixture',revisionId:'ordinary-pump-revision-fixture',parentRevisionId:null,questionId:'other-fixture-question',status:'queued',nextAt:0,queueManaged:false});
 f.bank.process=async current=>{if(current.id==='ordinary-pump-fixture'){entered();await new Promise(resolve=>release=resolve);current.status='complete';return;}queueProcessCalls++;return process(current);};
 const pump=f.bank.pump();await waiting;
 try{assert.equal(f.bank.running,true);f.item.steps[p+':upload'].status='pending';const result=await f.handlers.examQueueStep({id:f.item.id,problemId:p,stage:'upload'});assert.equal(result.held,true);assert.match(result.reason,/다른 업로드/);assert.equal(queueProcessCalls,0);assert.equal(f.bank.state.jobs.length,2);assert.equal(job.id,id);assert.equal(job.revisionId,revision);assert.ok(!job.committed);assert.equal(f.calls.length,calls);assert.equal(fs.existsSync(f.file),true);}finally{release();await pump;}
 assert.equal(f.bank.running,false);f.queue.action('retry',f.item.id);await step(f,p,'upload');assert.equal(queueProcessCalls,1);assert.equal(job.status,'complete');assert.equal(job.id,id);assert.equal(job.revisionId,revision);assert.equal(f.bank.state.jobs.length,2);assert.equal(f.calls.length,calls);
});

test('login recovery resumes upload with no recognition or solve replay and no duplicate revision',async t=>{
 const f=fixture(t),pid=await prepare(f);for(const kind of ['recognition','solve','analysis'])await step(f,pid,kind);
 const calls=f.calls.length,prepareItem=f.storage.prepareItem.bind(f.storage);let authCalls=0;
 f.storage.prepareItem=async()=>{authCalls++;throw Object.assign(Error('Invalid Refresh Token: Already Used'),{service:'supabase',code:'auth'});};
 const blocked=await f.handlers.examQueueStep({id:f.item.id,problemId:pid,stage:'upload'});assert.equal(blocked.status,'waiting_login');assert.equal(authCalls,1);
 f.storage.prepareItem=prepareItem;f.queue.action('resume');for(const kind of ['recognition','solve','analysis','upload'])await step(f,pid,kind);
 assert.equal(f.calls.length,calls);assert.equal(f.bank.state.jobs.length,1);assert.equal(f.bank.state.jobs[0].status,'complete');
 f.queue.action('resume');await step(f,pid,'upload');assert.equal(f.bank.state.jobs.length,1);assert.equal(f.calls.length,calls);
});
