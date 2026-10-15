const test=require('node:test'),assert=require('node:assert/strict');
test('output preparation has a deadline even when a reader ignores abort',async()=>{
 const {outputLifetime}=await import('../web-bank/output-lifetime.js');const life=outputLifetime(null,20);
 await assert.rejects(life.wait(new Promise(()=>{})),/준비 시간이 초과/);assert.equal(life.current(),false);life.close();
});
test('cancel rejects preparation and late completion cannot revive its lifetime',async()=>{
 const {outputLifetime}=await import('../web-bank/output-lifetime.js'),controller=new AbortController(),life=outputLifetime(controller.signal);let finish;
 const pending=life.wait(new Promise(resolve=>finish=resolve));controller.abort(Error('취소'));await assert.rejects(pending,/취소/);finish('late');assert.equal(life.current(),false);life.close();
});
test('independent output starts with a fresh lifetime',async()=>{
 const {outputLifetime}=await import('../web-bank/output-lifetime.js'),first=outputLifetime();first.close();const next=outputLifetime();assert.equal(await next.wait(Promise.resolve('ready')),'ready');assert.equal(next.current(),true);next.close();
});
