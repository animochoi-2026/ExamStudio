'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {ProjectStore}=require('../app/store.cjs'),maintenance=require('../app/project-maintenance.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-audit-'));t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());fs.rmSync(dir,{recursive:true,force:true});});const source=path.join(dir,'source.png');fs.writeFileSync(source,'source fixture');const store=new ProjectStore(path.join(dir,'data')),project=store.create(source);return {dir,source,store,project};}
test('automatic continuation reruns stale solutions and excludes held work from completion',()=>{
 const {automaticPlan,stages}=require('../app/batch-queue.js');const p={regions:[{}],recognition:{body:'body',version:1,confirmed:true,uncertainties:[]},original:{answer:'2',solution:'old',sourceVersion:1},variants:[]};
 assert.equal(automaticPlan(p).solve,false);p.original.solutionStale=true;assert.equal(automaticPlan(p).solve,true);assert.equal(stages([p]).counts.solve,0);
 p.original.solutionStale=false;p.original.solutionDraft={answer:'3'};assert.equal(stages([p]).counts.solve,0);assert.equal(stages([p]).held,1);
 delete p.original.solutionDraft;p.recognition.rulesStale=true;assert.equal(automaticPlan(p).recognition,true);p.recognition.correctedByUser=true;assert.equal(automaticPlan(p).recognition,false);assert.equal(automaticPlan(p).solve,true);
});
test('PDF removes existing choice prefixes and consumes the Word page/column plan',()=>{
 const {documentHtml}=require('../app/pdf-export.cjs');const q=i=>({id:'q'+i,body:'문제 '+i,choices:['① 6','② 7'],answer:'①',solution:'풀이'});
 const data={title:'test',settings:{workspaceLines:2},questions:[q(1),q(2),q(3)],layout:[{capacity:2,questionIds:['q1','q2'],positions:[{questionId:'q1',column:0,slot:0},{questionId:'q2',column:1,slot:0}]},{capacity:2,questionIds:['q3'],positions:[{questionId:'q3',column:0,slot:0}]}]};
 const html=documentHtml(data);assert.match(html,/① 6<br>② 7/);assert.doesNotMatch(html,/① ①/);assert.equal((html.match(/class="question-page"/g)||[]).length,2);assert.equal((html.match(/class="planned-column"/g)||[]).length,4);
 assert.match(html,/<section class="notes columns">/);assert.ok(html.indexOf('문제 2')<html.indexOf('문제 3'));
});
test('Gemini usage failure does not erase an available model catalog; authentication failure still blocks',async()=>{
 const {AntigravityBridge}=require('../app/antigravity.cjs'),bridge=Object.create(AntigravityBridge.prototype);
 bridge.execute=async args=>{if(args[0]==='models')return {out:'gemini-test\tGemini'};throw Error('usage network failure');};let account=await bridge.getAccount();assert.equal(account.available,true);assert.equal(account.models[0].model,'gemini-test');assert.equal(account.usageStatus,'unavailable');assert.deepEqual(account.buckets,[]);
 bridge.execute=async()=>{throw Error('login required');};account=await bridge.getAccount();assert.equal(account.available,false);
});
test('corrupt index is archived and rebuilt without altering project contents',t=>{
 const {store,project}=fixture(t),file=path.join(store.projectDir(project.id),'project.json'),before=fs.readFileSync(file,'utf8');fs.writeFileSync(store.indexFile,'broken index');
 assert.equal(store.list()[0].id,project.id);assert.equal(fs.readFileSync(file,'utf8'),before);assert.ok(fs.readdirSync(store.dataDir).some(n=>n.startsWith('index.corrupt-')));assert.match(store.takeNotices()[0],/복구/);
 store.closeCurrent();assert.equal(store.last(),null);
});
test('missing source opens for recovery, reconnection backs up and never overwrites existing files',t=>{
 const {store,project,source}=fixture(t);fs.unlinkSync(project.source.path);store.cache.clear();assert.equal(store.get(project.id).assetIssues.length,1);
 const result=maintenance.reconnect(store,{projectId:project.id,name:'source.png',file:source});assert.equal(result.project.assetIssues,undefined);assert.ok(fs.existsSync(path.join(result.backup.path,'project.json')));assert.throws(()=>maintenance.reconnect(store,{projectId:project.id,name:'source.png',file:source}),/누락/);
});
test('cleanup previews dependencies, backs up first, preserves current data and rejects stale confirmation',t=>{
 const {store,project}=fixture(t),assets=path.join(store.projectDir(project.id),'assets'),old=path.join(assets,'old.png'),unused=path.join(assets,'unused.png');fs.writeFileSync(old,'old');fs.writeFileSync(unused,'unused');
 project.problems=[{id:'p',regions:[],cropPaths:[],messages:[{text:'preserve conversation'}],original:{body:'current',answer:'2',solution:'current solution'},variants:[],recognitionHistory:[{cropPaths:[old]}],runs:[{requestId:'keep-idempotency'}]}];store.write(project);
 let preview=maintenance.plan(store,project.id,{unusedAssets:true});assert.deepEqual(preview.unused.map(x=>x.name),['unused.png']);
 const initial=preview.token;store.updateProblem(project.id,'p',p=>p.messages.push({text:'new'}));assert.throws(()=>maintenance.cleanup(store,{projectId:project.id,options:preview.options,token:initial}),/変|바뀌/);
 preview=maintenance.plan(store,project.id,{histories:true,unusedAssets:true});assert.equal(preview.unused.length,2);
 const result=maintenance.cleanup(store,{projectId:project.id,options:preview.options,token:preview.token});assert.ok(fs.existsSync(project.source.path));assert.ok(!fs.existsSync(old));assert.ok(!fs.existsSync(unused));assert.ok(fs.existsSync(path.join(result.backup.path,'assets','old.png')));
 assert.equal(result.project.problems[0].original.solution,'current solution');assert.equal(result.project.problems[0].messages.length,2);assert.equal(result.project.problems[0].runs[0].requestId,'keep-idempotency');assert.equal(result.project.problems[0].recognitionHistory,undefined);
 const restore=new ProjectStore(path.join(store.dataDir,'restore'));fs.cpSync(result.backup.path,restore.projectDir(project.id),{recursive:true});assert.equal(restore.get(project.id).problems[0].recognitionHistory.length,1);
});
test('failed variant rendering never substitutes a crop of the original question',async()=>{
 const code=fs.readFileSync(path.join(__dirname,'../app/main.cjs'),'utf8'),fn=code.slice(code.indexOf('async function buildDocument('),code.indexOf('async function buildUniqueWord('));
 const geometry=require('../app/geometry.cjs'),q={id:'q',sourceId:'p',kind:'variant',body:'new values',answer:'2',solution:'steps',approval:{status:'approved'},exportWithWarnings:true,diagram:{points:[{name:'A',x:0,y:0}],segments:[{from:'A',to:'missing'}]}};
 const build=vm.runInNewContext('('+fn+')',{path,selectedQuestions:()=>[q],documentQuestion:x=>structuredClone(x),...geometry,fs:{mkdirSync(){}},store:{projectDir:()=>'/mock'},require:name=>name==='sharp'?()=>{throw Error('should not load original');}:name==='./source-materials.cjs'?{questionOnlyCurrent:()=>false,questionImages:async()=>[]}:require(path.resolve(__dirname,'../app',name)),Buffer});
 await assert.rejects(build({id:'p',settings:{},problems:[{id:'p',cropPaths:['original.png']}]},'/mock.docx'),/원본 그림으로 대체하지 않았습니다/);
});
