'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const codeRoot=process.env.EXAM_TEST_CODE_ROOT?path.resolve(process.env.EXAM_TEST_CODE_ROOT):path.resolve(__dirname,'..');
const {ProjectStore,atomicWrite}=require(path.join(codeRoot,'app/store.cjs')),{cleanTitle,creationDate}=require(path.join(codeRoot,'app/project-folders.cjs'));

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/bX8AAAAASUVORK5CYII=','base64');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'exam-project-names-'));t.after(()=>{assert.equal(path.dirname(root),fs.realpathSync(os.tmpdir()));assert(path.basename(root).startsWith('exam-project-names-'));fs.rmSync(root,{recursive:true,force:true});});const store=new ProjectStore(path.join(root,'data'));return {root,store};}
function legacy(store,id,title='한글 작업',createdAt='2026-10-01T23:30:00.000Z'){
 const folder=path.join(store.projectsDir,id),asset=path.join(folder,'assets','source.png');fs.mkdirSync(path.dirname(asset),{recursive:true});fs.writeFileSync(asset,png);
 const p={version:1,id,title,createdAt,updatedAt:'2026-10-03T00:00:00.000Z',source:{path:asset,originalName:'원본.png'},settings:{},problems:[{id:'p',cropPaths:[asset],regions:[],variants:[],original:{id:'q',body:'보존 문항',sourceFigure:{path:asset},materialPaths:[asset]},messages:[{text:'보존 대화'}]}],extra:{absolute:asset,relative:'assets/source.png',outside:asset+'-other'}};atomicWrite(path.join(folder,'project.json'),p);return p;
}
test('constructor never moves folders; next-start migration preserves IDs, dates, bytes and all path relationships',t=>{
 const {store}=fixture(t),old=legacy(store,'p1'),beforeIndex=fs.readFileSync(store.indexFile),source=fs.readFileSync(old.source.path);
 const reopened=new ProjectStore(store.dataDir);assert(fs.existsSync(path.join(store.projectsDir,'p1')));const result=reopened.migrateProjectFolders();assert.equal(result.moves.length,1);const folder=reopened.projectDir('p1');assert.equal(path.basename(folder),'한글 작업_'+creationDate(old.createdAt));
 const p=reopened.get('p1');assert.equal(p.id,old.id);assert.equal(p.createdAt,old.createdAt);assert.equal(p.updatedAt,old.updatedAt);assert.equal(p.problems[0].messages[0].text,'보존 대화');assert.equal(p.source.path,path.join(folder,'assets','source.png'));assert.equal(p.problems[0].original.materialPaths[0],p.source.path);assert.equal(p.extra.relative,'assets/source.png');assert.equal(p.extra.outside,p.source.path+'-other');assert.deepEqual(fs.readFileSync(p.source.path),source);assert.deepEqual(fs.readFileSync(store.indexFile),beforeIndex);
 p.title='나중에 바꾼 제목';p.createdAt='2030-01-01T00:00:00Z';reopened.save(p);assert.equal(reopened.projectDir('p1'),folder);assert.equal(reopened.get('p1').createdAt,old.createdAt);const again=new ProjectStore(store.dataDir);assert.equal(again.last().id,'p1');assert.equal(again.importProject(path.join(folder,'project.json')).id,'p1');assert.equal(again.migrateProjectFolders().moves.length,0);
});
test('case-insensitive collisions, reserved/prohibited names and long Hangul names never overwrite',t=>{
 const {store}=fixture(t);for(const id of ['a','b'])legacy(store,id,'같은 작업');legacy(store,'c','CON: 작업/시험?');legacy(store,'d','긴한글'.repeat(100));const r=store.migrateProjectFolders();assert.equal(r.moves.length,4);assert.notEqual(store.projectDir('a').toLowerCase(),store.projectDir('b').toLowerCase());assert.match(path.basename(store.projectDir('b')),/\(2\)$/);assert(!/[<>:"/\\|?*]/.test(path.basename(store.projectDir('c'))));assert(store.projectDir('d').length+49<=240);assert.equal(cleanTitle('CON'),'_CON');assert.equal(cleanTitle('시험...   '),'시험');assert.equal(cleanTitle(''),null);
});
test('unknown creation dates and metadata-less folders remain untouched; index recovery supports readable folder names',t=>{
 const {store}=fixture(t);legacy(store,'a');legacy(store,'b','날짜 미상',undefined);const b=JSON.parse(fs.readFileSync(path.join(store.projectsDir,'b','project.json')));delete b.createdAt;atomicWrite(path.join(store.projectsDir,'b','project.json'),b);fs.mkdirSync(path.join(store.projectsDir,'metadata-missing'));const r=store.migrateProjectFolders();assert.equal(r.moves.length,1);assert.equal(r.skipped.length,1);assert(fs.existsSync(path.join(store.projectsDir,'b')));assert(fs.existsSync(path.join(store.projectsDir,'metadata-missing')));fs.unlinkSync(store.indexFile);assert.deepEqual(store.list().map(p=>p.id).sort(),['a','b']);
});
test('new creations reserve stable dated names before copying; repeated saves keep one folder',t=>{
 const {root,store}=fixture(t),input=path.join(root,'한글 기출.png');fs.writeFileSync(input,png);const p=store.create(input),folder=store.projectDir(p.id);assert.match(path.basename(folder),/^한글 기출_\d{4}-\d{2}-\d{2}$/);for(let i=0;i<3;i++)store.save({...p,title:'변경 '+i});assert.equal(store.projectDir(p.id),folder);assert.equal(fs.readdirSync(store.projectsDir).length,1);assert.equal(new ProjectStore(store.dataDir).get(p.id).id,p.id);
});
test('folder/metadata duplicate IDs are rejected rather than merged',t=>{
 const {store}=fixture(t);legacy(store,'a');const extra=path.join(store.projectsDir,'별도 복사');fs.cpSync(path.join(store.projectsDir,'a'),extra,{recursive:true});assert.throws(()=>store.migrateProjectFolders(),/DUPLICATE_PROJECT_ID/);assert(fs.existsSync(path.join(store.projectsDir,'a')));assert(fs.existsSync(extra));
});
test('path-based question-only approval survives a rename only when its original source key matched',t=>{
 const {store}=fixture(t),p=legacy(store,'a'),problem=p.problems[0];problem.recognition={version:1};problem.original.version=1;problem.original.questionOnlyExport={version:1,sourceVersion:1,sourceKey:JSON.stringify(problem.cropPaths)};problem.variants=[{id:'stale',version:1,questionOnlyExport:{version:1,sourceVersion:1,sourceKey:'["different-source"]'}}];atomicWrite(path.join(store.projectsDir,'a','project.json'),p);store.migrateProjectFolders();const saved=store.get('a');assert(require('../app/source-materials.cjs').questionOnlyCurrent(saved.problems[0].original,saved.problems[0]));assert.equal(saved.problems[0].variants[0].questionOnlyExport.sourceKey,'["different-source"]');
});
