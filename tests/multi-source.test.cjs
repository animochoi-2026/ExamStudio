const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ProjectStore}=require('../app/store.cjs');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/bX8AAAAASUVORK5CYII=';
const imageDataUrl=`data:image/png;base64,${png}`,region={page:1,x:0,y:0,width:.5,height:.5};
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-sources-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const files=['a.pdf','b.pdf','photo.PNG','photo.JPG'].map(name=>path.join(dir,name));for(const file of files)fs.writeFileSync(file,Buffer.from(png,'base64'));return {dir,files,store:new ProjectStore(path.join(dir,'data'))};}
test('PDF/image files have distinct owned copies and same-page regions retain source identity across reordering and relocation',t=>{
 const {store,files,dir}=setup(t);let p=store.create(files.slice(0,3));assert.equal(p.sources.length,3);assert.deepEqual(p.sources.map(s=>s.type),['pdf','pdf','image']);
 for(const source of p.sources)p=store.addRegion({projectId:p.id,region:{...region,sourceId:source.id},imageDataUrl});
 const oldIds=p.problems.map(q=>q.id);p.problems.reverse();p=store.save(p);
 const destination=path.join(dir,'relocated');fs.cpSync(store.dataDir,destination,{recursive:true});const moved=new ProjectStore(destination).get(p.id);
 assert.deepEqual(moved.problems.map(q=>q.id),oldIds.reverse());assert.deepEqual(moved.problems.map(q=>q.regions[0].sourceId),p.sources.map(s=>s.id).reverse());
 for(const source of moved.sources){assert.ok(source.path.startsWith(destination));assert.ok(fs.existsSync(source.path));}assert.equal(moved.source.path,moved.sources[0].path);
});
test('appending to a legacy project preserves review state, crop identity, cached recognition, scope and existing results',t=>{
 const {store,files}=setup(t);let p=store.create(files[0]);p=store.addRegion({projectId:p.id,region,imageDataUrl});
 p=store.updateProblem(p.id,p.problems[0].id,q=>{delete q.regions[0].sourceId;q.recognition={confirmed:true,cacheKey:'keep-cache',version:2};q.original={body:'원문',include:true,solution:'기존 풀이'};q.variants=[{body:'유사문제'}];q.messages=[{text:'기존 대화'}];});
 p.scope={units:['삼각형의 성질']};p=store.save(p);const before=structuredClone(p);
 p=store.addSources(p.id,files.slice(1));assert.deepEqual(p.problems,before.problems);assert.deepEqual(p.scope,before.scope);assert.deepEqual(p.source,before.source);assert.equal(p.sources[0].id,'primary');assert.equal(p.sources.length,4);
 assert.deepEqual(new ProjectStore(store.dataDir).get(p.id),p);
});
test('renderer cannot inject or remove source files; unknown source IDs and invalid import batches do not mutate a project',t=>{
 const {store,files}=setup(t);let p=store.create(files.slice(0,2)),original=structuredClone(p.sources);
 p.sources[1].path=files[3];p.sources.push({id:'injected',path:files[3]});p=store.save(p);assert.deepEqual(p.sources,original);
 assert.throws(()=>store.addRegion({projectId:p.id,region:{...region,sourceId:'unknown'},imageDataUrl}),/원본 파일/);
 assert.throws(()=>store.addSources(p.id,[files[2],files[3]+'.missing']));assert.equal(store.get(p.id).sources.length,2);assert.equal(store.get(p.id).problems.length,0);
 assert.equal(fs.readdirSync(path.join(store.projectDir(p.id),'assets')).length,2);
});
test('duplicate source filenames do not overwrite source bytes or problem captures',t=>{
 const {store,files}=setup(t);const p=store.create([files[2],files[2]]);assert.notEqual(p.sources[0].path,p.sources[1].path);assert.deepEqual(fs.readFileSync(p.sources[0].path),fs.readFileSync(p.sources[1].path));
});

test('closing a source requires confirmation for related questions and preserves other files and results',t=>{
 const {store,files}=setup(t);let p=store.create(files.slice(0,3));
 for(const source of p.sources)p=store.addRegion({projectId:p.id,region:{...region,sourceId:source.id},imageDataUrl});
 const second=p.sources[1],keep=structuredClone(p.problems[2]);
 assert.throws(()=>store.closeSource({projectId:p.id,sourceId:second.id}),/확인/);
 assert.equal(store.get(p.id).problems.length,3);
 const result=store.closeSource({projectId:p.id,sourceId:second.id,removeProblems:true});
 assert.equal(result.project.sources.length,2);assert.equal(result.project.problems.length,2);assert.deepEqual(result.project.problems[1],keep);
 assert.equal(result.removedProblemIds[0],p.problems[1].id);assert.ok(fs.existsSync(second.path));assert.ok(fs.existsSync(files[1]));
 assert.deepEqual(new ProjectStore(store.dataDir).get(p.id).sources,result.project.sources);
});

test('closing the primary file promotes the next source without losing its crop identity or review state',t=>{
 const {store,files}=setup(t);let p=store.create(files.slice(0,3));const second=p.sources[1];
 p=store.addRegion({projectId:p.id,region:{...region,sourceId:second.id},imageDataUrl});
 p=store.updateProblem(p.id,p.problems[0].id,q=>{q.recognition={confirmed:true};q.messages=[{text:'유지'}];});
 const result=store.closeSource({projectId:p.id,sourceId:'primary'}),saved=new ProjectStore(store.dataDir).get(p.id);
 assert.equal(result.promotedSourceId,second.id);assert.equal(saved.sources[0].id,'primary');assert.equal(saved.source.path,second.path);assert.equal(saved.source.name,second.name);
 assert.equal(saved.problems[0].regions[0].sourceId,'primary');assert.deepEqual(saved.problems[0].cropPaths,p.problems[0].cropPaths);assert.deepEqual(saved.problems[0].recognition,{confirmed:true});
 assert.deepEqual(saved.problems[0].messages,[{text:'유지'}]);
});

test('closing the final file returns an empty workspace while retaining the saved work',t=>{
 const {store,files}=setup(t);const p=store.create(files[0]);
 assert.throws(()=>store.closeSource({projectId:p.id,sourceId:'unknown'}));
 const result=store.closeSource({projectId:p.id,sourceId:'primary'});assert.equal(result.project,null);assert.equal(store.last(),null);assert.deepEqual(store.get(p.id),p);assert.equal(store.list()[0].id,p.id);
});
test('new workspace clears startup selection without deleting saved sources, problems or recent work',t=>{
 const {store,files}=setup(t);let p=store.create(files.slice(0,2));p=store.addRegion({projectId:p.id,region,imageDataUrl});
 const savedFile=path.join(store.projectDir(p.id),'project.json'),before=fs.readFileSync(savedFile),recent=store.list();
 store.closeCurrent();assert.equal(store.last(),null);assert.deepEqual(store.list(),recent);assert.deepEqual(fs.readFileSync(savedFile),before);
 const reloaded=new ProjectStore(store.dataDir);assert.equal(reloaded.last(),null);assert.deepEqual(reloaded.get(p.id),p);
 reloaded.write(reloaded.get(p.id));assert.equal(reloaded.last().id,p.id);
});
