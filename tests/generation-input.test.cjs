'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {diagramFeatures,generationSchema,existingQuestions,OPTIONAL_FEATURES}=require('../app/generation-input.cjs');
const {compose,definitions}=require('../app/rules.cjs');
const {schemas,check}=require('../app/task-schemas.cjs');
const {recognition,item}=require('./workflow-fixtures.cjs');
const {Workflow}=require('../app/workflow.cjs'),{ProjectStore}=require('../app/store.cjs');
const problem=()=>({recognition:{...recognition(),confirmed:true},variants:[],regions:[]});
function featurePlan(p=problem(),request={},variant='numeric_only',modules=[]){return diagramFeatures({problem:p,request,variant,modules});}
test('irrelevant diagram explanations shrink without removing structural capabilities or validation/solution',()=>{
 const features=featurePlan(),schema=generationSchema(schemas.generation,features);
 assert.ok(!features.includes('shadedRegions'));assert.ok(JSON.stringify(schema).length<JSON.stringify(schemas.generation).length);
 const strip=x=>Array.isArray(x)?x.map(strip):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>k!=='description').map(([k,v])=>[k,strip(v)])):x;
 assert.deepEqual(strip(schema),strip(schemas.generation));
 assert.deepEqual(schema.properties.items.items.properties.validation,schemas.generation.properties.items.items.properties.validation);
 assert.deepEqual(schema.properties.items.items.properties.question.properties.solution,schemas.generation.properties.items.items.properties.question.properties.solution);
 const result={reply:'완료',items:[item()],holdReason:''};check('generation',result,schema);assert.throws(()=>check('generation',{...result,items:[{...item(),validation:null}]},schema));
 const modules=Object.values(definitions),full=compose({task:'generation',domains:['geometry'],variant:'numeric_only',modules}),selected=compose({task:'generation',domains:['geometry'],variant:'numeric_only',modules,diagramFeatures:features});
 assert.ok(selected.instructions.length<full.instructions.length);assert.doesNotMatch(selected.instructions,/색칠된 영역은 shadedRegions/);assert.deepEqual(selected.modules,full.modules);
 // Recognition is deliberately unaffected by generation-only feature selection.
 assert.equal(compose({task:'recognition',domains:['geometry'],modules,diagramFeatures:[]}).instructions,compose({task:'recognition',domains:['geometry'],modules}).instructions);
});
test('observed marks and body-only features keep their detailed instructions',()=>{
 for(const key of OPTIONAL_FEATURES){const p=problem();p.recognition.observedDiagram[key]=[{}];assert.ok(featurePlan(p).includes(key));}
 const p=problem();p.recognition.body='음영이 칠해진 도형, 각의 이등분선, 직선 l, 같은 길이의 변, 전체 길이 점선과 각도 안내선';
 assert.deepEqual(featurePlan(p),OPTIONAL_FEATURES);
 const full=generationSchema(schemas.generation,featurePlan(p));assert.deepEqual(full,schemas.generation);
});
test('uncertainty, open-ended requests, harder variants and custom rules keep the full contract',()=>{
 for(const mutate of [p=>p.recognition.confirmed=false,p=>p.recognition.uncertainties=[{text:'표식 확인'}],p=>p.recognition.ignoredUncertainties=[{}],p=>p.recognition.resolvedUncertainties=[{}],p=>p.recognition.materials=[{}],p=>p.recognition.observedDiagram=null]){const p=problem();mutate(p);assert.equal(featurePlan(p),null);}
 for(const request of [{text:'원을 추가해줘'},{requestKind:'suggestion',additionalInstructions:'색칠해줘'},{difficultyStep:1},{regenerateOf:'x'}])assert.equal(featurePlan(problem(),request),null);
 assert.equal(featurePlan(problem(),{},'alternative_property'),null);
 assert.equal(featurePlan(problem(),{},'numeric_only',[{tasks:['generation'],userContent:'별도 도형',content:'별도 도형',defaultContent:'기본'}]),null);
 assert.ok(featurePlan(problem(),{},'numeric_only',[{id:'validation.common',tasks:['generation'],userContent:'색칠 검수',content:'색칠 검수',defaultContent:'기본'}]).includes('shadedRegions'));
 assert.equal(generationSchema(schemas.generation,null),schemas.generation);
});
function decode(summary,sourceBody){return summary.format==='bodies'?summary.items:summary.items.flatMap(g=>g.questions.map(q=>{let i=0;const template=g.templateFrom?sourceBody.replace(/\d+(?:\.\d+)?/g,()=>`⟦${++i}⟧`):g.template;return{id:q.id,index:q.index,body:template.replace(/⟦(\d+)⟧/g,(_,n)=>q.values[Number(n)-1])};})).sort((a,b)=>a.index-b.index).map(({index,...q})=>q);}
test('numeric templates preserve every number, sign, fraction, inequality and quantifier without resending full bodies',()=>{
 const source='서로 다른 정수 x와 y에 대해 $-13/2 < x \\le 25.5$이고 $y^2=4$이다. 적어도 하나이며 정확히 두 개를 고르시오. '.repeat(4);
 const qs=Array.from({length:12},(_,i)=>({id:String(i),body:source.replaceAll('25.5',String(i+30.5))}));
 const frozen=JSON.stringify(qs),summary=existingQuestions(qs,source);
 assert.equal(summary.format,'numeric_templates');assert.equal(summary.items[0].templateFrom,'source.body');assert.deepEqual(decode(summary,source),qs);assert.equal(JSON.stringify(qs),frozen);
 assert.ok(JSON.stringify(summary).length<JSON.stringify(qs).length/2);
 qs.push({id:'distinct',body:'해가 없는 것을 모두 고르시오. 경계값 0은 제외한다.'});assert.deepEqual(decode(existingQuestions(qs,source),source),qs);
});
test('small collections and ambiguous literal placeholders remain exact; different conditions never merge',()=>{
 const small=[{id:'1',body:'x=1'},{id:'2',body:'x>2'}];assert.deepEqual(existingQuestions(small),{format:'bodies',items:small});
 const marker=[{id:'1',body:'문자 ⟦1⟧과 2'}];assert.equal(existingQuestions(marker).format,'bodies');
 const qs=Array.from({length:10},(_,i)=>({id:String(i),body:('조건에서 적어도 '+i+'개를 구하시오. ').repeat(20)}));qs.push({id:'other',body:qs[0].body.replaceAll('적어도','많아야')});
 const summary=existingQuestions(qs);assert.equal(summary.items.length,2);assert.deepEqual(decode(summary),qs);
});
test('actual preview and both provider calls use reduced generation input; stored sources/results remain complete',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'exam-generation-input-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const source=path.join(directory,'source.png'),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6NZYAAAAASUVORK5CYII=','base64');fs.writeFileSync(source,png);
 const store=new ProjectStore(directory);let project=store.create(source);project=store.addRegion({projectId:project.id,region:{page:1,x:0,y:0,width:1,height:1},imageDataUrl:'data:image/png;base64,'+png.toString('base64')});
 const calls=[],bridge={run:async req=>{calls.push(req);return{result:req.execution.task==='recognition'?{reply:'인식',recognition:recognition()}:{reply:'생성',items:[item()],holdReason:''},tokens:null};}};
 const workflow=new Workflow({store,directory,getBridge:()=>bridge,getSettings:()=>({model:'test',effort:'medium'})}),base={projectId:project.id,problemId:project.problems[0].id};
 await workflow.run({...base,task:'recognition'});workflow.confirmSource(base.projectId,base.problemId);
 store.updateProblem(base.projectId,base.problemId,p=>{p.variants=Array.from({length:10},(_,i)=>({...item().question,id:'old-'+i,body:('원문의 조건을 유지하면서 수치 '+(i+2)+'를 이용하여 답을 구하시오. ').repeat(12)}));});
 const before=store.get(base.projectId).problems[0];
 for(const provider of ['codex','gemini']){
  const request={...base,task:'generation',variant:'numeric_only',requestKind:'suggestion',provider},preview=workflow.preview(request);
  assert.equal(preview.generationInput.diagramGuidance,'selected');assert.equal(preview.generationInput.existingQuestionFormat,'numeric_templates');
  const result=await workflow.run(request),actual=calls.at(-1);
  assert.equal(actual.text,preview.inputText);assert.equal(actual.execution.instructions,preview.instructions);assert.deepEqual(actual.execution.schema,preview.schema);assert.equal(result.run.aiCalls,1);
  assert.ok(actual.execution.instructions.includes('validation.common'));assert.equal(actual.images.length,0);
 }
 const after=store.get(base.projectId).problems[0];assert.deepEqual(after.recognition,before.recognition);assert.deepEqual(after.variants.slice(0,10),before.variants);assert.equal(after.variants.length,12);assert.ok(after.variants.at(-1).solution);
});
