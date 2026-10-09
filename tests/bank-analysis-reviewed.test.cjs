'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {BankAnalysis,checked,basis,solutionState,questionInput}=require('../app/bank-analysis.cjs');
const {QuestionBank}=require('../app/question-bank.cjs'),{FakeAuth,MemoryDrive}=require('./bank-fixtures.cjs');
const fixture=require('./fixtures/bank-analysis-stale-reviewed.json');
const response=()=>({types:[],typeReason:"모의 응답: 요구 작업 유형 근거 부족",originalNumber:'5',primaryUnitId:'m2-6.2',relatedUnitIds:['m2-6.1'],conditionUnitIds:['m2-6.1','m2-6.2'],solutions:[{label:'저장된 RHA 증명',unitIds:['m2-6.1','m2-6.2'],concepts:['이등변삼각형의 밑각','직각삼각형의 합동'],lastUnitId:'m2-6.2'}],score:'4.7',assessment:require('./fixtures/access-assessment.cjs').accessAssessment('S1','R1'),reason:'모의 응답: 저장 풀이의 맞대기·이등변삼각형·합동 단계 부담. 기준문제 없음.'});
function setup(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bank-reviewed-')),project=structuredClone(fixture.project);
 // Keep the captured mathematical/review evidence; supply isolated source bytes instead of an installed-app path.
 const source=path.join(directory,'source.pdf');fs.writeFileSync(source,'%PDF-1.4 synthetic source for metadata-only test');project.source.path=source;for(const s of project.sources||[])s.path=source;
 const store={dataDir:directory,get:()=>structuredClone(project),projectDir:()=>directory};
 const bank=new QuestionBank({directory,store,storage:new MemoryDrive(),auth:new FakeAuth(),appVersion:'test'});bank.wake=()=>{};
 t.after(()=>{bank.close();fs.rmSync(directory,{recursive:true,force:true});});
 return{directory,project,store,bank,p:project.problems[0],q:project.problems[0].original};
}
test('actual saved failure has full displayed solution and a current manual approval despite stale flag',()=>{
 const p=fixture.project.problems[0],q=p.original;
 assert.equal(q.solution.length,1094);assert.equal(q.solutionStale,true);
 assert.throws(()=>checked(response(),!!q.solution?.trim()&&!q.solutionDraft&&!q.solutionStale),/확정 풀이/);
 const state=solutionState(q,p,fixture.project.scope,fixture.modules);
 assert.deepEqual(state,{present:true,draft:false,stale:true,reviewedCurrent:true,final:true});
 assert.equal(questionInput(q,'5').solution,require('../app/solution-display.js').solutionText(q));assert.deepEqual(questionInput(q,'5').layoutDocument,q.layoutDocument);
 assert.equal(checked(response(),state.final).score,'4.7');
 for(const field of ['body','solution']){const changed=structuredClone(q);changed[field]+=' 변경';assert.equal(solutionState(changed,p,fixture.project.scope,fixture.modules).final,false);}
 const draft={...q,solutionDraft:true};assert.equal(solutionState(draft,p,fixture.project.scope,fixture.modules).final,false);
 const modules=structuredClone(fixture.modules);modules[0].version+='changed';assert.equal(solutionState(q,p,fixture.project.scope,modules).final,false);
});
test('actual fixture uses exact visible solution; mock result persists and complete cache survives reopen',async t=>{
 const env=setup(t);let calls=0;
 const analyzer=new BankAnalysis({store:env.store,getModules:()=>fixture.modules,getSettings:()=>({model:'mock-only'}),getBridge:()=>({run:async req=>{calls++;const input=JSON.parse(req.text);assert.equal(input.question.solution,env.q.solution);assert.deepEqual(input.question.layoutDocument,env.q.layoutDocument);assert.equal(input.assessmentAssumptions.finalSolutionIsCorrect,true);assert.equal(input.assessmentAssumptions.basis,'current_manual_review');assert.deepEqual(req.images,[]);return{result:response()};}})});
 const args={projectId:env.project.id,questionIds:[env.q.id]};env.bank.catalog(env.project.id);let item=Object.values(env.bank.state.items)[0];item.metadata.analysis=structuredClone(fixture.failure);env.bank.save();
 {const outcome=await analyzer.run(env.bank,args);assert.equal(outcome.analyzed,1,JSON.stringify(outcome));};assert.equal(item.metadata.difficulty.aiScore,'4.7');assert.equal(item.metadata.classification.primaryUnit.id,'m2-6.2');assert.equal(item.metadata.analysis.status,'complete');assert.equal(env.q.solutionStale,true);
 env.bank.close();const reopened=new QuestionBank({directory:env.directory,store:env.store,storage:new MemoryDrive(),auth:new FakeAuth(),appVersion:'test'});reopened.wake=()=>{};t.after(()=>reopened.close());
 assert.equal((await analyzer.run(reopened,args)).reused,1);assert.equal(calls,1);item=Object.values(reopened.state.items)[0];assert.equal(item.metadata.difficulty.aiScore,'4.7');assert.equal(item.metadata.classification.primaryUnit.id,'m2-6.2');
 item.metadata.difficulty.userScore='6.5';item.metadata.classification.confirmed={primaryUnit:{id:'confirmed',name:'사용자 확정'}};item.metadata.classification.primaryUnit={id:'confirmed',name:'사용자 확정'};item.metadata.analysis.status='failed';reopened.save();
 assert.equal((await analyzer.run(reopened,args)).analyzed,1);assert.equal(item.metadata.difficulty.userScore,'6.5');assert.equal(item.metadata.classification.primaryUnit.name,'사용자 확정');
});
test('unreviewed stale solution is stopped before provider; missing reason remains rejected and diagnosed',async t=>{
 const env=setup(t);let calls=0,missingReason=false;
 const analyzer=new BankAnalysis({store:env.store,getModules:()=>fixture.modules,getSettings:()=>({model:'mock-only'}),getBridge:()=>({run:async()=>{calls++;return{result:{...response(),reason:missingReason?'':response().reason}};}})});
 const args={projectId:env.project.id,questionIds:[env.q.id]};env.q.body+=' 内容変更';let outcome=await analyzer.run(env.bank,args);assert.equal(outcome.errors.length,1);assert.equal(calls,0);let item=Object.values(env.bank.state.items)[0];assert.equal(item.metadata.analysis.stage,'solution_input');assert.equal(item.metadata.analysis.inputState.present,true);assert.equal(item.metadata.analysis.errorCode,'solution_not_current');assert.equal(item.metadata.difficulty.aiScore,null);
 env.q.body=fixture.project.problems[0].original.body;missingReason=true;outcome=await analyzer.run(env.bank,args);assert.equal(outcome.errors.length,1);assert.equal(calls,2);item=Object.values(env.bank.state.items)[0];assert.equal(item.metadata.analysis.stage,'response_validation');assert.equal(item.metadata.analysis.errorCode,'score_reason_missing');assert.deepEqual(item.metadata.analysis.responseDiagnostics,{scoreProvided:true,reasonProvided:false});assert.equal(item.metadata.difficulty.aiScore,null);
});
test('compound mathematical content invalidates analysis cache while ordinary unchanged basis remains stable',()=>{
 const p=fixture.project.problems[0],q=structuredClone(p.original),first=basis(q,p,fixture.project.scope);q.layoutDocument.nodes.find(n=>n.type==='figure').diagram.points[0].x+=1;assert.notEqual(basis(q,p,fixture.project.scope),first);
 const ordinary={body:'조건',choices:[],answer:'2',solution:'풀이',diagram:null,approval:{status:'approved'}},problem={regions:[]},scope={};const legacy=require('node:crypto').createHash('sha256').update(JSON.stringify({body:ordinary.body,choices:ordinary.choices,answer:ordinary.answer,solution:ordinary.solution,solutionStale:ordinary.solutionStale,diagram:ordinary.diagram,checks:ordinary.checks,approval:ordinary.approval,regions:problem.regions,scope})).digest('hex');assert.equal(require('../app/bank-analysis.cjs').legacyBasis(ordinary,problem,scope),legacy);assert.equal(basis(ordinary,problem,scope),basis({...ordinary,title:'표시명 변경'},problem,scope));
});
test('legacy failure explanation distinguishes stored stale solution from absent solution and response reason',async()=>{
 const {recommendationFailure}=await import('../app/bank-ui.js');
 const item={metadata:{analysis:fixture.failure}},q=fixture.project.problems[0].original;
 assert.match(recommendationFailure(item,q),/저장 풀이의 변경됨 상태/);assert.doesNotMatch(recommendationFailure(item,q),/풀이와 근거 없이/);
 assert.equal(recommendationFailure({metadata:{analysis:{error:'AI 추천 응답의 난이도 이유(reason)가 비어 있습니다.'}}},q),'AI 추천 응답의 난이도 이유(reason)가 비어 있습니다.');
 assert.equal(recommendationFailure({metadata:{analysis:{status:'complete'}}},q),'');
 const ui=fs.readFileSync(path.resolve(__dirname,'../app/bank-ui.js'),'utf8');assert.match(ui,/업로드 완료·문항 검토 완료와 AI 추천 결과는 별도/);
});
