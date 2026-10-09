const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Workflow}=require('../app/workflow.cjs'),{ProjectStore}=require('../app/store.cjs');
const {compose,definitions,hash}=require('../app/rules.cjs');
const {recognition,validation,location}=require('./workflow-fixtures.cjs');
const {schemas,recoverySchema}=require('../app/task-schemas.cjs');
const modules=Object.values(definitions);
function setup(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'exam-efficient-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6NZYAAAAASUVORK5CYII=','base64'),source=path.join(directory,'source.png');fs.writeFileSync(source,png);
 const store=new ProjectStore(directory);let project=store.create(source);project=store.addRegion({projectId:project.id,region:{page:1,x:0,y:0,width:1,height:1},imageDataUrl:'data:image/png;base64,'+png.toString('base64')});
 const calls=[],bridge={run:async request=>{calls.push(request);let result;
  if(request.execution.task==='recognition')result={reply:'인식',recognition:recognition()};
  else{result={reply:'풀이 완료',answer:'2',solution:'조건을 식으로 나타내면 $x+1=3$입니다. 양변에서 1을 빼면 $x=2$입니다. 두 변에서 같은 수를 빼도 등식이 유지됩니다.',questionType:'single_value',validation:validation(),holdReason:''};if(request.execution.schema.properties.recognitionCorrection)Object.assign(result,{recognitionCorrection:null,correctionEvidence:[],notes:[]});}
  return{result,tokens:null};
 }};
 const workflow=new Workflow({store,directory,getBridge:()=>bridge,getSettings:()=>({model:'gpt-6-astra',effort:'medium'})});
 const base={projectId:project.id,problemId:project.problems[0].id,provider:'codex'};
 const automatic={...base,task:'solve',autoRecover:true,recoveryWhenNeeded:true,automaticPipeline:true,automaticFinalize:true,force:true};
 return{directory,store,workflow,calls,bridge,base,automatic,problem:()=>store.get(project.id).problems[0]};
}
test('clean automatic source uses one ordinary solve, keeps exact recognition and finalizes output',async t=>{
 const f=setup(t);await f.workflow.run({...f.base,task:'recognition'});const before=structuredClone(f.problem().recognition);
 const preview=f.workflow.preview(f.automatic);assert.equal(preview.sourceReadMode,'saved_recognition');assert.equal(preview.imageCount,0);assert.deepEqual(preview.schema,schemas.solve);assert.ok(!preview.modules.some(m=>m.id.includes('recognition')));
 assert.doesNotMatch(preview.instructions,/각도 숫자·각도 문자는 도형 겹침|색칠된 영역은 shadedRegions/);
 const result=await f.workflow.run(f.automatic);assert.equal(f.calls.length,2);assert.equal(f.calls[1].execution.instructions,preview.instructions);assert.equal(f.calls[1].text,preview.inputText);
 const p=f.problem();for(const key of ['body','conditions','marks','observedDiagram','version'])assert.deepEqual(p.recognition[key],before[key]);
 assert.equal(p.recognition.confirmationMethod,'automatic_user_authorized');assert.equal(p.original.include,true);assert.equal(p.original.approval.status,'approved');assert.match(p.original.solution,/등식이 유지/);assert.equal(p.original.checks.ai.crossCheck,'2+1=3');assert.equal(result.run.aiCalls,1);
 // A retry re-evaluates the route rather than treating the recorded effective autoRecover=false as permission to skip errors.
 f.store.updateProblem(f.base.projectId,f.base.problemId,p=>{p.recognition.uncertainties=[{kind:'reading',text:'각도 확인',location}];});
 const retry=f.workflow.preview({...f.base,...preview.requestOptions});assert.equal(retry.sourceReadMode,'image_recovery');assert.equal(retry.imageCount,1);
});
test('uncertain, changed or previously failed sources retain recovery; explicit recovery always retains it',async t=>{
 const f=setup(t);await f.workflow.run({...f.base,task:'recognition'});const original=structuredClone(f.problem());
 const cases=[p=>p.recognition.uncertainties.push({kind:'reading',text:'확인',location}),p=>p.recognition.sourceStale=true,p=>p.original.solutionDraft={holdReason:'조건 부족'},p=>p.original.checks={ai:{status:'failed'}},p=>p.original.checks={program:{errors:['도형 오류']}}];
 for(const mutate of cases){f.store.updateProblem(f.base.projectId,f.base.problemId,p=>{Object.assign(p,structuredClone(original));mutate(p);});const plan=f.workflow.preview(f.automatic);assert.equal(plan.sourceReadMode,'image_recovery');assert.deepEqual(plan.schema,recoverySchema);assert.equal(plan.imageCount,1);assert.ok(plan.modules.some(m=>m.id==='recognition.common'));assert.match(plan.instructions,/색칠된 영역은 shadedRegions/);}
 f.store.updateProblem(f.base.projectId,f.base.problemId,p=>Object.assign(p,structuredClone(original)));
 const explicit=f.workflow.preview({...f.base,task:'solve',autoRecover:true});assert.equal(explicit.sourceReadMode,'image_recovery');
 assert.throws(()=>f.workflow.preview({...f.base,task:'solve'}),/원문 판독을 확인/);
 f.workflow.rules.save('recognition.common','사용자가 수정한 인식 규칙');assert.equal(f.workflow.preview(f.automatic).sourceReadMode,'image_recovery');
});
test('shared material images stay available in ordinary automatic solving',async t=>{
 const f=setup(t);await f.workflow.run({...f.base,task:'recognition'});f.store.updateProblem(f.base.projectId,f.base.problemId,p=>{p.recognition.materials=[{label:'방법 1',text:'종이 접기 순서',regionIndex:0,bounds:null}];});
 const plan=f.workflow.preview(f.automatic);assert.equal(plan.sourceReadMode,'saved_recognition');assert.equal(plan.imageCount,1);assert.match(plan.inputText,/종이 접기 순서/);assert.deepEqual(plan.schema,schemas.solve);
});
test('placement contracts are omitted only for solve/review; math, detailed explanation, cross-check and custom rules remain',()=>{
 for(const task of ['solve','validation']){const c=compose({task,domains:['geometry'],modules});assert.doesNotMatch(c.instructions,/색칠된 영역은 shadedRegions|각도 숫자·각도 문자는 도형 겹침/);assert.ok(c.modules.some(m=>m.id==='validation.common'));assert.ok(c.modules.some(m=>m.id==='domains.geometry.math'));assert.match(c.instructions,/독립 검산과 유일성·해의 완전성 검토를 생략하지/);assert.match(c.instructions,/실제 확인한 수치·식과 결과/);}
 for(const task of ['recognition','generation','revision'])assert.match(compose({task,domains:['geometry'],modules}).instructions,/색칠된 영역은 shadedRegions/);
 for(const task of ['solve','generation','revision'])assert.ok(compose({task,domains:['geometry'],modules}).modules.some(m=>m.id==='solution.guidance'));
 const custom=modules.map(m=>m.id==='domains.geometry.math'?{...m,content:'사용자가 지정한 특별한 수학 규칙'}:m);
 assert.match(compose({task:'solve',domains:['geometry'],modules:custom}).instructions,/사용자가 지정한 특별한 수학 규칙/);assert.equal(hash(modules),hash(Object.values(definitions)));
});
test('failed math on lightweight solve stays unapproved without automatic extra AI requests',async t=>{
 const f=setup(t);await f.workflow.run({...f.base,task:'recognition'});
 f.bridge.run=async request=>{f.calls.push(request);return{result:{reply:'실제 조건 모순',answer:'',solution:'확인할 조건',questionType:'single_value',validation:{...validation(),status:'failed'},holdReason:'조건을 다시 확인하세요.'}};};
 await assert.rejects(f.workflow.run(f.automatic),/보류/);assert.equal(f.calls.length,2);assert.equal(f.problem().original.include,false);assert.ok(f.problem().original.solutionDraft);assert.equal(f.problem().recognition.confirmed,false);assert.equal(f.workflow.preview(f.automatic).sourceReadMode,'image_recovery');
});
