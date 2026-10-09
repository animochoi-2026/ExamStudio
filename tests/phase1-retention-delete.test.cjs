'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ProjectStore}=require('../app/store.cjs'),retention=require('../app/project-retention.cjs');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'exam-retention-delete-'));t.after(()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});});
 const store=new ProjectStore(path.join(root,'data')),recent=[];
 const write=(file,content)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);return file;};
 const file=(id,name)=>path.join(store.projectDir(id),name);
 for(let i=1;i<=7;i++){const id='p'+i;write(file(id,'project.json'),JSON.stringify({id,title:id,updatedAt:`2026-01-0${i}`,problems:[],source:{path:file(id,'assets/source.pdf')}}));write(file(id,'assets/source.pdf'),'copy '+id);write(file(id,'cache/response.json'),'cache '+id);recent.push({id});}
 write(store.indexFile,JSON.stringify({lastId:'p7',recent}));
 const edit=(id,fn)=>{const f=file(id,'project.json'),p=JSON.parse(fs.readFileSync(f));fn(p);write(f,JSON.stringify(p));};
 return {root,store,write,file,edit,apply:()=>retention.apply(store,{token:retention.plan(store).token,confirmed:true})};
}
test('retention deletes project, exclusive assets/cache; preserves external original, exports, shared and hard-linked files',t=>{
 const f=fixture(t),original=f.write(path.join(f.root,'external','source.pdf'),'user original'),outside=f.write(path.join(f.root,'saved.docx'),'external output');
 f.edit('p1',p=>{p.originalPath=original;p.output=outside;});
 const exported=f.write(f.file('p1','exports/paper.pdf'),'printed output'),shared=f.write(f.file('p1','assets/shared.png'),'shared diagram');
 f.edit('p7',p=>{p.history=[{sourceFigure:{path:shared}}];});
 const linked=f.file('p1','assets/linked.png');fs.linkSync(original,linked);
 const snapshot=fs.readFileSync(f.file('p7','project.json'));f.store.cache.set('p1',{id:'p1'});
 const result=f.apply();assert.deepEqual(result.deleted,['p2','p1']);assert.deepEqual(result.failed,[]);assert.ok(result.bytes>0);
 for(const name of ['project.json','assets/source.pdf','cache/response.json'])assert.equal(fs.existsSync(f.file('p1',name)),false,name);
 assert.equal(fs.existsSync(f.store.projectDir('p2')),false);assert.equal(f.store.cache.has('p1'),false);
 for(const [file,bytes]of [[original,'user original'],[outside,'external output'],[exported,'printed output'],[shared,'shared diagram'],[linked,'user original']])assert.equal(fs.readFileSync(file,'utf8'),bytes);
 assert.deepEqual(fs.readFileSync(f.file('p7','project.json')),snapshot);assert.equal(retention.plan(f.store).candidates.length,0);
});
test('cancel and file/reference/index changes invalidate confirmation without deleting anything',t=>{
 const f=fixture(t),before=retention.plan(f.store);assert.throws(()=>retention.apply(f.store,{token:before.token,confirmed:false}),/확인/);
 for(const change of [()=>f.write(f.file('p1','assets/source.pdf'),'changed bytes'),()=>f.edit('p7',p=>{p.shared=f.file('p1','assets/source.pdf');}),()=>f.write(f.file('p1','assets/new.png'),'new'),()=>{const i=JSON.parse(fs.readFileSync(f.store.indexFile));i.lastId='p1';f.write(f.store.indexFile,JSON.stringify(i));}]){
  const p=retention.plan(f.store);change();assert.throws(()=>retention.apply(f.store,{token:p.token,confirmed:true}),/변경/);assert.ok(fs.existsSync(f.file('p1','project.json')));assert.ok(fs.existsSync(f.file('p2','project.json')));
 }
});
test('current/running and bank pending work stay protected',t=>{
 const f=fixture(t);const i=JSON.parse(fs.readFileSync(f.store.indexFile));i.lastId='p1';f.write(f.store.indexFile,JSON.stringify(i));f.edit('p2',p=>{p.problems=[{runs:[{status:'running'}]}];});assert.equal(retention.plan(f.store).candidates.length,0);
 i.lastId='p7';f.write(f.store.indexFile,JSON.stringify(i));f.edit('p2',p=>{p.problems=[];});
 f.write(path.join(f.store.dataDir,'shared-banks','test','question-bank','state.json'),JSON.stringify({dirty:[{projectId:'p1'}],jobs:[{projectId:'p2',status:'failed'}]}));assert.equal(retention.plan(f.store).candidates.length,0);
});
test('unknown ownership blocks only that project; external paths never become deletion targets',t=>{
 const f=fixture(t),outside=f.write(path.join(f.root,'data-other','important.pdf'),'external');
 f.edit('p2',p=>{p.source.path=outside;p.history=[{path:'../../../../important.pdf'}];});f.write(f.file('p1','personal.txt'),'unknown owner');
 const plan=retention.plan(f.store);assert.deepEqual(plan.candidates.map(p=>p.id),['p2']);assert.match(plan.excluded.find(p=>p.id==='p1').reason,/소유권/);
 const result=f.apply();assert.deepEqual(result.deleted,['p2']);assert.equal(fs.readFileSync(outside,'utf8'),'external');assert.ok(fs.existsSync(f.file('p1','project.json')));
});
test('junction inside a candidate is not followed and only that target is excluded',t=>{
 const f=fixture(t),external=path.join(f.root,'outside');f.write(path.join(external,'keep.png'),'outside');
 fs.symlinkSync(external,f.file('p1','assets/linked-directory'),process.platform==='win32'?'junction':'dir');
 const plan=retention.plan(f.store);assert.deepEqual(plan.candidates.map(p=>p.id),['p2']);assert.match(plan.excluded.find(p=>p.id==='p1').reason,/링크|정션/);
 f.apply();assert.equal(fs.readFileSync(path.join(external,'keep.png'),'utf8'),'outside');assert.ok(fs.existsSync(f.file('p1','project.json')));
});
test('relative shared references and bank-state references preserve assets while deleting other owned files',t=>{
 const f=fixture(t),shared=f.write(f.file('p1','assets/shared.png'),'relative shared'),bank=f.write(f.file('p1','assets/bank.png'),'bank shared');
 f.edit('p7',p=>{p.source.path=path.relative(f.store.projectDir('p7'),shared);});
 f.write(path.join(f.store.dataDir,'question-bank','state.json'),JSON.stringify({jobs:[],dirty:[],items:{x:{sourcePath:bank}}}));
 const result=f.apply();assert.deepEqual(result.deleted,['p2','p1']);assert.equal(fs.readFileSync(shared,'utf8'),'relative shared');assert.equal(fs.readFileSync(bank,'utf8'),'bank shared');assert.equal(fs.existsSync(f.file('p1','assets/source.pdf')),false);
});
