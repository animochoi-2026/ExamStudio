const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ProjectStore}=require('../app/store.cjs');
const {RulesStore,compose,DEFAULT_SCOPE,hash}=require('../app/rules.cjs');
const {Workflow,programCheck,cleanRecognition}=require('../app/workflow.cjs');
const {recognition,item,validation,location}=require('./workflow-fixtures.cjs');
const {schemas,check}=require('../app/task-schemas.cjs');
test('manual review bypasses every diagnostic, survives layout changes and reload, and expires on content edits',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});
 f.store.updateProblem(f.base.projectId,f.base.problemId,p=>{const q=p.original;q.answer='2';q.solution='보관된 풀이';q.solutionDraft={solution:'보류된 다른 풀이',holdReason:'검산 보류'};q.solutionStale=true;q.checks={ai:{status:'failed',unverified:['AI 경고']},program:{errors:['좌표 오류']},scope:{status:'incompatible'}};q.reviewReasons=['재검수 필요'];});
 const before=structuredClone(f.problem().original),id=before.id;
 f.workflow.approve(f.base.projectId,f.base.problemId,id,true);
 let p=f.workflow.decorate(f.store.get(f.base.projectId)),q=p.problems[0].original;
 assert.equal(q.approval.method,'manual_user_authorized');assert.equal(q.include,true);assert.equal(q.needsReview,false);assert.equal(q.checks.ai.status,'failed');assert.equal(q.solution,before.solution);assert.ok(q.solutionDraft);assert.ok(q.approval.acknowledgedWarnings.includes('재검수 필요'));assert.equal(p.problems[0].recognition.confirmed,true);assert.equal(p.problems[0].recognition.uncertainties.length,0);
 f.workflow.setPresentation({...f.base,targetIds:[id],diagramPosition:'before'});f.store.cache.clear();q=f.workflow.decorate(f.store.get(f.base.projectId)).problems[0].original;assert.equal(q.approval.status,'approved');assert.equal(q.include,true);
 f.workflow.approve(f.base.projectId,f.base.problemId,id,false);assert.equal(f.workflow.decorate(f.store.get(f.base.projectId)).problems[0].original.include,false);
 f.workflow.approve(f.base.projectId,f.base.problemId,id,true);f.store.updateProblem(f.base.projectId,f.base.problemId,p=>{p.original.body+=' 변경';});q=f.workflow.decorate(f.store.get(f.base.projectId)).problems[0].original;assert.equal(q.approval.status,'pending');
});
test('source choice layout is recognized, inherited by variants and user override survives rerecognition',async t=>{
 const f=fixture(t),r=recognition();r.choiceLayout='vertical';r.choices=['첫째','둘째'];
 f.bridge.run=async()=>({result:{reply:'인식',recognition:r}});
 await f.workflow.run({...f.base,task:'recognition'});assert.equal(f.problem().original.choiceLayout,'vertical');
 f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 f.bridge.run=async()=>({result:{reply:'생성',items:[item()],holdReason:''}});
 await f.workflow.run({...f.base,task:'generation'});assert.equal(f.problem().variants[0].choiceLayout,'vertical');assert.equal(f.problem().variants[0].diagramMode,'redraw');
 f.workflow.setPresentation({...f.base,targetIds:[f.problem().original.id],choiceLayout:'auto'});
 f.bridge.run=async()=>({result:{reply:'재인식',recognition:r}});
 await f.workflow.run({...f.base,task:'recognition',force:true,acceptReplacement:true});assert.equal(f.problem().original.choiceLayout,'auto');
});
test('automatic corrected recognition may retain irrelevant observations without holding a checked solution',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});
 const corrected=recognition();corrected.uncertainties=[{kind:'reading',text:'짧은 선은 인쇄 여부가 불명확하며 풀이 조건으로 사용하지 않음',location}];
 f.bridge.run=async()=>({result:{reply:'명확한 인쇄 조건만으로 풀이',answer:'2',solution:'명확한 조건에서 2를 구하고 대입 검산했습니다.',questionType:'single_value',validation:validation(),holdReason:'',recognitionCorrection:corrected,correctionEvidence:['원본 인쇄 빗금 확인'],notes:[]}});
 await f.workflow.run({...f.base,task:'solve',autoRecover:true,automaticPipeline:true,automaticFinalize:true});
 const p=f.problem();assert.equal(p.original.solutionDraft,undefined);assert.equal(p.original.include,true);assert.match(p.original.solution,/짧은 선/);assert.equal(p.recognition.resolvedUncertainties.length,1);
});
test('empty recognition is never recorded as completed or reused',async t=>{
 const f=fixture(t),r=recognition();r.body='1. ';f.bridge.run=async()=>({result:{reply:'판독',recognition:r}});
 await assert.rejects(f.workflow.run({...f.base,task:'recognition'}),/문제 본문이 없습니다/);
 const p=f.problem();assert.ok(!p.recognition);assert.notEqual(p.runs.at(-1).status,'completed');
});
test('batch output authorization retains failed diagnostics, expires on edits and can be unchecked',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 f.bridge.run=async()=>{const q=item();q.validation.status='failed';q.validation.unverified=['선택지 검토 필요'];return{result:{reply:'생성',items:[q],holdReason:''}};};
 await f.workflow.run({...f.base,task:'generation',automaticFinalize:true,batchIncludeWarnings:true});
 let p=f.workflow.decorate(f.store.get(f.base.projectId)).problems[0],q=p.variants[0];assert.equal(q.include,true);assert.equal(q.approval.method,'batch_user_authorized');assert.equal(q.checks.ai.status,'failed');assert.deepEqual(q.checks.ai.unverified,['선택지 검토 필요']);
 f.workflow.approve(f.base.projectId,p.id,q.id,false);p=f.workflow.decorate(f.store.get(f.base.projectId)).problems[0];assert.equal(p.variants[0].include,false);assert.equal(p.variants[0].batchOutputConsent,undefined);
 await f.workflow.run({...f.base,task:'generation',automaticFinalize:true,batchIncludeWarnings:true});f.store.updateProblem(f.base.projectId,p.id,x=>{x.variants[1].body+=' 변경';});q=f.workflow.decorate(f.store.get(f.base.projectId)).problems[0].variants[1];assert.equal(q.approval.status,'pending');
});
test('question labels setting survives project saves and defaults to visible',t=>{
 const f=fixture(t);let project=f.store.get(f.base.projectId);project.settings.showQuestionLabels=false;f.store.save(project);assert.equal(f.store.get(project.id).settings.showQuestionLabels,false);project=f.store.get(project.id);delete project.settings.showQuestionLabels;f.store.save(project);assert.equal(f.store.get(project.id).settings.showQuestionLabels,true);
});
function fixture(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'exam-workflow-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const source=path.join(directory,'source.png');const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6NZYAAAAASUVORK5CYII=','base64');fs.writeFileSync(source,png);
 const store=new ProjectStore(directory);let project=store.create(source);project=store.addRegion({projectId:project.id,region:{page:1,x:0,y:0,width:1,height:1},imageDataUrl:'data:image/png;base64,'+png.toString('base64')});
 const calls=[],bridge={run:async request=>{calls.push(request);const task=request.execution.task;return {result:task==='recognition'?{reply:'판독',recognition:recognition()}:task==='generation'?{reply:'생성',items:[{...item(),difficulty:request.execution.schema.properties.items.items.properties.difficulty.enum.length===1?request.execution.schema.properties.items.items.properties.difficulty.enum[0]:'중'}],holdReason:''}:task==='revision'?{reply:'수정',correction:null,item:item(),changes:['조건 변경'],holdReason:''}:{reply:'검수',reviews:[{targetId:store.get(project.id).problems[0].variants[0].id,validation:validation()}],holdReason:''},tokens:null};}};
 const workflow=new Workflow({store,directory,getBridge:()=>bridge,getSettings:()=>({model:'gpt-6-astra',effort:'high'})});
 const base={projectId:project.id,problemId:project.problems[0].id,provider:'codex',count:1,variant:'numeric_only'};
 return{directory,store,workflow,calls,bridge,base,problem:()=>store.get(project.id).problems[0]};
}

test('automatic pipeline retains uncertainty and user correction, writes notes and never invents approval',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});
 f.store.updateProblem(f.base.projectId,f.base.problemId,p=>{p.recognition.uncertainties=[{kind:'reading',text:'표식 인쇄 여부 확인 필요',location}];p.recognition.correctedByUser=true;});
 const old=structuredClone(f.problem().recognition);
 f.bridge.run=async req=>{assert.match(req.execution.instructions,/모두 자동 처리/);return {result:{reply:'출제 의도 해석',answer:'2',solution:'조건에서 2를 구합니다.',questionType:'single_value',validation:validation(),holdReason:'',recognitionCorrection:null,correctionEvidence:[],notes:['본문 조건을 기준으로 풀이함']}};};
 await f.workflow.run({...f.base,task:'solve',autoRecover:true,automaticPipeline:true,force:true});
 const p=f.problem();assert.equal(p.recognition.confirmed,false);assert.equal(p.recognition.correctedByUser,true);assert.equal(p.recognition.version,old.version);assert.deepEqual(p.recognition.uncertainties,old.uncertainties);assert.equal(p.recognition.automaticReview.status,'needs_review');assert.equal(p.original.approval.status,'pending');assert.equal(p.original.include,false);assert.match(p.original.solution,/표식 인쇄 여부/);
});

test('automatic pipeline holds genuinely failed math and preserves original; recovery correction needs evidence',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});const body=f.problem().original.body;
 const response={reply:'모순',answer:'2',solution:'조건부 참고 풀이',questionType:'single_value',validation:{...validation(),status:'failed'},holdReason:'',recognitionCorrection:null,correctionEvidence:[],notes:[]};f.bridge.run=async()=>({result:structuredClone(response)});
 const req={...f.base,task:'solve',autoRecover:true,automaticPipeline:true,force:true};await assert.rejects(f.workflow.run(req),/보류/);assert.equal(f.problem().original.body,body);assert.ok(f.problem().original.solutionDraft);assert.equal(f.problem().recognition.confirmed,false);
 response.validation=validation();response.recognitionCorrection=recognition();await assert.rejects(f.workflow.run(req),/인쇄 근거/);
 response.correctionEvidence=['원본의 인쇄된 문자 대조'];response.recognitionCorrection.body='인쇄된 문장을 최소 교정';await f.workflow.run(req);assert.equal(f.problem().recognition.confirmed,false);assert.equal(f.problem().recognition.correctionOrigin,'automatic_pipeline');assert.match(f.problem().original.solution,/인식 최소 교정/);assert.equal(f.problem().originalHistory.at(-1).body,body);
});

