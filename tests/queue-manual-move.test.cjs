const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ProjectStore}=require('../app/store.cjs'),{ExamQueue,fileHash}=require('../app/exam-queue.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'queue-manual-move-'));t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());fs.rmSync(dir,{recursive:true,force:true});});const file=path.join(dir,'exam.pdf');fs.writeFileSync(file,'%PDF-test-original');const store=new ProjectStore(path.join(dir,'data')),queue=new ExamQueue({directory:store.dataDir,store});const id=queue.add([file]).added[0].id;return {dir,file,store,queue,id,item:queue.item(id)};}
test('manual move preserves unconfirmed totals and held results; collision and repeat are safe',t=>{
 const f=fixture(t),project=f.queue.ensureProject(f.id);f.item.status='held';f.item.steps.test={kind:'upload',status:'held',reason:'review pending',result:{saved:true}};f.queue.save();
 const metadata=JSON.stringify(f.item.metadata),steps=JSON.stringify(f.item.steps),folder=path.join(f.dir,'완료된 시험지');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'exam.pdf'),'existing');
 assert.throws(()=>f.queue.move(f.id),/전체 문항/);const result=f.queue.move(f.id,{manual:true}),moved=f.item;assert.equal(result.items.length,0);assert.equal(moved.hidden,true);assert(moved.removedAt);
 assert.equal(moved.move.status,'complete');assert.equal(JSON.stringify(f.item.metadata),metadata);assert.equal(JSON.stringify(f.item.steps),steps);
 assert.equal(fs.readFileSync(path.join(folder,'exam.pdf'),'utf8'),'existing');assert.equal(fileHash(moved.currentPath),f.item.hash);assert.equal(f.store.get(project.id).source.path,moved.currentPath);
 assert.equal(f.queue.move(f.id,{manual:true}).items.length,0);const restored=new ExamQueue({directory:f.store.dataDir,store:f.store});assert.equal(restored.status().items.length,0);const added=restored.add([moved.currentPath]);assert.equal(added.added[0].reused,true);assert.equal(added.snapshot.items[0].projectId,project.id);assert.equal(JSON.stringify(added.snapshot.items[0].steps),steps);assert.equal(fs.readdirSync(folder).length,2);assert.equal(f.queue.state.usage.calls,0);
});
test('manual move refuses an active reservation and a running exam between requests',t=>{
 const f=fixture(t);f.queue.reservations.set('reserved',{item:f.item,key:'test'});assert.throws(()=>f.queue.move(f.id,{manual:true}),/진행 중/);f.queue.reservations.clear();f.item.status='running';f.queue.state.mode='running';assert.throws(()=>f.queue.move(f.id,{manual:true}),/일시정지/);assert(fs.existsSync(f.file));
});
test('manual move journal resumes after restart before rename without inventing a project',t=>{
 const f=fixture(t),folder=path.join(f.dir,'완료된 시험지');fs.mkdirSync(folder);const target=path.join(folder,'exam.pdf');f.item.move={status:'moving',method:'win32-noreplace',target,manualConfirmedAt:new Date().toISOString(),removeAfterMove:true};f.queue.save();
 const restored=new ExamQueue({directory:f.store.dataDir,store:f.store});const recovered=restored.state.items.find(i=>i.id===f.id);assert.equal(recovered.move.status,'complete');assert.equal(recovered.currentPath,target);assert(!fs.existsSync(f.file));assert.equal(restored.status().items.length,0);assert(recovered.removedAt);assert.equal(restored.state.usage.calls,0);
});
test('manual move failure preserves original and saved work',t=>{
 const f=fixture(t);f.queue.ensureProject(f.id);f.item.steps.test={kind:'solve',status:'complete',result:{solution:'saved'}};f.queue.moveFile=()=>{throw Error('device unavailable');};const before=JSON.stringify(f.item.steps);
 assert.equal(f.queue.move(f.id,{manual:true}).items[0].move.status,'failed');assert(fs.existsSync(f.file));assert.equal(JSON.stringify(f.item.steps),before);assert.equal(f.store.get(f.item.projectId).source.path,f.file);
});
test('project path save failure keeps the item visible until recovery succeeds',t=>{
 const f=fixture(t);f.queue.ensureProject(f.id);const relocate=f.store.relocateExternal.bind(f.store);f.store.relocateExternal=()=>{throw Error('disk unavailable');};
 const result=f.queue.move(f.id,{manual:true});assert.equal(result.items.length,1);assert.equal(f.item.move.status,'unknown');assert(!f.item.removedAt);assert(fs.existsSync(f.item.currentPath));
 f.store.relocateExternal=relocate;const restored=new ExamQueue({directory:f.store.dataDir,store:f.store});assert.equal(restored.status().items.length,0);assert.equal(f.store.get(f.item.projectId).source.path,f.item.currentPath);
});
