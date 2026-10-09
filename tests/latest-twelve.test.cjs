'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const D=require('../app/difficulty-assessment.cjs'),P=require('../app/difficulty-policy.cjs'),R=require('../app/difficulty-references.cjs'),F=require('../app/bank-search-filters.cjs'),M=require('../app/bank-exam-model.cjs'),C=require('../app/curriculum.js');
const make=(score,extra={})=>({question_id:extra.id||'q',revision_id:'rev-'+(extra.id||'q'),metadata:{source:{grade:'중2',school:'광희중',academicYear:2026,semester:'2학기'},difficulty:{aiScore:String(score),criteriaVersion:D.version,scope:{grade:'중2'}},classification:{primaryUnit:{id:'m2-8.1',name:'삼각형의 닮음'},types:[{id:'task.length',name:'길이 계산'}]}},content:{body:'선분의 길이를 구하시오.',solution:'대응변의 비를 사용한다.'},...extra});
test('one final numeric value, original AI/legacy band retained; reported examples are fixtures only',()=>{
 for(const [raw,teacher]of [[6.7,8.5],[6.8,8.5],[8.2,8]]){const c=make(raw);c.confirmed={difficulty:String(teacher),difficultyBand:'쉬움'};const before=JSON.stringify(c);assert.equal(D.effective(c).number,teacher);assert.equal(D.compositionBand(c),'high');assert.equal(JSON.stringify(c),before);assert.ok(D.effective(c).legacyBandConflict);}
 for(const [n,b]of [[0,'low'],[3.9,'middle'],[4,'middle'],[6.4,'middle'],[6.5,'middle'],[8,'high'],[10,'high']])assert.equal(D.compositionBand(make(n)),b);
 const c=make(4);c.metadata.difficulty={teacherBand:'어려움',assessmentStatus:'deferred'};assert.equal(D.effective(c).number,null);assert.equal(D.compositionBand(c),'unknown');assert.ok(D.effective(c).legacyBandConflict);
 const d=make(2);d.metadata.difficulty={assessmentStatus:'missing'};assert.deepEqual(M.difficultySummary([c,c,d]).counts,{low:0,middle:0,high:0,deferred:0,unknown:1});
});
test('access v2 never adds a proof bonus; explicit v5 provenance retains the historical rule',()=>{
 const c=make(8.2);c.content.body='두 삼각형이 합동임을 증명하시오.';
 const plan=P.adjustment(c,'8.2');assert.equal(plan.score,8.2);assert.equal(plan.delta,0);c.metadata.difficulty.proofAdjustment=plan;
 for(let i=0;i<3;i++)assert.equal(D.effective(c).number,8.2);assert.equal(c.metadata.difficulty.aiScore,'8.2');
 const old=structuredClone(c);old.metadata.difficulty.criteriaVersion='expected-10-v5-insight-references-scope-low1';old.metadata.difficulty.proofAdjustment=require('../app/difficulty-policy-legacy.cjs').adjustment(old,'8.2');assert.equal(D.effective(old).number,10);
 c.confirmed={difficulty:'8.0'};assert.equal(D.effective(c).number,8);
 assert.equal(P.adjustment({body:'계산 과정을 쓰시오.'},6).score,6);assert.equal(P.adjustment({body:'다음은 합동임을 보이는 과정이다. 빈칸에 들어갈 것은?'},6).score,6);
 assert.throws(()=>P.adjustment(c,11));assert.throws(()=>P.adjustment(c,'6.55'));assert.equal(P.adjustment(c,null).score,null);
});