test('held original solutions remain visible as unapproved drafts and recover without overwriting the original',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 const old=structuredClone(f.problem().original);
 f.bridge.run=async req=>{assert.match(req.execution.instructions,/합동을 보장할 수 없는/);return{result:{reply:'각만 같다는 조건은 크기를 보장하지 못합니다.',answer:'③',solution:'선택지마다 합동 조건을 확인한 조건부 풀이',questionType:'single_choice',validation:{...validation(),status:'failed'},holdReason:'문구 해석을 확인해야 합니다.'}};};
 await assert.rejects(f.workflow.run({...f.base,task:'solve'}),/상세 설명/);
 let q=f.problem().original;assert.equal(q.answer,old.answer);assert.equal(q.solution,old.solution);assert.equal(q.solutionDraft.answer,'③');assert.equal(q.approval.status,'pending');assert.equal(q.include,false);assert.ok(f.problem().messages.some(m=>m.text.includes('검토용 풀이')));
 f.workflow.approve(f.base.projectId,f.base.problemId,q.id,true);assert.equal(f.problem().original.approval.method,'manual_user_authorized');assert.equal(f.problem().original.solution,old.solution);assert.ok(f.problem().original.solutionDraft);
 f.bridge.run=async()=>({result:{reply:'해석을 명시했습니다.',answer:'2',solution:'확인된 조건에서 다시 푼 풀이',questionType:'single_value',validation:validation(),holdReason:''}});
 await f.workflow.run({...f.base,task:'solve',force:true});q=f.problem().original;assert.equal(q.solutionDraft,undefined);assert.equal(q.solutionDraftHistory.length,1);assert.equal(q.body,old.body);
});

test('intent-preserving repair passes diagnostics and creates a separate unapproved revision',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});const old=structuredClone(f.problem().original),req={...f.base,task:'revision',revisionMode:'content',intentRepair:true,targetIds:[old.id]};
 const plan=f.workflow.preview(req);assert.match(plan.instructions,/출제 의도 유지 자동 수정/);assert.match(plan.inputText,/intentRepair/);assert.equal(plan.requestOptions.intentRepair,true);
 const revised=item();revised.changes=['질문 문구 변경 전 → 변경 후: 합동 보장 여부를 명확히 함'];
 f.bridge.run=async()=>({result:{reply:'최소 수정',correction:null,item:revised,changes:revised.changes,holdReason:''}});await f.workflow.run(req);
 assert.deepEqual(f.problem().original,old);const q=f.problem().variants[0];assert.equal(q.revisionOf,old.id);assert.equal(q.intentRepair,true);assert.equal(q.approval.status,'pending');assert.match(q.changes[0],/변경 전/);
});

test('automatic original recovery keeps printed wording and appends notes without creating variants',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});const before=structuredClone(f.problem()),req={...f.base,task:'solve',autoRecover:true,force:true};
 f.bridge.run=async request=>{assert.equal(request.images.length,1);assert.match(request.execution.instructions,/원문 보존 풀이집 정책/);assert.match(request.execution.instructions,/recognition.common/);return{result:{reply:'출제 의도에 따라 해석했습니다.',answer:'2',solution:'원문의 조건에서 구한 상세 풀이',questionType:'single_value',validation:validation(),holdReason:'',recognitionCorrection:null,correctionEvidence:[],notes:['이 표현은 합동을 보장하지 못한다는 뜻으로 해석했습니다.']}};};
 const preview=f.workflow.preview(req);assert.equal(preview.modules.filter(m=>m.id==='core').length,1);assert.ok(!preview.modules.some(m=>m.id.startsWith('variants.')));
 await f.workflow.run(req);const after=f.problem();assert.equal(after.original.body,before.original.body);assert.deepEqual(after.original.choices,before.original.choices);assert.equal(after.variants.length,0);assert.equal(after.recognition.confirmationMethod,'automatic_recovery');assert.equal(after.original.approval.status,'pending');assert.match(after.original.solution,/\[참고 코멘트\]/);assert.equal(after.recognitionHistory.at(-1).body,before.recognition.body);
});

test('automatic recovery requires printed evidence for OCR correction and never applies an unresolved guess',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});const before=structuredClone(f.problem()),raw=recognition();raw.body='원본에서 확인한 올바른 숫자';
 const response={reply:'인쇄 문자 교정',answer:'2',solution:'상세 풀이',questionType:'single_value',validation:validation(),holdReason:'',recognitionCorrection:raw,correctionEvidence:[],notes:[]},req={...f.base,task:'solve',autoRecover:true,force:true};f.bridge.run=async()=>({result:structuredClone(response)});
 await assert.rejects(f.workflow.run(req),/인쇄 근거/);assert.equal(f.problem().original.body,before.original.body);
 response.correctionEvidence=['원본 첫 줄의 2를 3으로 잘못 인식한 부분을 2로 교정'];raw.uncertainties=[{kind:'reading',text:'수치 미확인',location}];
 await assert.rejects(f.workflow.run(req),/확인되지 않은 조건/);assert.equal(f.problem().original.body,before.original.body);
 raw.uncertainties=[];await f.workflow.run(req);assert.equal(f.problem().original.body,raw.body);assert.equal(f.problem().originalHistory.at(-1).body,before.original.body);assert.equal(f.problem().variants.length,0);assert.equal(f.problem().recognition.correctedByUser,false);
});

test('normal solves get source-preserving policy and note-only concept mentions do not become proof dependencies',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);const plan=f.workflow.preview({...f.base,task:'solve'});assert.match(plan.instructions,/단순 표현상 엄밀성/);assert.match(plan.instructions,/본문·수치·보기·선택지/);assert.ok(!plan.modules.some(m=>m.id==='recognition.common'));
 const i=item();i.question.solution='삼각형의 합동으로 확인했다.\n\n[참고 코멘트]\n닮음은 이번 풀이에 사용하지 않았다.';i.validation.usedConcepts=['삼각형의 합동'];assert.notEqual(programCheck(i,DEFAULT_SCOPE).scope.status,'incompatible');
 i.validation.usedConcepts=['닮음'];assert.equal(programCheck(i,DEFAULT_SCOPE).scope.status,'incompatible');
});

test('missing printed marks are recognition issues while missing responses require retransmission',()=>{
 const {transport}=require('../app/diagnostics.js');assert.equal(transport('인쇄된 빗금 누락'),false);assert.equal(transport('AI 응답 결과 누락'),true);assert.equal(transport('연결 실패'),true);
});

test('ignored source issues allow generation, survive unchanged recognition, and expire on changed conditions',async t=>{
 const {issueKey,sourceReady}=require('../app/review-issues.js'),f=fixture(t),raw=recognition();
 const issue={text:'[원본 확인 필요] 흐린 길이 표시',kind:'reading',location};raw.uncertainties=[issue,{...issue,text:'흐린  길이 표시'}];
 f.bridge.run=async()=>({result:{reply:'원문',recognition:structuredClone(raw)}});await f.workflow.run({...f.base,task:'recognition'});
 assert.equal(f.problem().recognition.uncertainties.length,1);const version=f.problem().recognition.version;
 f.workflow.ignoreSourceIssues({...f.base,sourceVersion:version,keys:[issueKey(issue)]});
 assert.equal(f.problem().recognition.confirmed,false);assert.equal(sourceReady(f.problem().recognition),true);assert.equal(f.problem().recognition.ignoredUncertainties.length,1);
 assert.throws(()=>f.workflow.ignoreSourceIssues({...f.base,sourceVersion:version,keys:[]}),/바뀌었습니다/);
 await f.workflow.run({...f.base,task:'recognition',force:true,acceptReplacement:true});assert.deepEqual(f.problem().recognition.uncertainties,[]);assert.equal(sourceReady(f.problem().recognition),true);
 f.bridge.run=async()=>({result:{reply:'생성',items:[item()],holdReason:''}});await f.workflow.run({...f.base,task:'generation'});assert.equal(f.problem().variants.length,1);assert.equal(f.problem().variants[0].approval.status,'pending');
 raw.body+=' 조건을 바꿨다.';f.bridge.run=async()=>({result:{reply:'원문',recognition:structuredClone(raw)}});await f.workflow.run({...f.base,task:'recognition',force:true,acceptReplacement:true});
 assert.equal(f.problem().recognition.uncertainties.length,1);assert.equal(sourceReady(f.problem().recognition),false);await assert.rejects(f.workflow.run({...f.base,task:'generation'}),/확인된 원문/);
});

