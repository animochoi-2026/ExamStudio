'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {ProjectStore}=require('../app/store.cjs'),{Workflow}=require('../app/workflow.cjs'),{DEFAULT_SCOPE}=require('../app/rules.cjs'),Cache=require('../app/assessment-cache.cjs'),{recognition}=require('./workflow-fixtures.cjs');
function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'persist-scope-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC0lEQVR42mP8/x8AAusB9Wl6NZYAAAAASUVORK5CYII=','base64'),file=path.join(dir,'source.png');fs.writeFileSync(file,png);
 const store=new ProjectStore(dir);let project=store.create(file);project.scope={...structuredClone(DEFAULT_SCOPE),prerequisites:['중학교 1학년까지 학습한 내용']};delete project.priorLearningPolicyVersion;store.write(project);
 project=store.addRegion({projectId:project.id,region:{page:1,x:0,y:0,width:1,height:1},imageDataUrl:'data:image/png;base64,'+png.toString('base64')});
 const base={projectId:project.id,problemId:project.problems[0].id,task:'recognition',provider:'codex'};
 return {dir,store,base};
}
test('first AI request persists migrated scope before dispatch and assessment reuse has the same basis',async t=>{
 const f=setup(t);let calls=0;
 const workflow=new Workflow({store:f.store,directory:f.dir,getSettings:()=>({model:'gpt-6.1-sol',effort:'high'}),getBridge:()=>({run:async()=>{
  calls++;const saved=f.store.get(f.base.projectId);assert.equal(saved.priorLearningPolicyVersion,1);assert.ok(saved.scope.prerequisites.includes(DEFAULT_SCOPE.prerequisites[0]));return {result:{reply:'판독',recognition:recognition()}};
 }})});
 await workflow.run(f.base);const project=f.store.get(f.base.projectId),p=project.problems[0];assert.equal(calls,1);assert.deepEqual(p.original.assessment.scope,project.scope);assert.equal(p.original.assessment.inputHash,Cache.basis(p.original,p,project.scope));
});
test('a scope changed during recognition is preserved by later run-record writes',async t=>{
 const f=setup(t);let release;
 const workflow=new Workflow({store:f.store,directory:f.dir,getSettings:()=>({model:'gpt-6.1-sol',effort:'high'}),getBridge:()=>({run:()=>new Promise(r=>{release=r;})})});
 const running=workflow.run(f.base);while(!release)await new Promise(r=>setTimeout(r,1));
 f.store.updateProblem(f.base.projectId,f.base.problemId,(p,project)=>{project.scope.restrictions='사용자가 수정한 제한';});
 release({result:{reply:'오래된 판독',recognition:recognition()}});await running;
 assert.equal(f.store.get(f.base.projectId).scope.restrictions,'사용자가 수정한 제한');
});
