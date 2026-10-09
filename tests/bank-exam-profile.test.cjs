const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../app/bank-exam-model.cjs'),curriculum=require('../app/curriculum.js');
const unit=curriculum.leaves[0].id;
const item=(id,type,score)=>({question_id:id,revision_id:'r-'+id,visibility:'approved',metadata:{source:{school:'검증중'},content:{responseType:'선택형'},classification:{taxonomyVersion:curriculum.version,primaryUnit:{id:unit}},difficulty:{aiScore:score}},confirmed:{type,difficulty:score,scopeEvidence:{status:'confirmed',taxonomyVersion:curriculum.version,conditionUnitIds:[],solutions:[{id:'solution-1',verified:true,complete:true,unitIds:[],dependencyUnitIds:[]}]}}});
test('question type is independent of unit and response format',()=>{
 const a=item('a','외심 개념 판단',3),b=item('b','외심 거리 계산',5);
 a.metadata.classification.primaryUnit={name:'삼각형의 외심'};b.metadata.classification.primaryUnit={name:'삼각형의 외심'};
 assert.equal(model.questionType(a),'외심 개념 판단');assert.equal(model.questionType(b),'외심 거리 계산');assert.equal(model.responseType(a.metadata),'선택형');
});
test('profile uses existing numeric bands and 3/5/8 preference anchors',()=>{
 assert.deepEqual(model.profileCounts(10,{low:30,middle:50,high:20}),{low:3,middle:5,high:2});
 const candidates=[item('a','개념 판단',3),item('b','길이 계산',5),item('c','증명',8.2),item('d','각 계산',4.9)];
 const result=model.selectQuestions(candidates,{count:3,schools:['검증중'],units:[unit],forbidden:[],status:'approved',types:{선택형:3},avoidSameType:true,profile:{low:33.3,middle:33.3,high:33.4,targetAverage:5.4}});
 assert.equal(result.complete,true);assert.equal(result.items.length,3);assert.equal(new Set(result.items.map(model.questionType)).size,3);assert.ok(result.items.some(c=>model.numericScore(c)>=8));
 assert.equal(result.profileSummary.requested.high,1);assert.equal(result.profileSummary.actualAverage,5.4);
});
test('profile backtracks when the closest high item blocks a required response format',()=>{
 const highChoice=item('a','상 서술',8.0),highWritten=item('b','상 풀이',8.4),lowChoice=item('c','하 선택',3.0);
 highWritten.metadata.content.responseType='서술형';
 const result=model.selectQuestions([highChoice,highWritten,lowChoice],{count:2,schools:['검증중'],units:[unit],forbidden:[],status:'approved',types:{선택형:1,서술형:1},avoidSameType:true,profile:{low:50,middle:0,high:50,targetAverage:5.7}});
 assert.equal(result.complete,true);
 assert.deepEqual(result.items.map(c=>c.question_id).sort(),['b','c']);
});