test('redraw prioritizes only conflicting instructions and persists dimension/placement data for both providers',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});
 const settingsBefore=JSON.stringify(f.workflow.rules.snapshot()),body=f.problem().original.body;
 const drawing=recognition().observedDiagram;
 drawing.angleLabelOverrides=[{angleIndex:0,x:6,y:6,leader:true}];
 drawing.dimensions=[{from:'A',to:'C',start:{x:0,y:-1},end:{x:8,y:-1},label:'8',origin:'printed',guideStyle:null,endpointStyle:'tick'}];
 for(const provider of ['codex','gemini']){
  const req={...f.base,provider,task:'recognition',recognitionTarget:'diagram',force:true,acceptReplacement:true,text:'도형만 다시 그리기',additionalInstructions:'60° 숫자는 바깥에 놓고 화살표를 붙여줘. 길이 점선도 보존해줘.'};
  const preview=f.workflow.preview(req);
  assert.match(preview.instructions,/실제 충돌하는 조항만.*나머지 조항은 유지/);
  assert.match(preview.instructions,/손글씨/);assert.match(preview.inputText,/additionalInstructions/);
  assert.equal(preview.additionalInstructionsApplied,true);
  f.bridge.run=async r=>{assert.equal(r.execution.instructions,preview.instructions);return{result:{reply:'요청 배치 적용',observedDiagram:structuredClone(drawing),uncertainties:[]}};};
  await f.workflow.run(req);
  assert.deepEqual(f.problem().original.observedDiagram.angleLabelOverrides,drawing.angleLabelOverrides);
  assert.deepEqual(f.problem().original.observedDiagram.dimensions,drawing.dimensions);
  assert.equal(f.problem().original.body,body);
  assert.match(f.problem().recognition.uncertainties.map(u=>u.text).join(' '),/길이 범위 점선 데이터 누락/);
 }
 assert.equal(JSON.stringify(f.workflow.rules.snapshot()),settingsBefore);
 const req={...f.base,task:'recognition',recognitionTarget:'diagram',force:true,acceptReplacement:true};
 f.bridge.run=async()=>({result:{reply:'기본 배치',observedDiagram:structuredClone(drawing),uncertainties:[]}});
 await f.workflow.run(req);assert.equal(f.problem().original.observedDiagram.angleLabelOverrides,null);
 assert.throws(()=>f.workflow.preview({...req,additionalInstructions:'x'.repeat(2001)}),/2,000/);
});
test('task composition excludes unrelated rules, deduplicates mixed domains and never uses scope to infer source',t=>{
 const f=fixture(t),modules=f.workflow.rules.snapshot().modules;
 const r=compose({task:'recognition',domains:['geometry'],modules});assert.deepEqual(r.modules.map(m=>m.id),['core','task.recognition','recognition.common','domains.geometry.recognition']);assert.equal(r.scope,null);assert.doesNotMatch(r.instructions,/\[production|\[validation|\[revision|\[domains.algebra.math/);
 const g=compose({task:'generation',domains:['geometry','geometry'],variant:'numeric_only',scope:DEFAULT_SCOPE,modules});assert.equal(g.modules.filter(m=>m.id==='domains.geometry.math').length,1);assert.ok(g.modules.some(m=>m.id==='validation.common'));assert.ok(!g.modules.some(m=>m.id.includes('alternative_property')));assert.match(g.scopeText,/닮음.*피타고라스.*삼각비/);
 assert.equal(compose({task:'recognition',domains:[],modules}).domains.length,4);
 assert.deepEqual(compose({task:'recognition',domains:['algebra','geometry'],modules}).domains,['algebra','geometry']);
});

test('held generation recovers after explicit source issue resolution, with audit and no automatic approval',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});
 f.store.updateProblem(f.base.projectId,f.base.problemId,p=>{p.recognition.uncertainties=[{text:'흐린 표식 확인',kind:'reading',location}];});
 await assert.rejects(f.workflow.run({...f.base,task:'generation'}),/확인된 원문/);
 const version=f.problem().recognition.version;
 assert.throws(()=>f.workflow.resolveSourceIssues({...f.base,sourceVersion:version,resolutions:[{index:0,note:''}]}),/근거/);
 assert.throws(()=>f.workflow.resolveSourceIssues({...f.base,sourceVersion:version-1,resolutions:[{index:0,note:'검토'}]}),/버전/);
 f.workflow.resolveSourceIssues({...f.base,sourceVersion:version,resolutions:[{index:0,note:'본문에 명시되어 흐린 빗금은 추가 조건에 사용하지 않음'}]});
 assert.equal(f.problem().recognition.confirmed,false);assert.equal(f.problem().recognition.resolvedUncertainties[0].resolvedBy,'user');
 f.workflow.confirmSource(f.base.projectId,f.base.problemId);await f.workflow.run({...f.base,task:'generation'});
 assert.equal(f.problem().variants.length,1);assert.equal(f.problem().variants[0].approval.status,'pending');f.workflow.approve(f.base.projectId,f.base.problemId,f.problem().original.id,true);assert.equal(f.problem().original.approval.status,'approved');
 assert.ok(f.problem().runs.some(r=>r.status==='held'));
});

test('partial recognition replaces its own warnings, keeps unrelated issues, and full retry refreshes all',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});
 const old={text:'기존 원문 불확실성',kind:'reading',location};f.store.updateProblem(f.base.projectId,f.base.problemId,p=>{p.recognition.uncertainties=[old];});
 const request={...f.base,task:'recognition',recognitionTarget:'text',force:true,acceptReplacement:true};
 const result=()=>{const r=recognition();return{reply:'문장',body:r.body,givens:[],statementBox:[],choices:[],conditions:[],printedAnswer:'',printedSolution:'',uncertainties:[]};};
 f.bridge.run=async()=>({result:{...result(),uncertainties:[{text:'이번 문장 흐림',kind:'reading',location}]}});await f.workflow.run(request);
 f.bridge.run=async()=>({result:result()});await f.workflow.run(request);
 assert.ok(!f.problem().recognition.uncertainties.some(u=>u.text==='이번 문장 흐림'));assert.ok(f.problem().recognition.uncertainties.some(u=>u.text===old.text));
 f.bridge.run=async()=>({result:{reply:'전체',recognition:recognition()}});await f.workflow.run({...request,recognitionTarget:'all'});
 assert.deepEqual(f.problem().recognition.uncertainties,[]);assert.equal(f.problem().recognition.confirmed,false);
});
test('default rule contents are complete and compiled production retains legacy explanation and figure safeguards',t=>{
 const f=fixture(t),modules=f.workflow.rules.snapshot().modules;
 const editable=modules.filter(m=>m.editable);assert.equal(editable.length,16);assert.ok(editable.every(m=>m.content.trim()&&!/추후 입력|TODO|TBD/.test(m.content)));
 const r=compose({task:'recognition',domains:['geometry'],modules});
 assert.match(r.instructions,/각도 숫자·각도 문자는 도형 겹침 방지 규칙의 예외/);assert.match(r.instructions,/각도 숫자에는 안내선·화살표를 붙이지/);
 for(const pattern of [/길이 범위 점선·치수선·치수 보조선·끝점 표시/,/같은 길이 빗금.*개수·형태.*같은 표식끼리 묶/,/본문에 없어도 명확한 인쇄 수치·표식은 조건/,/손글씨 점선·치수선·수치·빗금·보조선.*정제 조건에서 제외/,/불확실한 인쇄 여부·대상·시작점과 끝점·표식 개수.*공통 확인 절차/])assert.match(r.instructions,pattern);
 const g=compose({task:'generation',domains:['geometry'],variant:'numeric_only',scope:DEFAULT_SCOPE,modules});
 for(const pattern of [/성질·근거·계산·예외 조건/,/긴 등식의 연쇄.*줄을 나눈다/,/색상·글자 크기 명령은 쓰지 않는다/,/정확한 도형이 없는 도형 문제를 완성했다고 말하지/])assert.match(g.instructions,pattern);
 assert.doesNotMatch(r.instructions,/풀이에는 사용한 성질|정확한 도형이 없는 도형 문제를 완성했다고/);
});
test('printed ticks and whole/part dimensions survive; handwriting is excluded and uncertain endpoints remain null',t=>{
 const f=fixture(t),raw=recognition();raw.marks.push({kind:'length_range',origin:'uncertain',text:'흐린 치수선',targets:[],start:null,end:null,group:null,span:'unknown',location});
 const cleaned=cleanRecognition(raw,f.problem(),1);assert.equal(cleaned.conditions.length,1);assert.equal(cleaned.excludedConditions[0].origin,'handwritten');assert.equal(cleaned.marks[0].group,'one_tick');assert.equal(cleaned.marks[1].span,'whole');assert.equal(cleaned.marks[2].span,'part');assert.equal(cleaned.marks[4].start,null);assert.match(cleaned.uncertainties[0].text,/원본 확인 필요/);assert.match(cleaned.body,/피타고라스/);
 assert.match(f.workflow.rules.snapshot().modules.find(m=>m.id==='domains.geometry.recognition').content,/다른 표식만으로 길이가 다르다고 단정하지/);
});
test('recognition schema rejects solutions and malformed/truncated results',()=>{
 assert.throws(()=>check('recognition',{reply:'x',recognition:{...recognition(),solution:'new solution'}}));
 assert.throws(()=>check('generation',{reply:'x',items:[{question:{body:'partial'}}],holdReason:''}));
 assert.ok(!schemas.recognition.properties.recognition.properties.answer);
});

test('visible figure omission is marked unconfirmed, while source coordinates have an explicit frame',async t=>{
 const f=fixture(t),raw=recognition();check('recognition',{reply:'판독',recognition:raw});
 delete raw.observedDiagram.coordinateSystem;assert.throws(()=>check('recognition',{reply:'판독',recognition:raw}));
 for(const diagram of [null,{...recognition().observedDiagram,points:[]}]){
  const cleaned=cleanRecognition({...recognition(),observedDiagram:diagram},f.problem(),1);
  assert.equal(cleaned.status,'needs_confirmation');assert.match(cleaned.uncertainties[0].text,/도형을 그리지 못/);
 }
 f.bridge.run=async()=>({result:{reply:'도형 누락',recognition:{...recognition(),observedDiagram:null}}});
 await f.workflow.run({...f.base,task:'recognition'});
 assert.throws(()=>f.workflow.confirmSource(f.base.projectId,f.base.problemId),/도형/);
 const legacy=f.problem();legacy.recognition.confirmed=true;legacy.recognition.uncertainties=[];
 const decorated=f.workflow.decorate({...f.store.get(f.base.projectId),problems:[legacy]});
 assert.equal(decorated.problems[0].original.needsReview,true);
 assert.match(decorated.problems[0].original.reviewReasons.join(' '),/도형 누락/);
 const prompt=f.workflow.preview({...f.base,task:'recognition'}).instructions;
 assert.match(prompt,/image_y_down/);assert.match(prompt,/관찰 도형 생략을 뜻하지/);
});
test('recognition correction selects reading rules and omits scope and mathematical production',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});
 const preview=f.workflow.preview({...f.base,task:'revision',revisionMode:'correction',variant:'',targetIds:[f.problem().original.id]});
 assert.equal(preview.scope,null);assert.ok(preview.modules.some(m=>m.id==='recognition.common'));assert.ok(!preview.modules.some(m=>m.id==='production.common'));assert.equal(preview.schema.properties.item.type,'null');
});
test('unknown-domain discovery reuses identical recognition while changed instructions cannot silently overwrite it',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition',text:'인쇄 내용을 읽으세요.'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 const reused=await f.workflow.run({...f.base,task:'recognition',text:'인쇄 내용을 읽으세요.'});assert.equal(reused.run.reused,true);assert.equal(f.calls.length,1);
 await assert.rejects(f.workflow.run({...f.base,task:'recognition',text:'특정 표식을 다시 판단하세요.'}),/명시적으로/);assert.equal(f.calls.length,1);
});
test('numeric variants, all-solutions and proof are allowed; choice equivalence and forbidden concept claims are independently flagged',()=>{
 const all=item();all.questionType='all_solutions';all.question.answer='$-2,2$';assert.equal(programCheck(all,DEFAULT_SCOPE).program.errors.length,0);
 const multi=item();multi.questionType='single_choice';multi.question.choices=['$0.5$','$\\frac{1}{2}$'];multi.validation.correctChoiceIndices=[0,1];assert.ok(programCheck(multi,DEFAULT_SCOPE).program.errors.length>=2);
 assert.ok(programCheck(multi,DEFAULT_SCOPE).program.errors.some(e=>e.includes('수치적으로 동치')));
 const decimals=item();decimals.questionType='single_choice';decimals.question.choices=['$1.5$','$2.5$'];decimals.question.answer='$1.5$';decimals.validation.correctChoiceIndices=[0];assert.deepEqual(programCheck(decimals,DEFAULT_SCOPE).program.errors,[]);
 const requestedTwo=item();requestedTwo.questionType='single_choice';requestedTwo.question.body='옳은 것을 두 개 고르시오.';requestedTwo.question.choices=['① 조건 A','② 조건 B','③ 조건 C'];requestedTwo.question.answer='①, ③';requestedTwo.validation.correctChoiceIndices=[0,2];assert.deepEqual(programCheck(requestedTwo,DEFAULT_SCOPE).program.errors,[]);
 requestedTwo.validation.correctChoiceIndices=[0];assert.match(programCheck(requestedTwo,DEFAULT_SCOPE).program.errors.join(' '),/정답 2개/);
 const forbidden=item();forbidden.question.solution='닮음비와 피타고라스 정리로 구한다.';const report=programCheck(forbidden,DEFAULT_SCOPE);assert.equal(report.scope.status,'incompatible');assert.equal(report.format.status,'passed');assert.notEqual(report.program.status,'passed');
});
test('recognition has one AI call, does not solve, reuses results; new generation never reuses previous output',async t=>{
 const f=fixture(t);f.store.updateProblem(f.base.projectId,f.base.problemId,p=>p.part='geometry');
 await f.workflow.run({...f.base,task:'recognition',requestId:'recognize'});assert.equal(f.calls.length,1);assert.equal(f.problem().original.answer,'');assert.equal(f.calls[0].context.original,undefined);assert.doesNotMatch(f.calls[0].text,/금지 개념:/);
 const reused=await f.workflow.run({...f.base,task:'recognition',requestId:'recognize-again'});assert.equal(reused.run.reused,true);assert.equal(f.calls.length,1);
 f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 const generated=await f.workflow.run({...f.base,task:'generation',requestId:'new-1'});assert.equal(f.calls.at(-1).images.length,0);assert.match(f.calls.at(-1).text,/금지 개념:/);assert.equal(generated.run.tokens,null);assert.equal(f.problem().variants[0].approval.status,'pending');
 await f.workflow.run({...f.base,task:'generation',requestId:'new-1'});assert.equal(f.calls.length,2);
 await f.workflow.run({...f.base,task:'generation',requestId:'new-2',variant:'mirror_numeric'});assert.equal(f.calls.length,3);assert.notEqual(f.problem().variants[0].id,f.problem().variants[1].id);assert.equal(f.problem().recognition.version,1);
});
test('confirmed recognition is not overwritten on force without approval and source edits invalidate dependent approval',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);await f.workflow.run({...f.base,task:'generation'});
 await assert.rejects(f.workflow.run({...f.base,task:'recognition',force:true}),/명시적으로/);
 let q=f.problem().variants[0];f.workflow.approve(f.base.projectId,f.base.problemId,q.id,true);
 f.workflow.editQuestion({...f.base,questionId:f.problem().original.id,values:{body:'교정된 인쇄 지문',answer:'',solution:''}});
 assert.equal(f.problem().recognition.version,2);assert.equal(f.problem().variants[0].approval.status,'pending');assert.equal(f.problem().recognitionHistory.length,1);
});
test('scope changes preserve recognition; resetting one rule preserves content and invalidates only affected outputs',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);await f.workflow.run({...f.base,task:'generation'});
 const before=f.problem().recognition,original=f.problem().original;
 f.workflow.saveScope(f.base.projectId,{...DEFAULT_SCOPE,units:['삼각형의 성질']});assert.deepEqual(f.problem().recognition,before);assert.equal(f.problem().variants[0].checks.scope.status,'unverified');
 f.workflow.saveRule({id:'production.common',content:'사용자 생성 규칙'});assert.equal(f.problem().recognition.rulesStale,undefined);
 f.workflow.saveRule({id:'production.common',reset:true});assert.deepEqual(f.problem().original,original);assert.equal(f.problem().variants.length,1);
 f.workflow.saveRule({id:'domains.geometry.recognition',content:'치수 표식 확인'});assert.equal(f.problem().recognition.rulesStale,true);
});
test('validation records findings without changing question/answer/solution; revision creates a separate version',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);await f.workflow.run({...f.base,task:'generation'});
 const before=f.problem().variants[0];await f.workflow.run({...f.base,task:'validation',targetIds:[before.id]});const after=f.problem().variants[0];assert.equal(after.body,before.body);assert.equal(after.answer,before.answer);assert.equal(after.solution,before.solution);assert.equal(after.reviews.length,1);
 await f.workflow.run({...f.base,task:'revision',variant:'',targetIds:[before.id]});assert.equal(f.problem().variants.length,2);assert.equal(f.problem().variants[1].revisionOf,before.id);assert.ok(!f.calls.at(-1).execution.instructions.includes('[variants.'));
});
test('stale responses cannot overwrite a newer corrected source',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 let release;f.bridge.run=()=>new Promise(resolve=>release=resolve);
 const pending=f.workflow.run({...f.base,task:'generation'});await new Promise(r=>setImmediate(r));
 f.workflow.editQuestion({...f.base,questionId:f.problem().original.id,values:{body:'최신 원문 교정',answer:'',solution:''}});
 release({result:{reply:'late',items:[item()],holdReason:''}});await assert.rejects(pending,/오래된/);assert.equal(f.problem().original.body,'최신 원문 교정');assert.equal(f.problem().variants.length,0);
});