test('metadata dropdowns are dynamic and exact, stale hidden search fields are stripped',()=>{
 const a=make(6.5),b=make(5,{id:'b'});b.metadata.source={grade:'중3',school:'광휘중',academicYear:2027,semester:'1학기'};
 const options=F.options([a,b]);assert.deepEqual(F.fields.map(x=>x[0]),['grade','school','academicYear','semester','unit','type']);assert.deepEqual(options.school,['광휘중','광희중'].sort((a,b)=>a.localeCompare(b,'ko',{numeric:true})));
 assert.equal(F.matches(a,{school:'광휘중'}),false);assert.equal(F.matches(a,{}),true);assert.equal(F.matches(a,{compositionBand:'middle'}),true);
 assert.deepEqual(F.clean({owner:'old',min:'8',max:'10',difficultyBand:'쉬움',compositionBand:'deferred',grade:'중3'}),{compositionBand:'unknown',grade:'중3'});
 a.updated_at='2026-01-01';b.updated_at='2026-02-01';assert.deepEqual(F.recentSchools([a,b,a]),['광휘중','광희중']);
});
test('similar teacher references exclude AI-only/unrelated/stale and obey byte upper-bound token budget',()=>{
 const target=make(5,{id:'target'}),rows=Array.from({length:20},(_,i)=>make(9,{id:'r'+i,confirmed:{difficulty:i%2?'9.5':'3.0'}}));rows[0].metadata.source.grade='중3';rows[1].confirmed={};rows[2].metadata.analysis={status:'stale'};rows[3].metadata.classification.types=[{id:'task.area'}];rows[4].content.solution='설명'.repeat(3000);
 const result=R.select(target,rows);assert.ok(result.length>0&&result.length<=3);assert.ok(Buffer.byteLength(JSON.stringify(result),'utf8')<=R.tokenBudget);assert.ok(!result.some(x=>['r0','r1','r2','r3'].includes(x.id)));assert.ok(result.every(x=>x.revision&&x.criteriaVersion===D.version));assert.equal(R.select({...target,metadata:{source:{grade:'중1'}}},rows).length,0);
 const changed=structuredClone(rows);changed.forEach(x=>{if(x.confirmed?.difficulty)x.confirmed.difficulty='2.0';});assert.deepEqual(R.select(target,changed).map(x=>x.id),result.map(x=>x.id),'selection never prefers high scores');
});
test('automatic order uses half-point intervals then measured figure/math-inclusive height, without mutating manual order',()=>{
 const items=[{questionId:'hard',scoreSnapshot:8,height:10},{questionId:'long',scoreSnapshot:4.1,height:500},{questionId:'short',scoreSnapshot:4.4,height:100},{questionId:'easy',scoreSnapshot:3.9,height:600}];const before=JSON.stringify(items);assert.deepEqual(M.sortMeasured(items).map(x=>x.questionId),['easy','short','long','hard']);assert.equal(JSON.stringify(items),before);
});
test('storage accounting keeps shared/pinned history and separates logical files from physical chunks',()=>{
 const {audit}=require('../app/storage-audit.cjs'),entries=[{id:'shared',kind:'file',verified:true,size:10,chunks:2,sha256:'same',props:{role:'asset'}},{id:'pinned',kind:'file',verified:true,size:10,chunks:1,sha256:'same',props:{role:'asset'}},{id:'pending',kind:'file',verified:false,size:2,chunks:1},{id:'orphan',kind:'file',verified:true,size:3,chunks:1}],catalog=[{revision_id:'new',files:[{id:'shared'}]},{revision_id:'old',files:[{id:'shared'},{id:'pinned'}]}];
 const r=audit({entries,catalog,current:[catalog[0]],exams:[{document:{items:[{revisionId:'old'}]}}]});assert.equal(r.logicalFiles,4);assert.equal(r.expectedChunks,5);assert.equal(r.physicalObjects,null);assert.equal(r.groups.pinnedHistory.files,1);assert.equal(r.groups.incompleteUpload.files,1);assert.equal(r.groups.unreferencedInSnapshot.files,1);assert.equal(r.sharedReferencedFiles,1);assert.equal(r.duplicateRepeatedBytes,10);assert.equal(r.deleteAuthorized,false);
});
test('local SQL final-number policy agrees with shared model; malformed AI never clamps to ten',async()=>{
 const server=await require('./shared-bank-local-server.cjs').localServer(),db=server.db;try{const proof=make(8.2);proof.content.body='합동임을 증명하시오.';proof.metadata.difficulty.proofAdjustment=P.adjustment(proof,8.2);
 for(const c of [make(6.5),make(11),make(5,{confirmed:{difficulty:'8.5',difficultyBand:'쉬움'}}),proof,make(4,{metadata:{difficulty:{teacherBand:'어려움'}}})]){const r=await db.query('select public.bank_difficulty_number($1,$2) n,public.bank_difficulty_band($1,$2) b',[c.metadata,c.confirmed||{}]);assert.equal(r.rows[0].n===null?null:Number(r.rows[0].n),D.effective(c).number);assert.equal(r.rows[0].b,D.effective(c).band);}
 }finally{await db.close();}
});
test('BankAnalysis v2 excludes teacher targets from the same request and reuses its valid cache',async()=>{
 const {BankAnalysis}=require('../app/bank-analysis.cjs'),unit=C.leaves.find(x=>x.title.includes('닮음')),target=make(5,{id:'target'});target.metadata.classification.primaryUnit={id:unit.id,name:unit.title};target.metadata.analysis={};target.metadata.difficulty.userScore=null;target.overrides={};
 const ref=structuredClone(target);ref.question_id='teacher';ref.revision_id='teacher-rev';ref.confirmed={difficulty:'7.5'};ref.content={body:'선분의 길이를 구하시오.',solution:'닮음비를 쓴다.'};
 const q={id:'q',kind:'original',body:'선분의 길이를 구하시오.',choices:[],answer:'3',solution:'닮음비를 쓴다.',approval:{status:'approved'}},project={scope:{grade:'중2'},problems:[{id:'p',original:q,variants:[],regions:[],cropPaths:[]}]};
 const store={get:()=>project},bank={state:{items:{}},auth:{config:()=>({spaceId:'s'})},save(){},catalog(){},ensure:()=>target,storage:{rpc:async()=>[ref],rows:async table=>table==='bank_taxonomy'?[]:[ref]}};let calls=0;
 const analyzer=new BankAnalysis({store,getSettings:()=>({model:'mock'}),getBridge:()=>({run:async req=>{calls++;const input=JSON.parse(req.text);assert.deepEqual(input.referenceQuestions,[]);assert.doesNotMatch(req.execution.instructions,/고정 \+2/);assert.match(req.execution.instructions,/기준 학생/);const assessment=require('./fixtures/access-assessment.cjs').accessAssessment('S2');return {result:{originalNumber:null,primaryUnitId:unit.id,relatedUnitIds:[],conditionUnitIds:[],solutions:[],score:null,reason:'mock',types:[],typeReason:'mock',assessment}};}})});
 assert.equal((await analyzer.run(bank,{projectId:'p',questionIds:['q']})).analyzed,1);assert.deepEqual(target.metadata.difficulty.referenceSnapshot,[]);assert.equal(target.metadata.difficulty.aiScore,'5.5');assert.equal((await analyzer.run(bank,{projectId:'p',questionIds:['q']})).reused,1);assert.equal(calls,1);
});
