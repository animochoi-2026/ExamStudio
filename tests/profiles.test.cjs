const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ProfileStore}=require('../app/profiles.cjs');
test('range profiles preserve base settings, copy all parts, persist selection, rename and delete safely',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'exam-profiles-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const store=new ProfileStore(directory),base=store.read();base.common='사용자 원래 공통';store.save(base);
 assert.equal(store.snapshot().autoClassify,true);
 store.change({action:'automatic',enabled:false});assert.equal(new ProfileStore(directory).snapshot().autoClassify,false);
 let state=store.change({action:'create',name:'중2 기말'});const first=state.activeId;assert.equal(state.values.common,base.common);
 const edited=state.values;edited.common='닮음까지만 사용';edited.parts.geometry='닮음으로 풀기';store.save(edited);
 state=store.change({action:'create',name:'중3 기말'});const second=state.activeId;assert.deepEqual(state.values,edited);
 state=store.change({action:'select',id:''});assert.deepEqual(state.values,base);
 store.change({action:'select',id:first});assert.deepEqual(new ProfileStore(directory).read(),edited);
 store.change({action:'rename',id:first,name:'중2 닮음'});assert.equal(store.snapshot().activeName,'중2 닮음');
 assert.throws(()=>store.change({action:'create',name:'중2 닮음'}),/같은 이름/);
 assert.throws(()=>store.change({action:'select',id:'missing'}),/찾을 수/);
 store.change({action:'delete',id:first});assert.deepEqual(store.read(),base);
 assert.equal(store.snapshot().profiles[0].id,second);
 fs.writeFileSync(store.file,'broken');assert.throws(()=>store.read(),/보존/);assert.equal(fs.readFileSync(store.file,'utf8'),'broken');
});
