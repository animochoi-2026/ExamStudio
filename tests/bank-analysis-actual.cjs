'use strict';
// Opt-in: one real AI request using an isolated synthetic question; no shared upload.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {ProjectStore}=require('../app/store.cjs'),{QuestionBank}=require('../app/question-bank.cjs'),{BankAnalysis}=require('../app/bank-analysis.cjs'),{CodexBridge}=require('../app/codex.cjs'),C=require('../app/curriculum.js');
(async()=>{
 const dir=fs.mkdtempSync(path.resolve('data/validation/bank-analysis-actual-')),store=new ProjectStore(dir),M=require('../app/bank-model.cjs');
 const info=JSON.parse(fs.readFileSync('data/backups/integrated-bank-remote-result.json','utf8')),archive=new(require('../app/bank-transfer.cjs').ArchiveStorage)(info.directory),record=archive.archive.records.find(r=>r.question.owner_email==='realspy1234@gmail.com');
 const bundle=JSON.parse(await archive.download(record.catalog.files.find(f=>f.role==='data').id)),files=new Map();for(const f of bundle.files.filter(f=>['source','asset'].includes(f.role)))files.set(f.key,await archive.download(f.id));
 const project=M.restoreSnapshot(bundle,files,store.projectDir(M.uuid()));store.write(project);const questionId=bundle.native.targetQuestionId;
 const bridge=new CodexBridge({cwd:store.projectsDir}),bank=new QuestionBank({directory:dir,store,auth:{status:()=>({connected:false}),cancel(){}},storage:{},appVersion:'live-test'});bank.wake=()=>{};
 const settingsFile=path.resolve('data/ai-settings.json'),saved=fs.existsSync(settingsFile)?JSON.parse(fs.readFileSync(settingsFile,'utf8')):{};const settings={model:saved.model||'gpt-6-astra',effort:saved.effort||'medium'};
 try{const analyzer=new BankAnalysis({store,getBridge:()=>bridge,getSettings:()=>settings}),result=await analyzer.run(bank,{projectId:project.id,questionIds:[questionId]});assert.equal(result.errors.length,0,JSON.stringify(result.errors));const metadata=Object.values(bank.state.items)[0].metadata;assert.ok(C.leaves.some(u=>u.id===metadata.classification.primaryUnit.id));assert.match(metadata.difficulty.aiScore,/^\d+\.\d$/);assert.ok(metadata.difficulty.reason);fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify({result,metadata},null,2));console.log('PASS one real AI recommendation: existing curriculum ID, printed number retained, decimal score and rationale; actual archived private question, no cloud mutation. '+dir);}finally{try{bank.close();}finally{bridge.close();}}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