test('explicit recognition retries bypass reuse, archive approved sources and preserve results on failure',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);await f.workflow.run({...f.base,task:'generation'});
 const before=structuredClone(f.problem().recognition),variantId=f.problem().variants[0].id;
 const retry={...f.base,task:'recognition',force:true,acceptReplacement:true};
 await f.workflow.run(retry);assert.equal(f.calls.length,3);assert.equal(f.problem().recognition.version,2);assert.deepEqual(f.problem().recognitionHistory[0],before);assert.equal(f.problem().variants[0].id,variantId);assert.equal(f.problem().variants[0].approval.status,'pending');
 f.workflow.getSettings=()=>({model:'gemini-test-medium',effort:'medium'});
 await f.workflow.run({...retry,provider:'gemini'});assert.equal(f.calls.length,4);assert.equal(f.calls.at(-1).model,'gemini-test-medium');assert.equal(f.calls.at(-1).effort,'medium');assert.equal(f.problem().recognition.version,3);
 const stable=structuredClone(f.problem());f.bridge.run=async()=>{throw Error('temporary inference failure');};
 await assert.rejects(f.workflow.run(retry),/temporary inference failure/);
 assert.deepEqual(f.problem().recognition,stable.recognition);assert.deepEqual(f.problem().original,stable.original);assert.deepEqual(f.problem().recognitionHistory,stable.recognitionHistory);
});

test('partial retries have restricted schemas, preserve the other half and forward user feedback',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});const original=structuredClone(f.problem());
 const retry={...f.base,task:'recognition',force:true,acceptReplacement:true};
 const drawing=recognition().observedDiagram;drawing.points[0].x=-2;
 f.bridge.run=async request=>{f.calls.push(request);return {result:{reply:'그림',observedDiagram:drawing,uncertainties:[]}};};
 const preview=f.workflow.preview({...retry,recognitionTarget:'diagram',text:'각도 숫자에 화살표를 연결해 주세요.'});
 assert.equal(preview.schema.properties.body,undefined);assert.match(preview.inputText,/각도 숫자에 화살표/);assert.match(preview.instructions,/도형만 다시 그리기/);
 await f.workflow.run({...retry,recognitionTarget:'diagram',angleLabelLeaders:'always'});
 let p=f.problem();for(const k of ['body','choices','answer','solution'])assert.deepEqual(p.original[k],original.original[k]);
 for(const k of ['conditions','marks','givens','domains'])assert.deepEqual(p.recognition[k],original.recognition[k]);
 assert.equal(p.original.observedDiagram.points[0].x,-2);assert.equal(p.original.observedDiagram.angleLabelLeaders,'auto');assert.equal(p.recognition.cacheKey,null);
 const drawn=structuredClone(p.original.observedDiagram);
 f.bridge.run=async()=>({result:{reply:'문장',body:'교정된 문장',givens:['본문 조건'],statementBox:[],choices:['1','2'],conditions:[],printedAnswer:'',printedSolution:'',uncertainties:[]}});
 const textPreview=f.workflow.preview({...retry,recognitionTarget:'text'});assert.equal(textPreview.schema.properties.observedDiagram,undefined);assert.match(textPreview.instructions,/본문 문장만/);
 await f.workflow.run({...retry,recognitionTarget:'text'});p=f.problem();assert.equal(p.original.body,'교정된 문장');assert.deepEqual(p.original.observedDiagram,drawn);assert.deepEqual(p.recognition.marks,original.recognition.marks);assert.deepEqual(p.recognition.conditions,original.recognition.conditions);
 const stable=structuredClone(p);f.bridge.run=async()=>({result:{reply:'그림 누락',observedDiagram:null,uncertainties:[]}});
 await assert.rejects(f.workflow.run({...retry,recognitionTarget:'diagram'}),/기존 그림을 유지/);assert.deepEqual(f.problem().original,stable.original);assert.deepEqual(f.problem().recognitionHistory,stable.recognitionHistory);
});
test('quantity differences save complete results and only report an informational message',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 for(const provider of ['codex','gemini'])for(const returned of [1,4]){
  f.bridge.run=async()=>({result:{reply:'생성',items:Array.from({length:returned},()=>item()),holdReason:''}});
  const before=f.problem().variants.length;await f.workflow.run({...f.base,provider,task:'generation',text:'유사문제 3개 만들어줘'});
  assert.equal(f.problem().variants.length,before+returned);const run=f.problem().runs.at(-1);assert.equal(run.status,'completed');assert.equal(run.quantity.returned,returned);assert.match(f.problem().messages.at(-1).text,/모두 저장/);assert.equal(run.retries,0);
 }
 const before=f.problem().variants.length;f.bridge.run=async()=>({result:{reply:'없음',items:[],holdReason:''}});await assert.rejects(f.workflow.run({...f.base,task:'generation'}),/생성된 문항이 없습니다/);assert.equal(f.problem().variants.length,before);
 f.bridge.run=async()=>({result:{reply:'잘림'}});await assert.rejects(f.workflow.run({...f.base,task:'generation'}));assert.equal(f.problem().variants.length,before);
});
test('mixed numeric and mirror counts pass all requested rules once to both provider calls',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 const text='수치만 바꾼 유사문제 2개, 수치와 도형을 좌우반전한거 1개 만들어줘';
 for(const provider of ['codex','gemini']){
  const request={...f.base,task:'generation',provider,text,variant:'mirror_numeric'};
  const preview=f.workflow.preview(request);assert.equal(preview.requestOptions.count,3);assert.deepEqual(preview.variantRequests,[{variant:'numeric_only',count:2},{variant:'mirror_numeric',count:1}]);
  const ids=preview.modules.map(m=>m.id);assert.equal(ids.filter(id=>id==='variants.numeric_only').length,1);assert.equal(ids.filter(id=>id==='variants.mirror_numeric').length,1);assert.ok(!ids.includes('variants.alternative_property'));
  f.bridge.run=async req=>{assert.equal(req.execution.instructions,preview.instructions);assert.match(req.text,/variantRequests/);return{result:{reply:'세 문제 생성',items:[item(),item(),item()],holdReason:''}};};
  await f.workflow.run(request);assert.equal(f.problem().runs.at(-1).quantity.status,'matched');
 }
 assert.equal(f.problem().variants.length,6);assert.equal(f.problem().recognition.version,1);
});

test('legacy user rules survive verbatim; per-module restore never clears other edits',t=>{
 const f=fixture(t);const legacy={common:'특수 예외 원문',recognition:'인식 사용자 원문',parts:{integer:'a',algebra:'b',geometry:'c',combinatorics:'d'}};fs.writeFileSync(path.join(f.directory,'prompt-settings.json'),JSON.stringify(legacy));
 const rules=new RulesStore(f.directory);assert.deepEqual(rules.snapshot().legacy[0].prompts,legacy);rules.save('production.common','공통 사용자');rules.save('domains.geometry.math','기하 사용자');rules.save('production.common','',true);assert.equal(rules.snapshot().modules.find(m=>m.id==='domains.geometry.math').content,'기하 사용자');assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.directory,'prompt-settings.json'))),legacy);
});

test('explicit generation override is version-bound, preserves warnings and never approves incomplete output',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});
 const r=f.problem().recognition;
 const req={...f.base,task:'generation',allowUnverifiedGeneration:true,overrideSourceVersion:r.version};
 await assert.rejects(f.workflow.run({...req,overrideSourceVersion:r.version-1}),/원문이 변경/);
 for(const provider of ['codex','gemini']){
  const preview=f.workflow.preview({...req,provider});assert.equal(preview.generationOverride,true);assert.match(preview.instructions,/이번 생성에 한해 적용하지 않는다/);
  f.bridge.run=async call=>{assert.equal(call.execution.instructions,preview.instructions);return{result:{reply:'생성',items:[item()],holdReason:'근사 도형 불일치 확인 필요'}};};
  await f.workflow.run({...req,provider});
 }
 assert.equal(f.problem().variants.length,2);assert.deepEqual(f.problem().recognition,r);
 for(const q of f.problem().variants){assert.equal(q.approval.status,'pending');assert.equal(q.include,false);assert.match(q.provenance.generationOverride.warning,/근사 도형/);}
 f.bridge.run=async()=>({result:{reply:'',items:[],holdReason:'보류'}});await assert.rejects(f.workflow.run(req),/생성된 문항이 없습니다/);
 const bad=item();bad.question.solution='';f.bridge.run=async()=>({result:{reply:'',items:[bad],holdReason:''}});await assert.rejects(f.workflow.run(req),/풀이.*누락/);
 assert.equal(f.problem().variants.length,2);
});

