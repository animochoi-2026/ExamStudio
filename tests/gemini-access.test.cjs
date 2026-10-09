const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {GeminiAccessStore,blockedGeminiStatus}=require('../app/gemini-access.cjs');
test('Gemini subscription defaults to unknown and never infers payment from remaining quota',()=>{
 assert.equal(blockedGeminiStatus('unknown').subscription.status,'unknown');assert.equal(blockedGeminiStatus('unknown').available,false);
 assert.match(blockedGeminiStatus('unsubscribed').error,/미구독/);assert.equal(blockedGeminiStatus('unsubscribed').available,false);assert.equal(blockedGeminiStatus('subscribed'),null);
 assert.throws(()=>blockedGeminiStatus('invalid'));
});
test('user subscription choice persists separately and invalid input preserves prior settings',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gemini-access-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=new GeminiAccessStore(dir);assert.equal(store.read(),'unknown');assert.equal(fs.existsSync(store.file),false);
 const modelFile=path.join(dir,'gemini-settings.json');fs.writeFileSync(modelFile,'original model');store.save('subscribed');assert.equal(new GeminiAccessStore(dir).read(),'subscribed');store.save('unsubscribed');assert.equal(store.read(),'unsubscribed');
 const before=fs.readFileSync(store.file,'utf8');assert.throws(()=>store.save('invalid'));assert.equal(fs.readFileSync(store.file,'utf8'),before);assert.equal(fs.readFileSync(modelFile,'utf8'),'original model');
});
