const test=require('node:test'),assert=require('node:assert/strict');
test('bounded print preparation preserves order and settles readers on failure',async()=>{
 const {preparePrintItems}=await import('../web-bank/print-prefetch.js');let active=0,max=0;
 const result=await preparePrintItems([0,1,2,3,4,5],async n=>{max=Math.max(max,++active);await new Promise(r=>setTimeout(r,(6-n)*3));active--;return n;},{concurrency:3});
 assert.deepEqual(result,[0,1,2,3,4,5]);assert.equal(max,3);assert.equal(active,0);
 let completed=0;await assert.rejects(()=>preparePrintItems([0,1,2,3],async n=>{await new Promise(r=>setTimeout(r,n?20:1));completed++;if(!n)throw Error('broken');return n;},{concurrency:2}),/broken/);assert.equal(completed,2);
 await assert.rejects(()=>preparePrintItems([1],()=>assert.fail(),{current:()=>false}),/취소/);
});