test('center restoration tolerates approximate mathematical mismatch for both providers',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});const body=f.problem().original.body;
 const drawing=recognition().observedDiagram;drawing.points.push({name:'I',x:4,y:1,labelDx:null,labelDy:null},{name:'O',x:4,y:2,labelDx:null,labelDy:null});
 for(const provider of ['codex','gemini']){
  const req={...f.base,provider,task:'recognition',recognitionTarget:'diagram',force:true,acceptReplacement:true,additionalInstructions:'원래 있는 내심 I와 외심 O를 점으로 표시해줘'};
  const preview=f.workflow.preview(req);assert.match(preview.instructions,/복원을 거절하지 않는다/);
  f.bridge.run=async()=>({result:{reply:'점 복원',observedDiagram:structuredClone(drawing),uncertainties:[{text:'근사 좌표의 수학적 불일치',kind:'mathematical',location}]}});
  await f.workflow.run(req);assert.equal(f.problem().original.body,body);assert.ok(f.problem().original.observedDiagram.points.some(p=>p.name==='I'));assert.ok(f.problem().recognition.uncertainties.some(u=>u.kind==='mathematical'));
 }
});

test('source solutions require confirmation, reuse unchanged meaning and preserve drawing/text',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});
 await assert.rejects(f.workflow.run({...f.base,task:'solve'}),/원문 판독/);
 f.workflow.confirmSource(f.base.projectId,f.base.problemId);const original=structuredClone(f.problem().original);let calls=0;
 f.bridge.run=async r=>{calls++;assert.match(r.execution.instructions,/task.solve/);assert.doesNotMatch(r.execution.instructions,/\[recognition.common|\[variants\./);return{result:{reply:'풀이',answer:'2',solution:'조건에서 계산하여 2. 대입 검산.',questionType:'single_value',validation:validation(),holdReason:''}};};
 for(const provider of ['gemini','codex'])await f.workflow.run({...f.base,provider,task:'solve',reuseSolution:true});
 assert.equal(calls,1);assert.equal(f.problem().original.body,original.body);assert.deepEqual(f.problem().original.observedDiagram,original.observedDiagram);assert.equal(f.problem().original.approval.status,'pending');
 const key=f.problem().original.solutionKey;const drawing=recognition().observedDiagram;
 f.bridge.run=async()=>({result:{reply:'배치',observedDiagram:drawing,uncertainties:[]}});
 await f.workflow.run({...f.base,task:'recognition',recognitionTarget:'diagram',force:true,acceptReplacement:true});assert.equal(f.problem().original.solutionKey,key);assert.match(f.problem().original.solution,/대입/);
 f.workflow.ignoreSourceIssues({...f.base,sourceVersion:f.problem().recognition.version,keys:require('../app/review-issues.js').uniqueIssues(f.problem().recognition.uncertainties).map(require('../app/review-issues.js').issueKey)});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 f.bridge.run=async()=>{throw Error('unchanged solution must reuse');};const reused=await f.workflow.run({...f.base,task:'solve',reuseSolution:true});assert.equal(reused.run.reused,true);
 f.workflow.saveScope(f.base.projectId,{...DEFAULT_SCOPE,units:['삼각형의 성질']});assert.equal(f.workflow.decorate(f.store.get(f.base.projectId)).problems[0].original.solutionStale,true);
});

test('solution stale response and failure preserve the prior answer',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 f.bridge.run=async()=>{f.workflow.editQuestion({...f.base,questionId:f.problem().original.id,values:{body:'새 조건',answer:'기존 답',solution:'기존 풀이'}});return{result:{reply:'',answer:'오래된 답',solution:'오래된 풀이',questionType:'single_value',validation:validation(),holdReason:''}};};
 await assert.rejects(f.workflow.run({...f.base,task:'solve'}));assert.equal(f.problem().original.answer,'기존 답');
});

test('scope presets save actual structured values and editing one preserves others and sources',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});const r=f.problem().recognition;
 const a=f.workflow.scopePreset({projectId:f.base.projectId,action:'create',name:'중간',scope:{...DEFAULT_SCOPE,units:['삼각형의 성질']}}).presets.at(-1);
 const b=f.workflow.scopePreset({projectId:f.base.projectId,action:'create',name:'기말',scope:{...DEFAULT_SCOPE,units:['사각형의 성질']}}).presets.at(-1);
 f.workflow.scopePreset({projectId:f.base.projectId,action:'select',id:a.id});assert.deepEqual(f.workflow.settings(f.base.projectId).scope.units,['삼각형의 성질']);
 f.workflow.scopePreset({projectId:f.base.projectId,action:'update',id:a.id,scope:{...DEFAULT_SCOPE,restrictions:'사용자 제한'}});
 assert.deepEqual(f.workflow.settings(f.base.projectId).presets.find(p=>p.id===b.id),b);assert.deepEqual(f.problem().recognition,r);
 assert.match(f.workflow.preview({...f.base,task:'generation'}).inputText,/사용자 제한/);
});

test('diagram repair changes coordinates only, preserves prior version on failed checks',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 const i=item();i.question.diagram={shadedRegions:[],equalAngleMarks:[],lines:[],equalLengthMarks:[],dimensions:[],angleLabelOverrides:null,angleLabelLeaders:"auto",coordinateSystem:"cartesian_y_up",points:['A','B','C','D'].map((name,n)=>({name,x:n,y:n===3?1:0,labelDx:null,labelDy:null})),segments:[],circles:[],angles:[],labels:[],constraints:[{type:'collinear',points:['A','B','C','D'],value:null}]};
 f.bridge.run=async()=>({result:{reply:'',items:[i],holdReason:''}});await f.workflow.run({...f.base,task:'generation'});const old=f.problem().variants[0],fixed=structuredClone(old.diagram);fixed.points[3].y=0;
 const req={...f.base,task:'revision',revisionMode:'diagram',targetIds:[old.id],variant:''};
 f.bridge.run=async()=>({result:{reply:'',diagram:{...fixed,constraints:[]},validation:validation(),holdReason:''}});await assert.rejects(f.workflow.run(req),/조건을 변경/);assert.deepEqual(f.problem().variants[0].diagram,old.diagram);
 f.bridge.run=async()=>({result:{reply:'',diagram:fixed,validation:validation(),holdReason:''}});await f.workflow.run(req);const q=f.problem().variants[0];assert.equal(f.problem().variants.length,1);for(const k of ['body','answer','solution','choices'])assert.deepEqual(q[k],old[k]);assert.equal(q.validation.ok,true);assert.equal(q.approval.status,'pending');assert.equal(q.diagramHistory.length,1);
});

test('legacy four-point collinearity diagnostics refresh without approving the question',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);await f.workflow.run({...f.base,task:'generation'});
 f.store.updateProblem(f.base.projectId,f.base.problemId,p=>{const q=p.variants[0];q.diagram={points:['A','B','C','D'].map((name,x)=>({name,x,y:0})),constraints:[{type:'collinear',points:['A','B','C','D'],value:null}]};q.validation={errors:['collinear 조건의 점을 확인해 주세요.']};q.checks.program.errors=['collinear 조건의 점을 확인해 주세요.'];});
 const q=f.workflow.decorate(f.store.get(f.base.projectId)).problems[0].variants[0];assert.deepEqual(q.validation.errors,[]);assert.deepEqual(q.checks.program.errors,[]);assert.equal(q.checks.program.status,'partial');assert.equal(q.approval.status,'pending');
});

test('regenerating a variant solution uses only the chosen question and preserves generation provenance',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);await f.workflow.run({...f.base,task:'generation'});
 const before=structuredClone(f.problem()),q=before.variants[0];let calls=0;
 f.bridge.run=async req=>{calls++;assert.match(req.execution.instructions,/대상은 targets에 지정된 유사문제/);return{result:{reply:'재작성',answer:'2',solution:'새 상세 풀이 '+calls,questionType:'single_value',validation:validation(),holdReason:''}};};
 const request={...f.base,task:'solve',targetIds:[q.id],force:true};await f.workflow.run(request);await f.workflow.run({...request,provider:'gemini'});assert.equal(calls,2);
 const result=f.problem().variants[0];assert.ok(result.solution.startsWith('새 상세 풀이 2'));assert.doesNotMatch(result.solution,/총 6점/);assert.equal(result.solutionHistory.length,2);assert.deepEqual(result.provenance,q.provenance);assert.deepEqual(result.diagram,q.diagram);assert.equal(result.body,q.body);assert.equal(f.problem().variants.length,1);assert.deepEqual(f.problem().original,before.original);assert.equal(result.include,false);
 f.bridge.run=async()=>{throw Error('temporary timeout');};await assert.rejects(f.workflow.run(request),/timeout/);assert.deepEqual(f.problem().variants[0],result);
});

test('solution requests take priority for originals and every variant through the shared provider call',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 await f.workflow.run({...f.base,task:'generation'});await f.workflow.run({...f.base,task:'generation',variant:'alternative_property'});
 const before=structuredClone(f.problem()),settings=JSON.stringify(f.workflow.rules.snapshot());let calls=0;
 f.bridge.run=async req=>{calls++;assert.match(req.execution.instructions,/사용자 추가 요청 최우선/);assert.match(req.execution.instructions,/실제로 충돌하는 조항만/);assert.match(req.execution.instructions,/시험 범위 충돌만으로 보류하지 않는다/);assert.match(req.text,/피타고라스 정리로 풀어 주세요/);assert.doesNotMatch(req.execution.instructions,/이번 도형 다시 그리기: 사용자 추가 요청 우선/);return{result:{reply:'요청 적용',answer:'2',solution:'새 풀이 '+calls,questionType:'single_value',validation:validation(),holdReason:''}};};
 for(const [index,q] of [before.original,...before.variants].entries()){
  const request={...f.base,task:'solve',targetIds:[q.id],provider:index%2?'gemini':'codex',solutionInstructions:'피타고라스 정리로 풀어 주세요.'};
  const preview=f.workflow.preview(request);assert.equal(preview.additionalInstructionsApplied,true);assert.match(preview.instructions,/사용자 추가 요청 최우선/);
  await f.workflow.run(request);await f.workflow.run(request);
  const updated=[f.problem().original,...f.problem().variants].find(x=>x.id===q.id);assert.equal(updated.body,q.body);assert.deepEqual(updated.diagram,q.diagram);assert.equal(updated.solutionProvenance.solutionInstructions,request.solutionInstructions);
 }
 assert.equal(calls,6);assert.equal(f.problem().variants.length,2);assert.equal(JSON.stringify(f.workflow.rules.snapshot()),settings);
 const plain=f.workflow.preview({...f.base,task:'solve',targetIds:[before.original.id]});assert.doesNotMatch(plain.instructions,/사용자 추가 요청 최우선/);
});

