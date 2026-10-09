const test=require('node:test'),assert=require('node:assert/strict');
const {forbiddenConcepts}=require('../app/scope-check.cjs'),{DEFAULT_SCOPE}=require('../app/rules.cjs');
const {modelUsage}=require('../app/antigravity.cjs');
test('audit 6: explicit non-use is distinct from actual use and English substrings',()=>{
 const scan=(text,usedConcepts=[])=>forbiddenConcepts(DEFAULT_SCOPE,{usedConcepts},text);
 assert.deepEqual(scan('피타고라스 정리를 사용하지 않고 합동으로 풀었다.'),[]);
 assert.deepEqual(scan('닮음 대신 합동을 쓰며 삼각비 없이 계산한다. using a constant'),[]);
 assert.deepEqual(scan('피타고라스를 사용하지 않고 풀었다. 그러나 피타고라스 정리를 적용하면 된다.'),['피타고라스 정리']);
 assert.deepEqual(scan('피타고라스를 사용하지 않았다.',['피타고라스 정리']),['피타고라스 정리']);
 assert.deepEqual(scan('sin(30°)을 이용한다.'),['삼각비']);
});
test('audit 10: quotas disable only known affected models and keep unknown mappings usable',()=>{
 const models=[{model:'gemini-a'},{model:'gemini-b'}];
 const groups=[{name:'Gemini A',models:['gemini-a'],buckets:[{window:'weekly',remaining_fraction:0}]},{name:'Gemini B',models:['gemini-b'],buckets:[{window:'weekly',remaining_fraction:.8}]}];
 let result=modelUsage(models,groups);assert.equal(result.available,true);assert.deepEqual(result.models.map(m=>m.available),[false,true]);assert.deepEqual(result.buckets,[]);
 result=modelUsage(models,groups.map(({models,...g})=>g));assert.equal(result.available,true);assert.ok(result.models.every(m=>m.available));assert.ok(result.models.every(m=>m.buckets.length===0));
 result=modelUsage(models,[{name:'Gemini shared',buckets:[{remaining_fraction:0}]}]);assert.equal(result.available,false);
});

test('audit 10: one explicitly mapped quota does not disable other models',async()=>{
 const {AntigravityBridge}=require('../app/antigravity.cjs'),events=[];
 const account=modelUsage([{model:'gemini-a'},{model:'gemini-b'}],[{name:'Gemini A',models:['gemini-a'],buckets:[{remaining_fraction:0}]}]);
 assert.equal(account.available,true);assert.deepEqual(account.models.map(m=>m.available),[false,true]);
 const bridge=new AntigravityBridge({cwd:__dirname,requestsDir:__dirname,onEvent:e=>events.push(e)});bridge.getAccount=async()=>account;
 await assert.rejects(bridge.run({context:{id:'p'},text:'test',model:'gemini-a'}),/다른 Gemini 모델/);
 assert.equal(events.at(-1).available,true);assert.equal(events.at(-1).type,'gemini-availability');
});
test('audit 16: digest cache is bounded, compatible and invalidated on content change',t=>{
 const fs=require('fs'),os=require('os'),path=require('path'),{FileDigests}=require('../app/file-digests.cjs'),{hash}=require('../app/rules.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'digest-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const cache=new FileDigests(2),a=path.join(dir,'a');fs.writeFileSync(a,'one');const oldStat=fs.statSync(a),old=cache.get(a);assert.equal(old,hash(Buffer.from('one').toString('base64')));assert.equal(cache.get(a),old);
 fs.writeFileSync(a,'two');fs.utimesSync(a,oldStat.atime,oldStat.mtime);assert.notEqual(cache.get(a),old);
 for(const name of ['b','c']){const f=path.join(dir,name);fs.writeFileSync(f,name);cache.get(f);}assert.equal(cache.entries.size,2);assert.equal(cache.entries.has(a),false);
});
test('audit 16: request cleanup removes only owned files inside a UUID child',t=>{
 const fs=require('fs'),os=require('os'),path=require('path'),{randomUUID}=require('crypto'),{removeRequestFiles}=require('../app/request-files.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'request-clean-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const folder=path.join(root,randomUUID());fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'request.txt'),'private');fs.writeFileSync(path.join(folder,'keep.txt'),'user');removeRequestFiles(root,folder);assert.deepEqual(fs.readdirSync(folder),['keep.txt']);
 const outside=path.join(root,'other');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'request.txt'),'keep');removeRequestFiles(root,outside);assert.ok(fs.existsSync(path.join(outside,'request.txt')));
});

test('Windows atomic save retries transient locks but preserves the original on permanent failure',{skip:process.platform!=='win32'},t=>{
 const fs=require('fs'),os=require('os'),path=require('path'),{atomicWrite}=require('../app/store.cjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atomic-lock-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'data.json');atomicWrite(file,{version:1});const rename=fs.renameSync;let calls=0;
 const mock=t.mock.method(fs,'renameSync',(...args)=>{if(++calls<3)throw Object.assign(Error('locked'),{code:'EPERM'});return rename(...args);});atomicWrite(file,{version:2});assert.equal(calls,3);assert.deepEqual(JSON.parse(fs.readFileSync(file)),{version:2});
 mock.mock.mockImplementation(()=>{throw Object.assign(Error('permanent lock'),{code:'EPERM'});});assert.throws(()=>atomicWrite(file,{version:3}),/permanent lock/);assert.deepEqual(JSON.parse(fs.readFileSync(file)),{version:2});assert.deepEqual(fs.readdirSync(dir),['data.json']);
});

test('source numbering is removed without deleting numeric conditions or decimal values',()=>{
 const {withoutSourceNumber}=require('../app/question-text.cjs');for(const text of ['12. 그림에서','12) 그림에서','[12] 그림에서','문제 12번 그림에서'])assert.equal(withoutSourceNumber(text),'그림에서');for(const text of ['3.14를 곱한다','2개의 삼각형','(1) 다음을 구하라'])assert.equal(withoutSourceNumber(text),text);
 const {scopeText,DEFAULT_SCOPE}=require('../app/rules.cjs');const prompt=scopeText(DEFAULT_SCOPE);assert.match(prompt,/이전 학년·학기·단원/);assert.match(prompt,/외심에서 꼭짓점/);assert.match(prompt,/명시된 금지 개념은 계속 금지/);
});
