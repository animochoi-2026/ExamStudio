const test=require('node:test'),assert=require('node:assert/strict');
const items=[{questionId:'q1',revisionId:'r1'},{questionId:'q2',revisionId:'r2'}];
test('same paper reflow and reorder reuse verified registry, with isolated returned values',async()=>{
 const {previewSetRegistry}=await import('../web-bank/preview-set-registry.js'),cache=previewSetRegistry();let calls=0;const load=async()=>{calls++;return [{id:'pair',members:[{questionId:'q1'},{questionId:'q2'}],complete:true}];};
 const first=await cache.get(items,load);first[0].complete=false;
 assert.equal((await cache.get([...items].reverse(),load))[0].complete,true);assert.equal(calls,1);
});
test('changed membership, revision, explicit refresh and new editor query again',async()=>{
 const {previewSetRegistry}=await import('../web-bank/preview-set-registry.js'),cache=previewSetRegistry();let calls=0;const load=async()=>{calls++;return [];};
 await cache.get(items,load);await cache.get(items.slice(0,1),load);await cache.get([{questionId:'q1',revisionId:'r3'}],load);cache.clear();await cache.get([{questionId:'q1',revisionId:'r3'}],load);await previewSetRegistry().get(items,load);assert.equal(calls,5);
});
test('failed and malformed responses are never cached or replaced with empty sets',async()=>{
 const {previewSetRegistry}=await import('../web-bank/preview-set-registry.js'),cache=previewSetRegistry();
 await assert.rejects(cache.get(items,async()=>{throw Error('timeout');}),/timeout/);await assert.rejects(cache.get(items,async()=>null),/형식/);assert.deepEqual(await cache.get(items,async()=>[{id:'real-set',complete:false}]),[{id:'real-set',complete:false}]);
});
test('a stale request cannot overwrite a newer registry',async()=>{
 const {previewSetRegistry}=await import('../web-bank/preview-set-registry.js'),cache=previewSetRegistry();let release;
 const old=cache.get(items,()=>new Promise(r=>release=r));const changed=items.slice(0,1);await cache.get(changed,async()=>[{id:'new'}]);release([{id:'old'}]);await old;assert.deepEqual(await cache.get(changed,async()=>{throw Error('unexpected read');}),[{id:'new'}]);
});