test('reviewed override-generated variants can be explicitly approved for Word, including explicitly acknowledged failed checks',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});
 await f.workflow.run({...f.base,task:'generation',allowUnverifiedGeneration:true,overrideSourceVersion:f.problem().recognition.version});
 const id=f.problem().variants[0].id;
 assert.equal(f.problem().variants[0].include,false);
 f.workflow.approve(f.base.projectId,f.base.problemId,id,true);let q=f.problem().variants[0];assert.equal(q.include,true);assert.equal(q.approval.status,'approved');assert.match(q.approval.acknowledgedWarnings[0],/오류 무시/);assert.ok(q.provenance.generationOverride);assert.deepEqual(q.reviewReasons,[]);
 f.workflow.approve(f.base.projectId,f.base.problemId,id,true);assert.equal(f.problem().variants[0].approval.acknowledgedWarnings.length,1);assert.equal(f.problem().variants[0].documentExcluded,false);
 f.workflow.approve(f.base.projectId,f.base.problemId,id,false);assert.equal(f.problem().variants[0].documentExcluded,true);assert.equal(f.problem().variants[0].include,false);
 f.workflow.approve(f.base.projectId,f.base.problemId,id,true);assert.equal(f.problem().variants[0].documentExcluded,false);
 f.store.updateProblem(f.base.projectId,f.base.problemId,p=>{p.variants[0].checks.ai.status='failed';});f.workflow.approve(f.base.projectId,f.base.problemId,id,true);assert.equal(f.problem().variants[0].approval.method,'manual_user_authorized');assert.equal(f.problem().variants[0].checks.ai.status,'failed');
 f.store.updateProblem(f.base.projectId,f.base.problemId,p=>{p.variants[0].checks.ai.status='passed';p.variants[0].reviewReasons=['원문 버전이 변경되었습니다.'];});f.workflow.approve(f.base.projectId,f.base.problemId,id,true);assert.ok(f.problem().variants[0].approval.acknowledgedWarnings.includes('원문 버전이 변경되었습니다.'));
});


test('audit 1: unchanged redraw retains failed solution checks and requires explicit user approval for cached failure',async t=>{
 const f=fixture(t);const raw=recognition();raw.marks=raw.marks.filter(m=>m.kind!=='length_range');
 f.bridge.run=async()=>({result:{reply:'read',recognition:raw}});await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 f.bridge.run=async()=>({result:{reply:'solve',answer:'2',solution:'풀이',questionType:'single_value',validation:{...validation(),status:'failed'},holdReason:''}});await f.workflow.run({...f.base,task:'solve'});
 f.bridge.run=async()=>({result:{reply:'redraw',observedDiagram:raw.observedDiagram,uncertainties:[]}});await f.workflow.run({...f.base,task:'recognition',recognitionTarget:'diagram',force:true,acceptReplacement:true});
 assert.equal(f.problem().original.checks.ai.status,'failed');f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 f.bridge.run=async()=>{throw Error('should reuse');};await f.workflow.run({...f.base,task:'solve',reuseSolution:true});f.workflow.approve(f.base.projectId,f.base.problemId,f.problem().original.id,true);assert.equal(f.problem().original.approval.method,'manual_user_authorized');assert.equal(f.problem().original.checks.ai.status,'failed');
});
test('audit 3 and 5: domain changes revoke originals and chat solve never silently reuses',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);let calls=0;
 f.bridge.run=async()=>{calls++;return{result:{reply:'solve',answer:'2',solution:'풀이',questionType:'single_value',validation:validation(),holdReason:''}};};
 await f.workflow.run({...f.base,task:'solve'});await f.workflow.run({...f.base,task:'solve',text:'다른 방법으로 풀어줘'});assert.equal(calls,2);
 f.workflow.approve(f.base.projectId,f.base.problemId,f.problem().original.id,true);f.workflow.setPart({...f.base,part:'algebra'});assert.equal(f.problem().original.approval.status,'pending');assert.equal(f.problem().original.needsReview,true);assert.equal(f.problem().original.solutionKey,null);
});


test('audit 8 and 9: correction resolves stale source; scoped reread refreshes initial reading warnings only',async t=>{
 const f=fixture(t),r=recognition();r.marks=[];
 r.uncertainties=[{text:'각도 표식 확인 필요',kind:'reading',location},{text:'본문 분모 확인 필요',kind:'reading',location},{text:'본문과 도형 불일치',kind:'mismatch',location}];
 f.bridge.run=async()=>({result:{reply:'read',recognition:r}});await f.workflow.run({...f.base,task:'recognition'});
 f.bridge.run=async()=>({result:{reply:'redraw',observedDiagram:r.observedDiagram,uncertainties:[]}});await f.workflow.run({...f.base,task:'recognition',recognitionTarget:'diagram',force:true,acceptReplacement:true});
 assert.deepEqual(f.problem().recognition.uncertainties.map(u=>u.text),['본문 분모 확인 필요','본문과 도형 불일치']);
 f.store.updateProblem(f.base.projectId,f.base.problemId,p=>{p.recognition.sourceStale=true;p.recognition.rulesStale=true;p.recognition.uncertainties=[];});
 f.workflow.editQuestion({...f.base,questionId:f.problem().original.id,values:{body:f.problem().original.body}});assert.equal(f.problem().recognition.sourceStale,false);assert.equal(f.problem().recognition.rulesStale,false);f.workflow.confirmSource(f.base.projectId,f.base.problemId);
});
test('audit 7 and 13: generated annotations render and circle deletion cannot pass diagram repair',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 const i=item(),d=recognition().observedDiagram;d.coordinateSystem='cartesian_y_up';d.circles=[{cx:0,cy:0,r:3}];d.dimensions=[{from:'A',to:'C',start:{x:0,y:-1},end:{x:8,y:-1},label:'8',origin:'constructed',guideStyle:'curved',endpointStyle:'none'}];i.question.diagram=d;
 f.bridge.run=async()=>({result:{reply:'created',items:[i],holdReason:''}});await f.workflow.run({...f.base,task:'generation'});const q=f.problem().variants[0];
 assert.match(require('../app/geometry.cjs').diagramSvg(q.diagram),/dimension-guide/);
 f.bridge.run=async()=>({result:{reply:'repair',diagram:{...d,circles:[]},validation:validation(),holdReason:''}});await assert.rejects(f.workflow.run({...f.base,task:'revision',revisionMode:'diagram',targetIds:[q.id]}),/원의 조건/);assert.deepEqual(f.problem().variants[0].diagram,q.diagram);
 const bad={...d,dimensions:[{...d.dimensions[0],from:'MISSING'}]};assert.equal(require('../app/geometry.cjs').inspectDiagram(bad).ok,false);
});

test('regression: quick generation still creates one source-level question despite stale count settings',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 await f.workflow.run({...f.base,task:'generation',requestKind:'suggestion',count:9,difficulty:'상',text:'9개를 상 난이도로 만들어줘'});
 assert.equal(f.problem().variants.length,1);assert.equal(f.problem().runs.at(-1).requestOptions.count,1);assert.equal(f.problem().runs.at(-1).requestOptions.difficulty,'same');assert.match(f.calls.at(-1).execution.instructions,/원문과 동일한 난이도/);
});

test('variant regeneration selects difficulty, supplies target, keeps prior item and makes fresh calls',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 await f.workflow.run({...f.base,task:'generation'});const old=structuredClone(f.problem().variants[0]);
 for(const provider of ['codex','gemini']){
  const req={...f.base,provider,task:'generation',regenerateOf:old.id,difficulty:'상',count:8};
  const preview=f.workflow.preview(req);assert.match(preview.inputText,/regenerationTarget/);assert.match(preview.inputText,/"difficultyPolicy":"requested"/);assert.match(preview.instructions,/지정 난이도 상/);
  assert.equal(preview.requestOptions.count,1);assert.equal(preview.requestOptions.difficulty,'상');assert.deepEqual(preview.targetIds,[old.id]);
  await f.workflow.run(req);assert.deepEqual(f.problem().variants[0],old);const fresh=f.problem().variants.at(-1);assert.notEqual(fresh.id,old.id);assert.equal(fresh.regenerationOf,old.id);assert.equal(fresh.approval.status,'pending');assert.equal(fresh.include,false);
 }
 assert.equal(f.problem().variants.length,3);assert.equal(f.calls.filter(r=>r.execution.task==='recognition').length,1);
 assert.throws(()=>f.workflow.preview({...f.base,task:'generation',regenerateOf:'missing'}),/찾을 수/);
 assert.throws(()=>f.workflow.preview({...f.base,task:'generation',regenerateOf:old.id,difficulty:'invalid'}),/난이도/);
 assert.match(f.workflow.preview({...f.base,task:'generation',regenerateOf:old.id}).instructions,/대상 유사문제와 동일한 난이도/);
});

test('both providers receive native line and tick contracts in recognition and generation',t=>{
 const f=fixture(t);
 for(const provider of ['codex','gemini'])for(const task of ['recognition','generation']){
  const preview=f.workflow.preview({...f.base,task,provider});assert.match(preview.instructions,/직선 BC와 선분 BC/);assert.match(preview.instructions,/소문자는 숫자 1이 아니다/);assert.match(preview.instructions,/equalLengthMarks/);assert.match(preview.instructions,/선분 위/);
  const schema=task==='recognition'?preview.schema.properties.recognition.properties.observedDiagram.anyOf[0]:preview.schema.properties.items.items.properties.question.properties.diagram.anyOf[0];
  assert.ok(schema.required.includes('lines'));assert.ok(schema.required.includes('equalLengthMarks'));
 }
});

test('legacy recognition editor accepts absent new annotation arrays without losing user text',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});const r=recognition();delete r.observedDiagram.lines;delete r.observedDiagram.equalLengthMarks;
 f.workflow.editQuestion({...f.base,questionId:f.problem().original.id,values:{body:'사용자가 확인한 본문'},recognitionData:r});
 assert.equal(f.problem().original.body,'사용자가 확인한 본문');assert.deepEqual(f.problem().recognition.observedDiagram.lines,[]);
 assert.equal(f.problem().recognition.observedDiagram.equalLengthMarks.length,2);
 assert.ok(f.problem().recognition.observedDiagram.equalLengthMarks.every(m=>m.origin==='printed'&&m.count===1));
 assert.ok(!('lines' in r.observedDiagram));
});

test('diagram repair preserves line and tick identities while permitting placement repairs',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 const i=item(),d=recognition().observedDiagram;d.coordinateSystem='cartesian_y_up';
 d.lines=[{start:{x:-1,y:-1},end:{x:9,y:-1},through:[],label:'l',dashed:false,origin:'constructed'}];
 d.equalLengthMarks=[{from:'A',to:'B',count:1,group:'g',position:null,origin:'constructed'}];i.question.diagram=d;
 f.bridge.run=async()=>({result:{reply:'created',items:[i],holdReason:''}});await f.workflow.run({...f.base,task:'generation'});const q=f.problem().variants[0];
 const request={...f.base,task:'revision',revisionMode:'diagram',targetIds:[q.id]};
 for(const field of ['lines','equalLengthMarks']){f.bridge.run=async()=>({result:{reply:'repair',diagram:{...d,[field]:[]},validation:validation(),holdReason:''}});await assert.rejects(f.workflow.run(request),/직선·빗금/);}
 const fixed=structuredClone(d);fixed.lines[0].start.y=-2;fixed.lines[0].end.y=-2;fixed.equalLengthMarks[0].position=.6;
 f.bridge.run=async()=>({result:{reply:'repair',diagram:fixed,validation:validation(),holdReason:''}});await f.workflow.run(request);
 assert.deepEqual(f.problem().variants[0].diagram,fixed);
});
test('regression: explicit source review can confirm stale rules without claiming math passed',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.store.updateProblem(f.base.projectId,f.base.problemId,p=>{p.recognition.sourceStale=true;});
 const version=f.problem().recognition.version;assert.throws(()=>f.workflow.confirmSource(f.base.projectId,f.base.problemId),/다시 인식/);
 f.workflow.confirmSource(f.base.projectId,f.base.problemId,{reviewed:true,sourceVersion:version});assert.equal(f.problem().recognition.confirmed,true);assert.equal(f.problem().recognition.sourceStale,false);assert.notEqual(f.problem().original.approval.status,'approved');assert.throws(()=>f.workflow.confirmSource(f.base.projectId,f.base.problemId,{reviewed:true,sourceVersion:version}),/버전/);
});

