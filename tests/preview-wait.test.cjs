const test=require('node:test'),assert=require('node:assert/strict');
test('preview waits explain stalled resources and accept a later independent retry',async()=>{
 const {previewWait}=await import('../web-bank/preview-wait.js'),c=new AbortController(),wait=previewWait(c.signal,{timeoutMs:15});
 await assert.rejects(wait(new Promise(()=>{}),'폼 로고'),/폼 로고 응답이 지연.*배치 다시 시도/);
 assert.equal(await wait(Promise.resolve('ready')),'ready');
});
test('superseded preview wait cancels promptly and ignores a late result',async()=>{
 const {previewWait}=await import('../web-bank/preview-wait.js'),c=new AbortController();let release;
 const p=previewWait(c.signal)(new Promise(r=>release=r),'글꼴');c.abort();await assert.rejects(p,{name:'AbortError'});release('late');
 await assert.rejects(previewWait(c.signal)(Promise.resolve('ready')),{name:'AbortError'});
});
test('resource errors are preserved rather than treated as a usable layout',async()=>{
 const {previewWait}=await import('../web-bank/preview-wait.js');
 await assert.rejects(previewWait(new AbortController().signal)(Promise.reject(Error('image unavailable'))),/image unavailable/);
});
