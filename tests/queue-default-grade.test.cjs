const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ProjectStore}=require('../app/store.cjs'),{ExamQueue}=require('../app/exam-queue.cjs'),{QueueScopeHistory,gradeDefaultScope}=require('../app/queue-scope-history.cjs'),C=require('../app/curriculum.js');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'queue-default-grade-'));t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());fs.rmSync(dir,{recursive:true,force:true});});const file=path.join(dir,'exam.pdf');fs.writeFileSync(file,'%PDF-test');const store=new ProjectStore(path.join(dir,'data')),queue=new ExamQueue({directory:store.dataDir,store});const id=queue.add([file]).added[0].id;return {dir,store,queue,id,item:queue.item(id)};}
test('unspecified elementary and middle scope includes both semesters of only that grade',()=>{
 for(const grade of ['초5','초6','중1','중2','중3']){const scope=gradeDefaultScope(grade),key=C.gradeKey(grade);assert.deepEqual(scope.curriculum.selected,C.selection([key]));assert(scope.curriculum.selected.every(id=>id.startsWith(key+'-')));assert(scope.semester.includes('1학기')&&scope.semester.includes('2학기'));}
 for(const grade of ['',null,'2학년','대학1'])assert.equal(gradeDefaultScope(grade),null);
});
test('high school unspecified scope allows every registered course of the specified grade',()=>{
 for(const grade of ['고1','고2','고3']){const key=C.gradeKey(grade),scope=gradeDefaultScope(grade);assert.deepEqual(scope.curriculum.selected,C.selection([key]));assert(scope.curriculum.selected.length>0);assert(scope.curriculum.selected.every(id=>id.startsWith(key+'-')));}
});
test('default scope persists, tracks grade changes, and preserves explicit narrower scope',t=>{
 const f=fixture(t);f.queue.edit(f.id,{metadata:{grade:'중2'},scope:null,scopeConfirmed:false});assert.equal(f.item.scopeConfirmed,true);assert.equal(f.item.scopeMode,'grade-default');assert.deepEqual(f.item.scope,gradeDefaultScope('중2'));
 const restored=new ExamQueue({directory:f.store.dataDir,store:f.store});assert.equal(restored.item(f.id).scopeMode,'grade-default');restored.edit(f.id,{metadata:{grade:'중3'}});assert.deepEqual(restored.item(f.id).scope,gradeDefaultScope('중3'));
 const narrow=C.build(['m2-8.1'],{extraForbidden:['추가 금지'],restrictions:'선택한 범위 유지'});restored.edit(f.id,{metadata:{grade:'중2'},scope:narrow,scopeConfirmed:true});restored.edit(f.id,{metadata:{academicYear:'2024'}});assert.deepEqual(restored.item(f.id).scope,narrow);assert.equal(restored.item(f.id).scopeMode,'explicit');
});
test('default range does not replace remembered explicit semester exam scope',t=>{
 const f=fixture(t),history=new QueueScopeHistory(f.dir),metadata={grade:'중2',semester:'2학기',exam:'중간고사'},narrow=C.build(['m2-8.1']);history.remember(narrow,metadata);const before=fs.readFileSync(history.file,'utf8');f.queue.edit(f.id,{metadata,scope:null,scopeConfirmed:false});history.list([f.item]);assert.equal(fs.readFileSync(history.file,'utf8'),before);assert.deepEqual(history.match(metadata).scope,narrow);
});
test('prepare applies default to the saved project and solve prompt without AI calls',t=>{
 const f=fixture(t),handlers={};f.item.metadata.grade='중2';f.queue.save();
 const workflow={decorate:p=>p,saveScope:(id,scope)=>{const p=f.store.get(id);p.scope=scope;return f.store.write(p);}};
 require('../app/exam-queue-main.cjs').installExamQueue({queue:f.queue,store:f.store,workflow,handle:(name,fn)=>handlers[name]=fn,busy:new Set()});
 const project=handlers.examQueuePrepare({id:f.id});assert.deepEqual(project.scope,gradeDefaultScope('중2'));assert.equal(f.item.scopeMode,'grade-default');assert.equal(f.item.scopeConfirmed,true);assert.equal(f.queue.state.usage.calls,0);
 const {RulesStore,compose}=require('../app/rules.cjs'),prompt=compose({task:'solve',scope:project.scope,modules:new RulesStore(f.dir).snapshot().modules});assert.match(JSON.stringify(prompt),/중학교 2학년/);assert.deepEqual(project.scope.curriculum.selected,C.selection(['m2']));
});
