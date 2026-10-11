const {test}=require('node:test'),assert=require('node:assert/strict');
const app=process.env.EXAM_TEST_APP||'../app';
const {BankAnalysis,basis}=require(app+'/bank-analysis.cjs'),D=require(app+'/difficulty-assessment.cjs');
function fixture(){
 const q={id:'q',body:'$x+1=3$일 때 x의 값을 구하시오.',choices:[],answer:'2',solution:'양변에서 1을 빼면 2.',approval:{status:'approved'},intendedSolution:{answer:'2',interpretation:'confirmed intended equation',sourceError:'printed condition error'}};
 const p={id:'p',original:q,variants:[],recognition:{version:1},regions:[]},project={id:'project',problems:[p],scope:{}};
 const metadata={source:{originalNumber:'8'},classification:{primaryUnit:{id:'m1-4.3'},types:[{id:'task.expression'}]},difficulty:{criteriaVersion:D.version,aiScore:null,userScore:null},analysis:{status:'complete',basis:basis(q,p,project.scope)}};
 const bank={state:{},auth:{config:()=>({})},catalog(){},ensure(){return{metadata}},save(){}};let calls=0,fail=false;
 const analyzer=new BankAnalysis({store:{get:()=>project},getSettings:()=>({model:'mock'}),getBridge:()=>({run:async req=>{calls++;assert.deepEqual(JSON.parse(req.text).question.intendedSolution,q.intendedSolution);if(fail)throw Error('mock network failure');return {result:{originalNumber:'8',primaryUnitId:'m1-4.3',relatedUnitIds:[],conditionUnitIds:[],solutions:[],types:[],typeReason:'fixture only',assessment:require('./fixtures/access-assessment.cjs').accessAssessment('S1','R1')}};}})});
 return{q,p,project,bank,metadata,analyzer,calls:()=>calls,fail:()=>fail=true,args:{projectId:'project',questionId:'q'}};
}
test('intended assessment repair replaces deferred cache once and keeps source and solution',async()=>{
 const f=fixture(),before=JSON.stringify(f.q);await f.analyzer.repairIntendedAssessment(f.bank,f.args);assert.equal(f.calls(),1);assert.equal(f.metadata.analysis.status,'complete');assert.notEqual(D.effective({metadata:f.metadata}).number,null);assert.equal(JSON.stringify(f.q),before);
 assert.equal((await f.analyzer.repairIntendedAssessment(f.bank,f.args)).reused,true);assert.equal(f.calls(),1);
});
test('failed or interrupted intended repair stays durable and does not dispatch repeatedly',async()=>{
 const f=fixture();f.fail();await assert.rejects(f.analyzer.repairIntendedAssessment(f.bank,f.args),/mock network/);assert.equal(f.calls(),1);
 await assert.rejects(f.analyzer.repairIntendedAssessment(f.bank,f.args),/이미 요청/);assert.equal(f.calls(),1);
 f.metadata.intendedAssessmentRepairs[0].status='started';await assert.rejects(f.analyzer.repairIntendedAssessment(f.bank,f.args),/이미 요청/);assert.equal(f.calls(),1);
});
test('unresolved drafts and absent intended interpretation do not gain an automatic assessment',async()=>{
 const f=fixture();f.q.solutionDraft={};await assert.rejects(f.analyzer.repairIntendedAssessment(f.bank,f.args),/완성된 풀이/);delete f.q.solutionDraft;delete f.q.intendedSolution;await assert.rejects(f.analyzer.repairIntendedAssessment(f.bank,f.args),/확정 출제 의도/);assert.equal(f.calls(),0);
});
test('normal manual metadata request does not reuse a deferred result as complete',async()=>{
 const f=fixture();const result=await f.analyzer.run(f.bank,{projectId:'project',questionIds:['q']});assert.equal(result.analyzed,1);assert.equal(f.calls(),1);
});
test('a stale missing-model catalog refreshes once before dispatch and never substitutes a model',async()=>{
 const {CodexBridge}=require(app+'/codex.cjs'),b=new CodexBridge({cwd:process.cwd(),executable:'unused'});let reads=0,dispatch=0;
 b.getAccount=async options=>{reads++;if(reads===2)assert.equal(options.force,true);return {account:{type:'chatgpt'},models:[]};};b._request=async()=>{dispatch++;throw Error('must not dispatch');};
 await assert.rejects(b.run({context:{id:'offline'},text:'fixture',model:'gpt-6.1-sol',effort:'high'}),/모델을 확인하지/);assert.equal(reads,2);assert.equal(dispatch,0);
});
