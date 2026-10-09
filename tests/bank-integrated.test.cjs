const {test}=require('node:test'),assert=require('node:assert/strict');
const {splitSourcePoints}=require('../app/question-text.cjs'),{calibrate}=require('../app/bank-calibration.cjs'),{paginate,selectQuestions,scopeFit}=require('../app/bank-exam-model.cjs'),C=require('../app/curriculum.js');
test('printed points preserve answer counts and geometric points',()=>{
 for(const body of ['정답 2개','두 점 A와 B','옳은 것을 두 개 고르시오','(1) 점 A의 좌표 (4, 5)','조건 (4점)을 연결한다'])assert.equal(splitSourcePoints(body).body,body);
 assert.deepEqual(splitSourcePoints('정답 2개를 고르시오. (4점)'),{body:'정답 2개를 고르시오.',points:4,original:'정답 2개를 고르시오. (4점)'});
 assert.equal(splitSourcePoints('구하시오. [5점]').points,5);
});
test('paired residual uses raw scores, unique revisions and family shrinkage',()=>{
 const target={rawScore:'5.0',model:'m',criteriaVersion:'v',grade:'중2',scopeKey:'a',type:'선택형'};
 const rating=(id,score)=>({...target,questionId:id,raterId:'a',score,adopted:true,updatedAt:'2026-01-01'});
 assert.equal(calibrate(target,[]).score,'5.0');assert.equal(calibrate({...target,rawScore:null},[]).score,null);
 assert.equal(calibrate(target,[rating('q','7.0')]).score,'5.2');
 const corrected={...rating('q','4.0'),updatedAt:'2026-02-01'};assert.equal(calibrate(target,[rating('q','7.0'),corrected]).ratings,1);
 assert.equal(calibrate(target,[{...rating('q','9.0'),grade:'중3'}]).score,'5.0');
 const family=Array.from({length:50},(_,i)=>({...rating(String(i),'9.0'),familyId:'one'}));assert.equal(calibrate(target,family).score,'5.2');
 assert.equal(calibrate({...target,confirmedScore:'4.7'},family).score,'4.7');
 assert.ok(Number(calibrate({...target,rawScore:'6.0'},family).score)>Number(calibrate(target,family).score));
});
test('two column packing preserves order, explicit breaks and overflow',()=>{
 const r=paginate([{questionId:'a',height:70},{questionId:'b',height:70},{questionId:'c',height:70,breakBefore:'page'}],100,0);
 assert.deepEqual(r.pages.map(p=>p.columns.map(c=>c.map(x=>x.questionId))),[[['a'],['b']],[['c'],[]]]);
 assert.deepEqual(paginate([{questionId:'long',height:110}],100).overflows,['long']);
});
test('uncertain curriculum evidence never fills quotas; alternative permitted solution can qualify',()=>{
 const unit=C.leaves[0].id,m={classification:{taxonomyVersion:C.version,status:'confirmed',conditionUnitIds:[unit],solutions:[{id:'bad',verified:true,complete:true,unitIds:[C.leaves.at(-1).id],dependencyUnitIds:[]},{id:'good',verified:true,complete:true,unitIds:[unit],dependencyUnitIds:[],text:'저장된 허용 풀이'}]},source:{school:'A'},content:{responseType:'선택형'},difficulty:{aiScore:'4.7',criteriaVersion:require('../app/difficulty-assessment.cjs').version}};
 assert.equal(scopeFit(m,[unit]).solutionId,'good');assert.equal(scopeFit(m,[unit],[unit]).ok,false);
 const c={question_id:'a',visibility:'approved',metadata:m};assert.equal(selectQuestions([c],{count:1,units:[unit],schools:['A','B'],types:{'선택형':1},bins:[{min:4,max:5,count:1}]}).complete,true);
 assert.equal(selectQuestions([c,c],{count:2,units:[unit]}).complete,false);assert.equal(selectQuestions([c],{count:1,units:[unit],excludeIds:['a']}).complete,false);
});
test('direct numeric correction survives stale AI while scope review still expires',()=>{
 const {numericScore}=require('../app/bank-exam-model.cjs');
 const c={metadata:{analysis:{status:'stale'},difficulty:{reassessmentRequired:true,userScore:'6.5'},classification:{status:'confirmed'}}};
 assert.equal(numericScore(c),6.5);assert.equal(scopeFit(c.metadata,[C.leaves[0].id]).ok,false);
 assert.equal(numericScore({...c,confirmed:{difficulty:'6.0'}}),6);
});
test('calibration held-out example improves paired bias without circular feedback',()=>{
 const target={rawScore:'5.0',model:'m',criteriaVersion:'v',grade:'중2',scopeKey:'a',type:'선택형'};
 const training=Array.from({length:8},(_,i)=>({...target,questionId:'train'+i,raterId:'owner',adopted:true,rawScore:String(3+i/2),score:String(4+i/2),updatedAt:'2026-09-30'}));
 const heldout=[{raw:4,teacher:5},{raw:5,teacher:6},{raw:6,teacher:7}];
 const before=heldout.reduce((s,x)=>s+Math.abs(x.raw-x.teacher),0)/3;
 const after=heldout.reduce((s,x)=>s+Math.abs(Number(calibrate({...target,rawScore:String(x.raw)},training).score)-x.teacher),0)/3;
 assert.equal(before,1);assert.ok(after<before&&after>0);
 assert.equal(calibrate({...target,rawScore:'5.0',calibratedScore:'9.0'},training).score,calibrate(target,training).score);
});

test('nearby raw-score evidence is local and monotone under opposing residuals',()=>{
 const target={model:'m',criteriaVersion:'v',grade:'중2',scopeKey:'a',type:'선택형'};
 const rs=Array.from({length:40},(_,i)=>({...target,questionId:String(i),raterId:'owner',adopted:true,rawScore:i<20?'3.0':'8.0',score:i<20?'4.0':'7.0',updatedAt:'2026-09-30'}));
 assert.ok(Number(calibrate({...target,rawScore:3},rs).score)>3);
 assert.ok(Number(calibrate({...target,rawScore:8},rs).score)<8);
 let prev=-Infinity;for(let x=0;x<=10;x+=.1){const value=Number(calibrate({...target,rawScore:x},rs).score);assert.ok(value>=prev);prev=value;}
});
