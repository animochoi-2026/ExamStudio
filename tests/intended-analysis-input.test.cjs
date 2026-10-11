const {test}=require('node:test'),assert=require('node:assert/strict'),{questionInput}=require('../app/bank-analysis.cjs');
test('queue reuses only an exact current manual review, with source and draft guards',t=>{
 const fixture=require('./fixtures/bank-analysis-stale-reviewed.json'),{queueSolutionCurrent}=require('../app/bank-analysis.cjs');
 const fs=require('fs'),path=require('path'),dir=fs.mkdtempSync(path.join(require('os').tmpdir(),'queue-reviewed-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const project=structuredClone(fixture.project),p=project.problems[0],store={get:()=>project,write:x=>x};
 const workflow=new(require('../app/workflow.cjs').Workflow)({store,directory:dir,getBridge:()=>{throw Error('no AI')},getSettings:()=>({})});
 workflow.approve(project.id,p.id,p.original.id,true,{targetOnly:true});const ruleModules=workflow.rules.snapshot().modules;
 assert.equal(queueSolutionCurrent(p,project.scope,ruleModules),true);
 p.original.body+=' changed';assert.equal(queueSolutionCurrent(p,project.scope,ruleModules),false);p.original.body=fixture.project.problems[0].original.body;
 p.original.solutionDraft={};assert.equal(queueSolutionCurrent(p,project.scope,ruleModules),false);delete p.original.solutionDraft;
 p.recognition.sourceStale=true;assert.equal(queueSolutionCurrent(p,project.scope,ruleModules),false);p.recognition.sourceStale=false;
 const modules=structuredClone(ruleModules);modules[0].version+=' changed';assert.equal(queueSolutionCurrent(p,project.scope,modules),false);
});
test('explicit metadata refresh dispatches once while automatic processing keeps cached results',async()=>{
 const {BankAnalysis,basis}=require('../app/bank-analysis.cjs'),D=require('../app/difficulty-assessment.cjs');
 const q={id:'q',body:'original conditions',choices:[],answer:'80',solution:'intended solution',approval:{status:'approved'},intendedSolution:{answer:'80',interpretation:'approved intention'}};
 const p={id:'p',original:q,variants:[],regions:[]},project={id:'project',problems:[p],scope:{}};
 const metadata={source:{originalNumber:'8'},classification:{primaryUnit:{id:'m2-6.2'},types:[{id:'task.calculate'}]},difficulty:{criteriaVersion:D.version,userScore:'4.7'},analysis:{status:'complete',basis:basis(q,p,project.scope)}};
 const bank={state:{},auth:{config:()=>({})},catalog(){},ensure(){return{metadata}},save(){}};let calls=0;
 const analyzer=new BankAnalysis({store:{get:()=>project},getSettings:()=>({model:'mock'}),getBridge:()=>({run:async request=>{calls++;assert.deepEqual(JSON.parse(request.text).question.intendedSolution,q.intendedSolution);throw Error('mock response stop');}})});
 const args={projectId:project.id,questionIds:['q']};assert.equal((await analyzer.run(bank,args)).reused,1);assert.equal(calls,0);
 assert.equal((await analyzer.run(bank,{...args,automatic:true,refresh:true})).reused,1);assert.equal(calls,0);
 const result=await analyzer.run(bank,{...args,refresh:true});assert.equal(calls,1);assert.equal(result.errors.length,1);assert.equal(q.answer,'80');assert.equal(q.solution,'intended solution');
});
test('approved intended interpretation reaches metadata without changing original conditions',()=>{const q={body:'original inconsistent conditions',choices:[],answer:'80',solution:'formal intended solution',approval:{status:'approved'},intendedSolution:{answer:'80',interpretation:'intended calculation',sourceError:'inconsistent source'}};const value=questionInput(q,'8');assert.deepEqual(value.intendedSolution,q.intendedSolution);assert.equal(value.body,q.body);q.approval.status='pending';assert.equal(questionInput(q,'8').intendedSolution,undefined);q.approval.status='approved';q.solutionDraft={};assert.equal(questionInput(q,'8').intendedSolution,undefined);});
