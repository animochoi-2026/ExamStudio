'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../app/bank-question-types.cjs'),P=require('../app/bank-type-backfill.cjs'),M=require('../app/bank-model.cjs');
const row=(body,extra={})=>({content:{body,choices:[],answer:'保存',solution:'기존 풀이'},metadata:{classification:{types:[],solutions:[]},difficulty:{aiScore:'4.2'},source:{school:'기존 출처'}},confirmed:{},...extra});
test('type follows the demanded task, not triangle names, units, response formats, methods or supplied quantities',()=>{
 const cases=[
  ['삼각형의 넓이는 10이고 한 변의 길이는?', 'task.length'],
  ['이등변삼각형의 두 각의 비가 2:1일 때, 넓이는?', 'task.area'],
  ['삼각형의 각의 크기는?', 'task.angle'],
  ['이등변삼각형이 되기 위한 $x$의 값은?', 'task.expression'],
  ['마름모의 변의 중점을 연결한 사각형은 어떤 사각형인지 쓰고 그 이유를 쓰시오.', 'task.shape'],
  ['□$WXYZ$가 직사각형이 되는 것은?', 'task.condition'],
  ['사각형의 성질 중 옳지 않은 것은?', 'task.property'],
  ['그림에서 찾을 수 있는 정사각형의 총 개수는?', 'task.count'],
  ['다음은 두 직각삼각형이 합동임을 보이는 과정이다. ㉠~㉤에 들어갈 내용으로 옳은 것은?', 'task.proof_fill'],
  ['다음 증명하는 과정의 (가)에 들어갈 식은?', 'task.proof_fill'],
  ['서로 합동임을 증명하시오.', 'task.proof'],
  ['두 길이의 비는?', 'task.ratio']
 ];
 for(const [body,id] of cases){const r=T.infer(row(body));assert.equal(r.types[0]?.id,id,body);assert.ok(body.includes(r.types[0].evidence));}
 const ambiguous=row('삼각형에서 길이는 10, 넓이는 30이다.');ambiguous.metadata.classification.primaryUnit={name:'삼각형의 성질'};ambiguous.metadata.content={responseType:'선택형'};ambiguous.metadata.classification.solutions=[{label:'합동'}];assert.equal(T.infer(ambiguous).status,'unresolved');
 assert.equal(T.infer(row('원의 넓이는?'),[{id:'local',label:'기존 증명 유형'}]).status,'unresolved','existing shared taxonomy must not be replaced by fallback categories');
});
test('manual types survive recommendations and unit edits; multiple types have one stable primary key',async()=>{
 const c=row('넓이는?');c.metadata.classification.types=[{id:'task.area',name:'넓이 계산'},{id:'task.angle',name:'각도 계산'}];assert.equal(T.primaryKey(c),'task.area');
 c.confirmed={type:'각도 계산'};assert.equal(T.primaryKey(c),'task.angle');assert.equal(T.effective(c).length,1);assert.equal(T.infer(c).status,'preserved');
 const edited=M.patchMetadata(c.metadata,{type:'길이 계산',primaryUnit:'기존 단원'}),again=M.patchMetadata(edited,{primaryUnit:'다른 단원'});assert.equal(T.primaryKey({metadata:again}),'task.length');
 const {sourceInfo}=await import('../web-bank/presentation.js');const src=sourceInfo({...c,confirmed:{}});assert.equal(src.type,'넓이 계산');assert.equal(src.types.length,2);assert.equal(src.typeStatus,'suggested');assert.equal(sourceInfo(c).typeStatus,'confirmed');
});
test('fresh metadata schema requires bounded type fields, valid catalog IDs and literal demand evidence',()=>{
 const {checked,schema}=require('../app/bank-analysis.cjs'),base={originalNumber:null,primaryUnitId:null,relatedUnitIds:[],conditionUnitIds:[],solutions:[],score:null,reason:'기존 풀이 없음',types:[{id:'task.area',evidence:'넓이는?'}],typeReason:'요구한 넓이'};
 assert.ok(schema.required.includes('types'));assert.equal(checked(base,false,T.catalog(),{body:'넓이는?',choices:[]}).types[0].name,'넓이 계산');
 assert.throws(()=>checked({...base,types:[{id:'task.unknown',evidence:'넓이는?'}]},false),/존재하지 않는 출제유형/);
 assert.throws(()=>checked(base,false,T.catalog(),{body:'길이는?',choices:[]}),/실제 문구/);
 assert.throws(()=>checked({...base,typeReason:''},false),/추천 이유/);
 assert.throws(()=>checked({...base,types:[base.types[0],base.types[0]]},false),/중복/);
});
test('type-only plans select current missing heads, preserve other data and detect independent concurrent edits',()=>{
 const current={...row('넓이는?'),question_id:'q',revision_id:'r'},versions=[{id:'old',question_id:'q',committed:true},{id:'r',question_id:'q',parent_id:'old',committed:true,review_version:1}];
 const plan=P.plan([current],versions);assert.equal(plan.items.length,1);assert.equal(plan.aiRequestsMax,0);const i=plan.items[0];P.checkCurrent(i,current,versions[1]);
 for(const key of ['metadata','content','confirmed','files']){const changed=structuredClone(current);if(key==='files')changed.files=[{sha256:'changed'}];else changed[key]={...changed[key],other:'concurrent'};assert.throws(()=>P.checkCurrent(i,changed,versions[1]),/수정 충돌/);}
 const after=T.apply(current.metadata,i.recommendation);P.assertPreserved(current.metadata,after);assert.deepEqual(after.difficulty,current.metadata.difficulty);assert.deepEqual(after.source,current.metadata.source);assert.ok(after.classification.typeRecommendation.inputFingerprint);
 const bad=structuredClone(after);bad.difficulty.aiScore='9.0';assert.throws(()=>P.assertPreserved(current.metadata,bad),/외 메타데이터/);
 assert.equal(P.plan([{...current,metadata:after}],versions).items.length,0);assert.throws(()=>P.plan([current],[...versions,{id:'other-head',question_id:'q',parent_id:'old',committed:true}]),/현재 버전 충돌/);
});
test('same unit calculations remain distinct when saved core tasks differ; equivalent concept wording shares a key',()=>{
 const a=row('넓이는?');a.metadata.classification.primaryUnit={id:'m2-7.8',name:'평행선과 넓이'};a.metadata.classification.solutions=[{concepts:['두 삼각형의 넓이 합은 평행사변형 넓이의 절반이다']}];
 const b=structuredClone(a);b.metadata.classification.solutions=[{concepts:['같은 높이의 삼각형의 넓이의 비']}];
 const apply=r=>({...r,metadata:T.apply(r.metadata,T.infer(r))});const aa=apply(a),bb=apply(b);assert.equal(aa.metadata.classification.types[0].id,bb.metadata.classification.types[0].id);assert.notEqual(T.primaryKey(aa),T.primaryKey(bb));
 const equivalent=structuredClone(a);equivalent.metadata.classification.solutions=[{concepts:['도형을 분할한 넓이 합을 구한다']}];assert.equal(T.primaryKey(aa),T.primaryKey(apply(equivalent)));
 const manual={...aa,confirmed:{type:'넓이 계산'}};assert.equal(T.primaryKey(manual),T.primaryKey(aa));
 const {selectQuestions}=require('../app/bank-exam-model.cjs'),C=require('../app/curriculum.js');const candidates=[aa,bb].map((r,i)=>({...r,question_id:'q'+i,visibility:'approved',owner_email:'owner',confirmed:{scopeEvidence:{taxonomyVersion:C.version,status:'confirmed',conditionUnitIds:[],solutions:[{verified:true,complete:true,unitIds:['m2-7.8'],dependencyUnitIds:[]}]}}}));const picked=selectQuestions(candidates,{count:2,units:['m2-7.8'],avoidSameType:true});assert.equal(picked.items.length,2,JSON.stringify(picked.reasons));assert.equal(selectQuestions([candidates[0],{...candidates[0],question_id:'same-core'}],{count:2,units:['m2-7.8'],avoidSameType:true}).diversity.repeated,1);
});
test('older completed metadata cache repairs types with zero provider calls; fresh metadata uses the existing single request',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{BankAnalysis}=require('../app/bank-analysis.cjs');const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bank-type-cache-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const q={id:'q',kind:'original',body:'넓이는?',choices:[],answer:'2',solution:'기존 확정 풀이',approval:{status:'approved'}},p={id:'p',original:q,variants:[],regions:[]},project={id:'project',scope:{},problems:[p]},metadata=M.metadata(q,p,project),item={id:'i',metadata,overrides:{}},bank={auth:{},storage:{},state:{items:{i:item}},catalog(){},ensure(){return item;},save(){}},store={dataDir:directory,get:()=>project};
 let calls=0;const analyzer=new BankAnalysis({store,getModules:()=>[],getSettings:()=>({model:'mock'}),getBridge:()=>({run:async req=>{calls++;assert.ok(JSON.parse(req.text).questionTypes.some(t=>t.id==='task.area'));assert.ok(req.execution.schema.required.includes('types'));return {result:{originalNumber:null,primaryUnitId:null,relatedUnitIds:[],conditionUnitIds:[],solutions:[],score:'4.7',assessment:require('./fixtures/access-assessment.cjs').accessAssessment('S1','R1'),reason:'기존 풀이 기준',types:[{id:'task.area',evidence:'넓이는?'}],typeReason:'넓이 요구'}};}})});
 const args={projectId:'project',questionIds:['q']};{const outcome=await analyzer.run(bank,args);assert.equal(outcome.analyzed,1,JSON.stringify(outcome));};assert.equal(calls,1);assert.equal(metadata.classification.types[0].id,'task.area');const analysis=structuredClone(metadata.analysis),difficulty=structuredClone(metadata.difficulty);metadata.classification.types=[];assert.equal((await analyzer.run(bank,args)).reused,1);assert.equal(calls,1);assert.equal(metadata.classification.types[0].id,'task.area');assert.deepEqual(metadata.analysis,analysis);assert.deepEqual(metadata.difficulty,difficulty);
});
