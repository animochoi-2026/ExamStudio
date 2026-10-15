const test=require('node:test'),assert=require('node:assert/strict');
const {renderLifetime}=require('../app/pdf-render-lifetime.cjs');
function window(){let closed=0;return {isDestroyed:()=>closed>0,destroy(){closed++;},get closed(){return closed;}};}
test('successful local PDF closes its hidden renderer immediately',async()=>{
 const win=window();assert.equal(await renderLifetime(win,async()=>42),42);assert.equal(win.closed,1);
});
test('stalled local PDF fails, releases renderer, and permits a fresh retry',async()=>{
 const win=window();await assert.rejects(renderLifetime(win,()=>new Promise(()=>{}),{timeoutMs:15}),/초과/);assert.equal(win.closed,1);
 const retry=window();assert.equal(await renderLifetime(retry,async()=>'PDF'),'PDF');assert.equal(retry.closed,1);
});
test('resource failure is preserved and an already destroyed window is safe',async()=>{
 const win=window();win.destroy();await assert.rejects(renderLifetime(win,async()=>{throw Error('image decode failed');}),/image decode/);assert.equal(win.closed,1);
});
test('a late render result cannot publish after timeout',async()=>{
 const win=window();let finish,published=false;
 await assert.rejects(renderLifetime(win,async check=>{await new Promise(r=>finish=r);check();published=true;},{timeoutMs:15}),/초과/);
 finish();await new Promise(r=>setImmediate(r));assert.equal(published,false);
});