test('both providers receive three chat questions and retry preserves quantity without recognizing again',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 const source=structuredClone(f.problem().recognition),requests=[];
 f.bridge.run=async request=>{requests.push(request);return{result:{reply:'세 문항 생성',items:[item(),item(),item()],holdReason:''}};};
 for(const provider of ['codex','gemini']){
  const request={...f.base,provider,task:'generation',text:'유사문제 3개 만들어줘',count:1};
  const preview=f.workflow.preview(request);assert.equal(preview.requestOptions.count,3);assert.match(preview.instructions,/정확히 3문항/);assert.match(preview.inputText,/"count":3/);
  await f.workflow.run(request);assert.equal(requests.at(-1).execution.instructions,preview.instructions);
 }
 assert.equal(f.problem().variants.length,6);assert.equal(new Set(f.problem().variants.map(q=>q.id)).size,6);assert.ok(f.problem().variants.every(q=>q.answer&&q.solution));assert.deepEqual(f.problem().recognition,source);
 const saved=f.problem().runs.at(-1).requestOptions;assert.equal(saved.count,3);assert.equal(saved.requestKind,'');
 await f.workflow.run({...f.base,...saved,provider:'gemini'});assert.equal(f.problem().variants.length,9);assert.equal(requests.length,3);assert.ok(requests.every(r=>r.execution.task==='generation'));
});

test('drawing-only retry preserves approved variants across reload; mathematical mismatch still flags review',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);await f.workflow.run({...f.base,task:'generation'});
 const q=f.problem().variants[0];f.workflow.approve(f.base.projectId,f.base.problemId,q.id,true);const before=structuredClone(f.problem().variants[0]);
 const d=recognition().observedDiagram;d.points[0].x=-2;
 f.bridge.run=async()=>({result:{reply:'배치 수정',observedDiagram:d,uncertainties:[]}});
 await f.workflow.run({...f.base,task:'recognition',recognitionTarget:'diagram',force:true,acceptReplacement:true});
 const fresh=f.workflow.decorate(f.store.get(f.base.projectId));assert.deepEqual(fresh.problems[0].variants[0],before);assert.equal(fresh.problems[0].recognition.changeKind,'drawing_only');
 f.bridge.run=async()=>({result:{reply:'충돌 발견',observedDiagram:d,uncertainties:[{text:'인쇄 조건끼리 충돌',kind:'mismatch',location}]}});
 await f.workflow.run({...f.base,task:'recognition',recognitionTarget:'diagram',force:true,acceptReplacement:true});assert.equal(f.workflow.decorate(f.store.get(f.base.projectId)).problems[0].variants[0].needsReview,true);
});

test('regeneration difficulty contract and direct instructions use the same preview/call path',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);await f.workflow.run({...f.base,task:'generation'});const q=f.problem().variants[0];
 for(const difficulty of ['하','중하','중','중상','상'])assert.deepEqual(f.workflow.preview({...f.base,task:'generation',regenerateOf:q.id,difficulty}).schema.properties.items.items.properties.difficulty.enum,[difficulty]);
 const req={...f.base,task:'generation',regenerateOf:q.id,difficulty:'상',regenerationInstructions:'닮음을 이용해 풀 수 있게 중하 난이도로 해줘.'};
 const p=f.workflow.preview(req);assert.equal(p.schema.properties.items.items.properties.difficulty.enum.length,5);assert.match(p.inputText,/닮음을 이용해/);assert.match(p.instructions,/사용자 직접 요청 최우선/);
 await f.workflow.run(req);assert.equal(f.calls.at(-1).execution.instructions,p.instructions);assert.equal(f.problem().variants.at(-1).userInstructions,req.regenerationInstructions);
 const i=item();i.question.solution='닮음을 이용한다.';i.validation.usedConcepts=['닮음'];i.validation.scopeStatus='incompatible';
 assert.equal(programCheck(i,DEFAULT_SCOPE).scope.status,'incompatible');
 i.question.userInstructions='닮음을 이용해 풀어줘';assert.notEqual(programCheck(i,DEFAULT_SCOPE).scope.status,'incompatible');assert.deepEqual(programCheck(i,DEFAULT_SCOPE).scope.userAuthorizedConcepts,['닮음']);
 i.question.userInstructions='닮음을 사용하지 마';assert.equal(programCheck(i,DEFAULT_SCOPE).scope.status,'incompatible');
});

test('delete one variant preserves other questions, archives it and excludes future document lists',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);await f.workflow.run({...f.base,task:'generation'});await f.workflow.run({...f.base,task:'generation'});
 const p=structuredClone(f.problem());f.workflow.deleteVariant({...f.base,questionId:p.variants[0].id});
 assert.deepEqual(f.problem().original,p.original);assert.deepEqual(f.problem().variants,[p.variants[1]]);assert.equal(f.problem().deletedVariants[0].id,p.variants[0].id);
 assert.throws(()=>f.workflow.deleteVariant({...f.base,questionId:p.original.id}),/없습니다/);
});

test('direct instructions are final for every task/provider, keep stored rules, and drive generation difficulty',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 const rules=JSON.stringify(f.workflow.rules.snapshot());
 for(const provider of ['codex','gemini'])for(const task of ['recognition','generation','revision','validation','solve']){
  const req={...f.base,provider,task,text:'이번에는 닮음을 이용해 중상 난이도로 만들어줘.',revisionMode:'content'};
  const p=f.workflow.preview(req),last=p.instructions.lastIndexOf('[사용자 직접 요청 최우선]');assert.ok(last>0);
  assert.match(p.instructions.slice(last),/공통·인식·생성·수정·영역·검수·변형 규칙/);assert.match(p.instructions.slice(last),/충돌하면 해당 프롬프트 조항만 이번 작업에서 무시/);
  assert.equal(p.requestOptions.userInstructions,req.text);assert.equal(p.additionalInstructionsApplied,true);
  if(task==='generation'){assert.equal(p.requestOptions.difficulty,'중상');assert.match(p.inputText,/"difficultyPolicy":"requested"/);assert.match(p.inputText,/"userAuthorizedConcepts":\["닮음"\]/);}
 }
 const req={...f.base,task:'generation',text:'닮음을 이용해 중상 난이도로 1개 만들어줘.'};const preview=f.workflow.preview(req);await f.workflow.run(req);
 assert.equal(f.calls.at(-1).execution.instructions,preview.instructions);assert.equal(f.problem().variants.at(-1).userInstructions,req.text);assert.equal(JSON.stringify(f.workflow.rules.snapshot()),rules);
 const recovery=f.workflow.preview({...f.base,task:'solve',autoRecover:true,text:'이번 풀이에서는 닮음을 이용해 풀어줘'});assert.ok(recovery.instructions.lastIndexOf('[사용자 직접 요청 최우선]')>recovery.instructions.lastIndexOf('이번 자동 정리는'));
});

test('boxed Korean statements are not answer choices, including legacy circled prefixes',async t=>{
 const f=fixture(t),r=recognition();r.choices=['① ㄱ. $AB=BC$이다.','② ㄴ. 삼각형이다.'];r.statementBox=[];
 f.bridge.run=async()=>({result:{reply:'인식',recognition:r}});await f.workflow.run({...f.base,task:'recognition'});
 assert.deepEqual(f.problem().original.choices,[]);assert.deepEqual(f.problem().original.statementBox,['ㄱ. $AB=BC$이다.','ㄴ. 삼각형이다.']);
 const split=require('../app/question-text.cjs').separateStatements({choices:['① ㄱ, ㄴ','② ㄴ, ㄷ'],statementBox:['ㄱ. 내용']});assert.equal(split.choices.length,2);assert.equal(split.statementBox.length,1);
 assert.match(f.workflow.preview({...f.base,task:'recognition'}).instructions,/서술형을 객관식으로 바꾸지/);
});

test('narrow writing-space default replaces the old default once and preserves subsequent choices',t=>{
 const f=fixture(t),p=f.store.get(f.base.projectId);delete p.writingSpaceDefaultVersion;p.settings.workspaceLines=4;
 f.workflow.decorate(p);assert.equal(p.settings.workspaceLines,2);p.settings.workspaceLines=4;f.workflow.decorate(p);assert.equal(p.settings.workspaceLines,4);
 delete p.writingSpaceDefaultVersion;p.settings.workspaceLines=0;f.workflow.decorate(p);assert.equal(p.settings.workspaceLines,0);
});

test('changed direct recognition instructions do not reuse an older cached result',async t=>{
 const f=fixture(t);const req={...f.base,task:'recognition',text:'원문 인식',requestKind:'recognition',userInstructions:'보기 상자 확인'};
 await f.workflow.run(req);const first=f.calls.length;await f.workflow.run(req);assert.equal(f.calls.length,first);
 await f.workflow.run({...req,userInstructions:'보기 상자와 인쇄된 점 표시 확인'});assert.equal(f.calls.length,first+1);
});

test('projectless scope edits persist without changing existing projects or rules', t=>{
 const f=fixture(t),before=f.store.get(f.base.projectId),rules=f.workflow.rules.snapshot();
 const scope={...DEFAULT_SCOPE,units:['독립 저장 범위']};assert.equal(f.workflow.saveScope(undefined,scope),null);
 assert.deepEqual(f.workflow.scopeSettings().scope,scope);assert.deepEqual(f.store.get(before.id),before);
 const preset=f.workflow.scopePreset({action:'create',name:'새 시험지 기본',scope});
 assert.equal(preset.project,null);assert.equal(f.workflow.scopeSettings().scopePresetId,preset.scopePresetId);
 const fresh=f.workflow.initializeScope(f.store.create(path.join(f.directory,'source.png')));
 assert.deepEqual(fresh.scope,scope);assert.equal(fresh.scopePresetId,preset.scopePresetId);
 f.workflow.scopePreset({action:'rename',id:preset.scopePresetId,name:'범위 이름 변경'});
 f.workflow.scopePreset({action:'delete',id:preset.scopePresetId});
 assert.deepEqual(f.workflow.scopeSettings().scope,scope);assert.equal(f.workflow.scopeSettings().scopePresetId,'');
 assert.deepEqual(f.store.get(before.id),before);assert.deepEqual(f.workflow.rules.snapshot().modules,rules.modules);
});

