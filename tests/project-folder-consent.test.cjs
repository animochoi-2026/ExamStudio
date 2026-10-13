'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ProjectStore}=require('../app/store.cjs'),{Workflow}=require('../app/workflow.cjs');
const {recognition,item,validation}=require('./workflow-fixtures.cjs');
const {stages}=require('../app/batch-queue.js');
async function fixture(t,manual=false){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-rename-consent-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6NZYAAAAASUVORK5CYII=','base64'),file=path.join(dir,'source.png');fs.writeFileSync(file,png);
 const store=new ProjectStore(dir);store.reserveProjectFolder=p=>path.join(store.projectsDir,p.id);
 let p=store.create(file);p=store.addRegion({projectId:p.id,region:{page:1,x:0,y:0,width:1,height:1},imageDataUrl:'data:image/png;base64,'+png.toString('base64')});
 const workflow=new Workflow({store,directory:dir,getSettings:()=>({model:'gpt-6-astra',effort:'high'}),getBridge:()=>({run:async req=>({result:req.execution.task==='recognition'?{reply:'fixture',recognition:recognition()}:req.execution.task==='generation'?{reply:'fixture',items:[item()],holdReason:''}:{queueClassification:{primaryUnitId:null,relatedUnitIds:[],conditionUnitIds:[],solutions:[],types:[],typeReason:'fixture'},reply:'fixture',answer:'2',solution:'조건에서 2를 구한다.',questionType:'single_value',validation:validation(),holdReason:''}})})});
 const base={projectId:p.id,problemId:p.problems[0].id,provider:'codex',count:1,variant:'numeric_only'};
 await workflow.run({...base,task:'recognition'});workflow.confirmSource(p.id,base.problemId);
 await workflow.run({...base,task:'solve',automaticFinalize:true,batchIncludeWarnings:true});
 await workflow.run({...base,task:'generation',automaticFinalize:true,batchIncludeWarnings:true});
 p=store.get(p.id);if(manual)for(const q of [p.problems[0].original,...p.problems[0].variants])workflow.approve(p.id,base.problemId,q.id,true);
 p=workflow.decorate(store.get(p.id));assert.equal(stages(p.problems).counts.solve,1);assert.equal(p.problems[0].variants[0].approval.status,'approved');store.write(p);
 return {dir,store,workflow,p};
}
for(const manual of [false,true])test(`${manual?'manual':'batch'} approvals and solutions survive folder migration and two cold starts`,async t=>{
 const f=await fixture(t,manual),old=f.store.projectDir(f.p.id),before=f.p.problems[0],bytes=fs.readFileSync(before.cropPaths[0]);
 for(let n=0;n<2;n++){
  const store=new ProjectStore(f.dir);assert.equal(store.migrateProjectFolders().moves.length,n===0?1:0);
  assert.notEqual(store.projectDir(f.p.id),old);
  const w=new Workflow({store,directory:f.dir}),p=w.decorate(store.get(f.p.id));
  assert.equal(stages(p.problems).counts.solve,1);
  for(const [i,q] of [p.problems[0].original,...p.problems[0].variants].entries()){
   assert.equal(q.approval.status,'approved');assert.equal(q.include,true);assert.equal(q.needsReview,false);
   assert.equal(q.solution,[before.original,...before.variants][i].solution);
  }
  assert.deepEqual(fs.readFileSync(p.problems[0].cropPaths[0]),bytes);store.write(p);
 }
});
for(const kind of ['body','scope','rule','missing-image'])test(`folder migration never renews a stale approval: ${kind}`,async t=>{
 const f=await fixture(t),p=f.store.get(f.p.id),q=p.problems[0].original,oldBasis=q.batchOutputConsent.basis;
 if(kind==='body')q.body+=' changed';
 if(kind==='scope')p.scope.restrictions+=' changed';
 if(kind==='rule'){const m=f.workflow.rules.snapshot().modules.find(m=>q.batchOutputConsent.moduleIds.includes(m.id)&&m.editable);assert(m);f.workflow.rules.save(m.id,m.content+'\nchanged');}
 if(kind==='missing-image')fs.unlinkSync(p.problems[0].cropPaths[0]);
 f.store.write(p);const store=new ProjectStore(f.dir);store.migrateProjectFolders();
 assert.equal(store.get(p.id).problems[0].original.batchOutputConsent.basis,oldBasis);
 const next=new Workflow({store,directory:f.dir}).decorate(store.get(p.id));assert.equal(next.problems[0].original.approval.status,'pending');
});
