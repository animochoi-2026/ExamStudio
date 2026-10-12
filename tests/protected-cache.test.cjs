const test=require('node:test'),assert=require('node:assert/strict'),{createCache}=require('../web-bank/protected-cache.cjs');
test('cache keys include account scope, filter, sort, page; expires and invalidates without stale repopulation',async()=>{
 let now=0,calls=0;const c=createCache({now:()=>now,ttl:60});c.setScope({user:'A',role:'owner'});const load=()=>({n:++calls});
 assert.equal((await c.get({page:0,filter:'killer'},load)).n,1);assert.equal((await c.get({filter:'killer',page:0},load)).n,1);
 assert.equal((await c.get({filter:'killer',page:1},load)).n,2);assert.equal((await c.get({filter:'middle',page:0},load)).n,3);
 now=61;assert.equal((await c.get({page:0,filter:'killer'},load)).n,4);c.setScope({user:'B',role:'teacher'});assert.equal((await c.get({page:0,filter:'killer'},load)).n,5);
 let resolve;const pending=c.get('slow',()=>new Promise(r=>resolve=r));await Promise.resolve();c.clear();resolve({secret:'old'});await assert.rejects(pending,/변경/);assert.equal((await c.get('slow',load)).n,6);
});