test('authorized automatic completion archives source issues and includes only successfully checked items',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});
 f.store.updateProblem(f.base.projectId,f.base.problemId,p=>p.recognition.uncertainties=[{kind:'reading',text:'인쇄 확인',location}]);
 f.bridge.run=async()=>({result:{reply:'풀이',answer:'2',solution:'본문으로 확인했습니다.',questionType:'single_value',validation:validation(),holdReason:'',recognitionCorrection:null,correctionEvidence:[],notes:['의도상 답에 영향 없음']}});
 await f.workflow.run({...f.base,task:'solve',autoRecover:true,automaticPipeline:true,automaticFinalize:true});
 let p=f.problem();assert.equal(p.recognition.confirmed,true);assert.equal(p.recognition.uncertainties.length,0);assert.equal(p.recognition.resolvedUncertainties.length,1);assert.equal(p.original.approval.method,'automatic_user_authorized');assert.equal(p.original.include,true);assert.match(p.original.solution,/인쇄 확인/);assert.equal(p.original.grading,null);
 const old=p.original.solution;f.workflow.finalizeAutomatic(f.base);assert.equal(f.problem().original.solution,old);
 f.store.updateProblem(f.base.projectId,f.base.problemId,p=>{p.original.include=false;p.original.approval={status:'pending'};p.original.checks.program.errors=['실제 오류'];});f.workflow.finalizeAutomatic(f.base);assert.equal(f.problem().original.include,false);
});
test('six-point validation failure keeps useful solution but never automatically approves it',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});const v=validation();v.rubric.steps[0].points=3;
 f.bridge.run=async()=>({result:{reply:'풀이',answer:'2',solution:'풀이 보존',questionType:'written_response',validation:v,holdReason:'',recognitionCorrection:null,correctionEvidence:[],notes:[]}});
 await f.workflow.run({...f.base,task:'solve',autoRecover:true,automaticPipeline:true,automaticFinalize:true});const p=f.problem();assert.match(p.original.solution,/풀이 보존/);assert.equal(p.original.include,false);assert.ok(p.original.checks.program.errors.some(s=>s.includes('6점')));
});

test('automatic completion never approves stale scope or rule review results',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 f.bridge.run=async()=>({result:{reply:'풀이',answer:'2',solution:'현재 범위 풀이',questionType:'single_value',validation:validation(),holdReason:''}});
 await f.workflow.run({...f.base,task:'solve'});const scope=structuredClone(DEFAULT_SCOPE);scope.units=['다른 단원'];f.workflow.saveScope(f.base.projectId,scope);
 f.workflow.finalizeAutomatic(f.base);assert.equal(f.problem().original.include,false);assert.equal(f.problem().original.approval.status,'pending');
});

test('short answers and objective questions do not require six-point rubrics',()=>{
 for(const type of ['single_value','all_solutions','single_choice','other']){
  const i=item();i.questionType=type;i.validation.rubric=null;if(type==='single_choice'){i.question.choices=['1','2'];i.validation.correctChoiceIndices=[1];}
  const report=programCheck(i,DEFAULT_SCOPE,{requireRubric:true});assert.ok(!report.program.errors.some(e=>e.includes('6점')));assert.ok(!report.program.executed.includes('rubric-six-point-total'));
 }
 for(const type of ['proof','written_response']){const i=item();i.questionType=type;i.validation.rubric=null;assert.ok(programCheck(i,DEFAULT_SCOPE,{requireRubric:true}).program.errors.some(e=>e.includes('6점')));}
});
test('question-only consent preserves held solution and expires after content or source changes',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});const p=f.problem();f.store.updateProblem(f.base.projectId,p.id,p=>{p.original.solutionDraft={holdReason:'자료 필요',solution:'보류'};p.original.checks={ai:{status:'failed'}};});
 f.workflow.includeWithoutSolution({...f.base,questionId:p.original.id});let next=f.workflow.decorate(f.store.get(f.base.projectId)).problems[0];assert.equal(next.original.include,true);assert.equal(next.original.approval.method,'user_question_only');assert.equal(next.original.solutionDraft.solution,'보류');assert.equal(next.original.checks.ai.status,'failed');assert.equal(next.recognition.confirmed,false);
 const {questionOnlyCurrent}=require('../app/source-materials.cjs');assert.equal(questionOnlyCurrent(next.original,next),true);next.cropPaths.push('other.png');assert.equal(questionOnlyCurrent(next.original,next),false);
 f.workflow.approve(f.base.projectId,p.id,p.original.id,false);assert.equal(f.workflow.decorate(f.store.get(f.base.projectId)).problems[0].original.include,false);
});
test('partial source notes are forwarded; other issues remain explicitly ignored, not resolved',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.store.updateProblem(f.base.projectId,f.base.problemId,p=>p.recognition.uncertainties=[{text:'첫 확인',kind:'reading',location},{text:'둘째 확인',kind:'reading',location}]);
 f.workflow.resolveSourceIssues({...f.base,sourceVersion:f.problem().recognition.version,resolutions:[{index:0,note:'각 B는 30도이며 본문 조건을 우선 적용'}]});const r=f.problem().recognition;
 f.workflow.ignoreSourceIssues({...f.base,sourceVersion:r.version,keys:r.uncertainties.map(require('../app/review-issues.js').issueKey)});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 const next=f.problem().recognition;assert.equal(next.resolvedUncertainties.length,1);assert.equal(next.ignoredUncertainties.length,1);assert.equal(next.uncertainties.length,0);
 const preview=f.workflow.preview({...f.base,task:'solve'});assert.match(preview.inputText||JSON.stringify(preview),/각 B는 30도/);assert.match(JSON.stringify(preview),/userInstructions/);
});
test('process materials stay separate and are supplied with images for later solution requests',async t=>{
 const f=fixture(t),r=recognition();r.materials=[{label:'방법 1',text:'정사각형 종이를 접는다.',regionIndex:0,bounds:{x:0,y:0,width:1,height:.4}}];
 f.bridge.run=async()=>({result:{reply:'인식',recognition:r}});await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
 const plan=f.workflow.prepare({...f.base,task:'solve'});assert.equal(plan.images.length,1);assert.match(plan.inputText,/방법 1/);assert.deepEqual(f.problem().recognition.observedDiagram.points,r.observedDiagram.points);
});
test('optional grading default upgrade preserves prior approvals; arbitrary user rule changes still invalidate',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);await f.workflow.run({...f.base,task:'generation'});const id=f.problem().variants[0].id;f.workflow.approve(f.base.projectId,f.base.problemId,id,true);
 f.store.updateProblem(f.base.projectId,f.base.problemId,p=>{const q=p.variants[0];for(const m of q.reviewBaseline.modules)if(m.id==='solution.guidance')m.version='1-de19aad2a3c9';});
 assert.equal(f.workflow.decorate(f.store.get(f.base.projectId)).problems[0].variants[0].approval.status,'approved');
 f.workflow.rules.save('solution.guidance','사용자 규칙 변경');assert.equal(f.workflow.decorate(f.store.get(f.base.projectId)).problems[0].variants[0].approval.status,'pending');
});

 test('generation inherits figure position and explicit layout instructions override it',async t=>{
  const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);
  const original=f.store.get(f.base.projectId).problems[0].original;
  f.workflow.setPresentation({...f.base,targetIds:[original.id],diagramPosition:'before'});
  await f.workflow.run({...f.base,task:'generation'});
  assert.equal(f.store.get(f.base.projectId).problems[0].variants[0].diagramPosition,'before');
  await f.workflow.run({...f.base,task:'generation',text:'수치를 바꾸고 그림을 문제 아래로 배치해줘'});
  const p=f.store.get(f.base.projectId).problems[0];assert.equal(p.variants[1].diagramPosition,'after');assert.equal(p.original.diagramPosition,'before');
 });

test('batch approval survives drawing-only retries and unused rules but expires on relevant rules',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);await f.workflow.run({...f.base,task:'generation',automaticFinalize:true,batchIncludeWarnings:true});
 let q=f.workflow.decorate(f.store.get(f.base.projectId)).problems[0].variants[0];assert.equal(q.approval.status,'approved');assert.equal(q.batchOutputConsent.version,2);
 const mods=f.workflow.rules.snapshot().modules,unused=mods.find(m=>m.id.includes('integer')&&m.id.endsWith('math')),used=mods.find(m=>m.id.includes('geometry')&&m.id.endsWith('math'));
 assert.ok(!q.provenance.modules.some(m=>m.id===unused.id));f.workflow.saveRule({id:unused.id,content:unused.content+'\n추가 정수 기준'});q=f.workflow.decorate(f.store.get(f.base.projectId)).problems[0].variants[0];assert.equal(q.approval.status,'approved');
 const d=recognition().observedDiagram;d.points[0].x=-2;f.bridge.run=async()=>({result:{reply:'배치만 수정',observedDiagram:d,uncertainties:[]}});
 await f.workflow.run({...f.base,task:'recognition',recognitionTarget:'diagram',force:true,acceptReplacement:true});q=f.workflow.decorate(f.store.get(f.base.projectId)).problems[0].variants[0];assert.equal(q.approval.status,'approved');assert.equal(q.needsReview,false);
 f.workflow.saveRule({id:used.id,content:used.content+'\n추가 기하 기준'});q=f.workflow.decorate(f.store.get(f.base.projectId)).problems[0].variants[0];assert.equal(q.approval.status,'pending');
});
test('rule save reports corrupt projects separately and continues refreshing healthy projects',t=>{
 const f=fixture(t),broken=path.join(f.store.projectsDir,'broken');fs.mkdirSync(broken);fs.writeFileSync(path.join(broken,'project.json'),'broken');
 const m=f.workflow.rules.snapshot().modules.find(m=>m.id==='production.common'),result=f.workflow.saveRule({id:m.id,content:m.content+'\n추가 기준'});
 assert.equal(result.refresh.failures.length,1);assert.equal(result.refresh.failures[0].projectId,'broken');assert.ok(result.refresh.updated>=1);assert.match(f.workflow.rules.snapshot().modules.find(x=>x.id===m.id).content,/추가 기준/);assert.equal(fs.readFileSync(path.join(broken,'project.json'),'utf8'),'broken');
});

test('legacy batch consent migrates before an unrelated rule changes',async t=>{
 const f=fixture(t);await f.workflow.run({...f.base,task:'recognition'});f.workflow.confirmSource(f.base.projectId,f.base.problemId);await f.workflow.run({...f.base,task:'generation',automaticFinalize:true,batchIncludeWarnings:true});
 f.store.updateProblem(f.base.projectId,f.base.problemId,(p,project)=>{const q=p.variants[0];q.batchOutputConsent={at:'legacy',basis:hash({question:require('../app/workflow.cjs').content(q),observedDiagram:q.observedDiagram,version:q.version,sourceVersion:p.recognition.version,sourceStale:p.recognition.sourceStale||false,rulesStale:p.recognition.rulesStale||false,regions:p.regions,crops:p.cropPaths,scope:project.scope||DEFAULT_SCOPE,modules:f.workflow.rules.snapshot().modules.map(m=>({id:m.id,version:m.version}))})};});
 const m=f.workflow.rules.snapshot().modules.find(m=>m.id.includes('integer')&&m.id.endsWith('math'));f.workflow.saveRule({id:m.id,content:m.content+'\nunused rule edit'});
 const q=f.workflow.decorate(f.store.get(f.base.projectId)).problems[0].variants[0];assert.equal(q.approval.status,'approved');assert.equal(q.batchOutputConsent.version,2);
});
