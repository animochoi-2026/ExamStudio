const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('retired renderer cannot dispatch to a browser or Durable Object',async()=>{
 const {default:worker,PdfRenderer}=await import('../services/pdf-renderer/retired.mjs');
 let calls=0;const env={RENDER_SECRET:'fixture',PDF_RENDERER:{get(){calls++;throw Error('must not run');}},BROWSER:new Proxy({},{get(){calls++;throw Error('must not run');}})};
 assert.equal((await worker.fetch(new Request('https://fixture',{method:'POST'}),env)).status,403);
 assert.equal((await worker.fetch(new Request('https://fixture',{method:'POST',headers:{authorization:'Bearer fixture'}}),env)).status,410);
 assert.equal((await new PdfRenderer().fetch()).status,410);assert.equal(calls,0);
 const config=JSON.parse(fs.readFileSync('services/pdf-renderer/wrangler.jsonc','utf8'));
 assert.equal(config.main,'retired.mjs');assert.equal(config.browser,undefined);
});
