'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const inv=require('../app/source-inventory.cjs'),retention=require('../app/project-retention.cjs'),{ProjectStore}=require('../app/store.cjs');
test('objective/written inventories distinguish restarts, gaps, duplicates and uncertain labels',()=>{
 const items=[1,2,3].map(n=>({originalNumber:String(n)})).concat([{originalNumber:'서답형 1'},{originalNumber:'서답형 2'}]);
 const manifest={total:5,objectiveCount:3,writtenCount:2};assert.equal(inv.inventory(items,manifest).complete,true);
 assert.equal(inv.inventory(items,{...manifest,uncertain:true}).complete,false);
 assert.equal(inv.number('서답형 1','objective').key,null);
 const missing=inv.inventory(items.filter(x=>x.originalNumber!=='2'),manifest);assert.deepEqual(missing.missing,['objective:2']);
 assert.equal(inv.inventory([...items,items[0]],manifest).complete,false);assert.deepEqual(inv.inventory([...items,{originalNumber:'1',numbering:{section:'unknown'}}],manifest).unknown,['1']);
 assert.equal(inv.inventory([{originalNumber:'25'}],{}).expectedTotal,null);assert.equal(inv.normalize({total:4,objectiveCount:3,writtenCount:2}).uncertain,true);
 const source={school:'신구중',grade:'중2',academicYear:'2026',semester:'2학기',exam:'중간고사',originalNumber:'5'};assert.equal(inv.identity({...source,originalOrder:1}).key,inv.identity({...source,originalOrder:5}).key);
 assert.notEqual(inv.identity(source).key,inv.identity({...source,originalNumber:'서술형 5'}).key);
});
test('preserved school-exam inventories match the exact user-confirmed 25 and 24 totals',()=>{
 for(const fixture of require('./fixtures/phase1-exam-inventories.json')){
  const result=inv.inventory(fixture.observedNumbers.map(originalNumber=>({originalNumber})),fixture.manifest);
  assert.equal(result.complete,true,fixture.source.school);assert.equal(result.distinct,fixture.manifest.total);assert.deepEqual(result.missing,[]);
  assert.equal(inv.inventory(fixture.observedNumbers.slice(1).map(originalNumber=>({originalNumber})),fixture.manifest).complete,false);
 }
});
test('startup retention truly deletes exclusive copies after confirmation/CAS and preserves exports',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'exam-phase1-retention-'));try{
  const store=new ProjectStore(root),recent=[];
  for(let i=1;i<=7;i++){const dir=store.projectDir('p'+i);fs.mkdirSync(path.join(dir,'assets'),{recursive:true});fs.mkdirSync(path.join(dir,'exports'));fs.writeFileSync(path.join(dir,'assets','source.pdf'),'original '+i);fs.writeFileSync(path.join(dir,'exports','paper.docx'),'export '+i);fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify({id:'p'+i,title:'P'+i,updatedAt:`2026-01-0${i}`,problems:[]}));recent.push({id:'p'+i});}
  fs.writeFileSync(store.indexFile,JSON.stringify({lastId:'p7',recent}));const plan=retention.plan(store);assert.deepEqual(plan.candidates.map(x=>x.id),['p2','p1']);
  assert.throws(()=>retention.apply(store,{token:plan.token}),/확인/);assert.throws(()=>retention.apply(store,{token:'stale',confirmed:true}),/변경/);
  const result=retention.apply(store,{token:plan.token,confirmed:true});assert.equal(result.recent.length,5);
  assert.deepEqual(result.deleted,['p2','p1']);assert.deepEqual(result.failed,[]);
  for(let i=1;i<=7;i++){const source=path.join(store.projectDir('p'+i),'assets','source.pdf');if(i<=2){assert.equal(fs.existsSync(source),false);assert.equal(fs.existsSync(path.join(store.projectDir('p'+i),'project.json')),false);}else assert.equal(fs.readFileSync(source,'utf8'),'original '+i);assert.equal(fs.readFileSync(path.join(store.projectDir('p'+i),'exports','paper.docx'),'utf8'),'export '+i);}
  assert.equal(fs.existsSync(path.join(root,'project-archive')),false);assert.equal(retention.plan(store).candidates.length,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('new-project source 5 binds to existing question ID, preserving local content and rejecting stale selection',async()=>{
 const {resolve}=require('../app/bank-source-link.cjs'),source={kind:'학교기출',school:'신구중',grade:'중2',academicYear:'2026',semester:'2학기',exam:'중간고사',originalNumber:'5',documentId:'new-source'};
 const target={question_id:'remote-question',revision_id:'remote-revision',owner_id:'me',metadata:{source:{...source,documentId:'original-exam'}}};
 const bank={storage:{kind:'shared',sourceCandidates:async()=>[target]},auth:{status:()=>({account:{id:'me'}})},state:{items:{},sources:{local:'new-source'}},save(){}};
 const fresh=()=>({id:'local',questionId:'work-1',sourceId:'new-source',overrides:{},metadata:{source:{...source},relations:{},content:{body:'new local recognition'}}});
 const item=fresh();bank.state.items.local=item;assert.equal((await resolve(bank,item,{preview:true})).target.question_id,'remote-question');
 await assert.rejects(resolve(bank,fresh(),{selection:{questionId:'remote-question',revisionId:'stale'}}),/다른 기기/);
 await resolve(bank,item,{selection:{questionId:'remote-question',revisionId:'remote-revision'}});assert.equal(item.id,'remote-question');assert.equal(item.baseRevisionId,'remote-revision');assert.equal(item.metadata.source.originalNumber,'5');assert.equal(item.metadata.content.body,'new local recognition');assert.equal(bank.state.sources.local,'original-exam');
 const unknown=fresh();unknown.metadata.source.originalNumber=null;assert.equal((await resolve(bank,unknown,{preview:true})).required,true);await assert.rejects(resolve(bank,unknown),/명시적으로/);
});
