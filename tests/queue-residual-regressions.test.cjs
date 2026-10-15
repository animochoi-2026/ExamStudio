'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {forbiddenConcepts}=require('../app/scope-check.cjs'),{printAssets}=require('../app/print-assets.cjs'),{processChain}=require('../app/queue-upload-chain.cjs');

test('explicit alternative to an inscribed angle theorem is not use of that theorem',()=>{
 const scope={forbidden:['원주각']},text='이 관계는 원주각 정리가 아니라 같은 반지름의 밑각과 삼각형의 내각의 합으로 얻은 것이다.';
 assert.deepEqual(forbiddenConcepts(scope,{usedConcepts:['삼각형의 내각의 합']},text),[]);
 assert.deepEqual(forbiddenConcepts(scope,{usedConcepts:['원주각 정리']},text),['원주각']);
 assert.deepEqual(forbiddenConcepts(scope,{},text+' 다음으로 원주각 정리를 적용한다.'),['원주각']);
});
test('retained original diagram requires a visible valid crop and never grants teacher approval',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'source-diagram-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'crop.png');fs.writeFileSync(file,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6NZYAAAAASUVORK5CYII=','base64'));
 const p={cropPaths:[file]},q={diagramMode:'source',sourceFigure:{path:file,bounds:{x:0,y:0,width:1,height:1}},approval:{status:'pending'}};
 const {hasSourceDiagram}=require('../app/source-materials.cjs');assert.equal(hasSourceDiagram(p,q),true);assert.equal(q.approval.status,'pending');
 q.hiddenFigureIds=['diagram'];assert.equal(hasSourceDiagram(p,q),false);q.hiddenFigureIds=[];q.sourceFigure.bounds.width=2;assert.equal(hasSourceDiagram(p,q),false);q.sourceFigure.bounds.width=1;q.sourceFigure.path=path.join(dir,'missing.png');assert.equal(hasSourceDiagram(p,q),false);
});
test('grading rejection is not actual trig use; reported or subsequent use is still rejected',()=>{
 const scope={forbidden:['삼각비']},warning='금지된 삼각비 등 범위 밖 개념에 의존한 풀이는 범위 안의 대안 풀이로 인정하지 않는다.';
 assert.deepEqual(forbiddenConcepts(scope,{usedConcepts:[]},warning),[]);
 assert.deepEqual(forbiddenConcepts(scope,{usedConcepts:['삼각비']},warning),['삼각비']);
 assert.deepEqual(forbiddenConcepts(scope,{},warning+' 삼각비를 이용하면 sin A=1/2이다.'),['삼각비']);
 assert.deepEqual(forbiddenConcepts(scope,{},'삼각비를 이용하여 계산한다.'),['삼각비']);
});
test('empty observed diagram produces no image; valid diagrams render and broken references fail',()=>{
 assert.deepEqual(printAssets({observedDiagram:{points:[],segments:[],circles:[],angles:[],labels:[]}}),[]);
 const d={points:[{name:'A',x:0,y:0},{name:'B',x:1,y:1}],segments:[{from:'A',to:'B'}]};
 assert.equal(printAssets({diagram:d}).length,1);
 assert.throws(()=>printAssets({diagram:{...d,segments:[{from:'A',to:'missing'}]}}));
});
test('saved scope recheck preserves other errors and rejects stale or draft solutions',()=>{
 const scope=require('../app/rules.cjs').DEFAULT_SCOPE,{hash,validateScope}=require('../app/rules.cjs'),{refresh}=require('../app/queue-scope-recheck.cjs');
 const p={recognition:{version:1},original:{solution:'금지된 삼각비 등 범위 밖 개념에 의존한 풀이는 범위 안의 대안 풀이로 인정하지 않는다.',solutionProvenance:{sourceVersion:1,scopeVersion:hash(validateScope(scope))},approval:{status:'pending'},checks:{program:{errors:['금지 개념 언급/의존 검토 필요: 삼각비','other error']},scope:{status:'incompatible',originalScopeStatus:'compatible'},ai:{usedConcepts:[],scopeStatus:'compatible',status:'passed'}}}};
 assert.equal(refresh(p,scope),true);assert.deepEqual(p.original.checks.program.errors,['other error']);assert.equal(p.original.checks.program.status,'failed');assert.equal(p.original.approval.status,'pending');
 p.original.checks.program.errors.push('금지 개념 언급/의존 검토 필요: 삼각비');p.original.solutionStale=true;assert.equal(refresh(p,scope),false);p.original.solutionStale=false;p.original.solutionDraft={};assert.equal(refresh(p,scope),false);
});
test('queue may prepare a new solve over an old held draft while preserving the draft and review',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'queue-residual-'));t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());fs.rmSync(dir,{recursive:true,force:true});});
 const {ProjectStore}=require('../app/store.cjs'),{Workflow}=require('../app/workflow.cjs');
 const file=path.join(dir,'source.png');const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6NZYAAAAASUVORK5CYII=','base64');fs.writeFileSync(file,bytes);
 const store=new ProjectStore(dir);let p=store.create(file);p=store.addRegion({projectId:p.id,region:{page:1,x:0,y:0,width:1,height:1},imageDataUrl:'data:image/png;base64,'+bytes.toString('base64')});const id=p.problems[0].id;
 const w=new Workflow({store,directory:dir,getBridge:()=>({run:async()=>({result:{reply:'read',recognition:require('./workflow-fixtures.cjs').recognition()}})}),getSettings:()=>({model:'fixture',effort:'high'})});
 const base={projectId:p.id,problemId:id,provider:'codex'};await w.run({...base,task:'recognition'});
 store.updateProblem(p.id,id,x=>{x.queueGroup='objective:16';x.original.solutionDraft={answer:'old',holdReason:'old scope',validation:{status:'failed',scopeStatus:'incompatible'}};});
 const before=structuredClone(store.get(p.id).problems[0]);
 const plan=w.prepare({...base,task:'solve',queuePipeline:true,queueWebReview:true,reuseSolution:true});
 assert.equal(plan.info.sourceReadMode,'saved_recognition');assert.deepEqual(store.get(p.id).problems[0].original.solutionDraft,before.original.solutionDraft);assert.equal(store.get(p.id).problems[0].recognition.confirmed,false);
 assert.match(w.prepare({...base,task:'recognition'}).compiled.instructions,/objective:16/);
 assert.throws(()=>w.prepare({...base,task:'solve'}),/원문 판독/);
 store.updateProblem(p.id,id,x=>{x.recognition.conditions.push({source:'diagram',origin:'printed',text:'original mark'});x.original.observedDiagram=null;x.original.diagram=null;});
 const missing=w.decorate(store.get(p.id)).problems[0].original;assert.ok(missing.reviewReasons.includes('인쇄 도형 누락: 다시 인식 또는 교정 필요'));
 w.setPresentation({projectId:p.id,problemId:id,targetIds:[before.original.id],diagramMode:'source',sourceFigure:{regionIndex:0,bounds:{x:0,y:0,width:1,height:1}}});
 const restored=w.decorate(store.get(p.id)).problems[0];assert.ok(!restored.original.reviewReasons?.includes('인쇄 도형 누락: 다시 인식 또는 교정 필요'));assert.equal(restored.original.approval.status,'pending');assert.deepEqual(restored.original.solutionDraft,before.original.solutionDraft);
});
test('queued revision dependencies complete parent first without changing lineage',async()=>{
 const parent={revisionId:'p',questionId:'q',actorId:'a',rootId:'r',queueManaged:true,status:'paused'},child={...parent,revisionId:'c',parentRevisionId:'p',status:'failed'},calls=[];
 const bank={state:{jobs:[parent,child]},remoteHeads:async()=>[],save(){},process:async j=>{calls.push(j.revisionId);j.committed=true;j.status='complete';}};
 await processChain(bank,child);assert.deepEqual(calls,['p','c']);assert.equal(child.parentRevisionId,'p');
 parent.committed=false;parent.conflictBlocked=true;await assert.rejects(processChain(bank,child),/충돌/);
});
test('committed remote parent is reused; incomplete and foreign parents cannot be fabricated',async()=>{
 const parent={revisionId:'p',questionId:'q',actorId:'a',rootId:'r',queueManaged:true,status:'paused'},child={...parent,revisionId:'c',parentRevisionId:'p'},calls=[];
 const bank={state:{jobs:[parent,child]},remoteHeads:async()=>[{revisionId:'p'}],save(){},process:async j=>calls.push(j.revisionId)};
 await processChain(bank,child);assert.deepEqual(calls,['c']);assert.equal(parent.committed,true);
 parent.committed=false;bank.remoteHeads=async()=>[];await assert.rejects(processChain(bank,child),/아직 완료/);
 parent.actorId='other';await assert.rejects(processChain(bank,child),/계정/);
});
test('pending set registration can be deferred only for a bulk queue and cannot be selected as a standalone question',async()=>{
 const q={id:'q',body:'[15~16] 공통 조건',layoutDocument:{nodes:[]}},p={id:'p',original:q,variants:[],recognition:{}},project={id:'project',queueSource:{queueId:'queue'},problems:[p]},item={sourceId:'src',questionId:'q',metadata:{source:{originalNumber:'15'},reviews:{},relations:{}}};
 const bank={store:{get:()=>project},ensure:()=>item,auth:{config:()=>({spaceId:'s'})},storage:{rpc:async()=>[]}};
 const sets=require('../app/question-set-registration.cjs');await assert.rejects(sets.requireConfirmed(bank,'project',['q']),/세트/);
 const plans=await sets.requireConfirmed(bank,'project',['q'],{deferReview:true});sets.deferMetadata(item,plans);assert.equal(item.metadata.reviews.questionSet.status,'pending');assert.throws(()=>require('../app/question-sets.cjs').members(item),/미등록/);
 delete project.queueSource;await assert.rejects(sets.requireConfirmed(bank,'project',['q'],{deferReview:true}),/세트/);
});
