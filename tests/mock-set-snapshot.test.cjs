const test=require('node:test'),assert=require('node:assert/strict');
test('one candidate registry read supplies the snapshot and preserves error details on bounded retry',async()=>{
 const {enrichMockSets,getSets}=await import('../web-bank/question-set-client.js');let calls=0;
 const timeout={code:'57014',message:'canceling statement due to statement timeout'};
 const client={rpc:()=>({abortSignal:async()=>++calls===1?{error:timeout,status:500}:{data:[]}})};
 const snapshot=await enrichMockSets(client,{spaceId:'s'},{candidates:[],excludeIds:['keep']});
 assert.deepEqual(snapshot,{candidates:[],excludeIds:['keep'],setRegistry:[]});assert.equal(calls,2);
 calls=0;client.rpc=()=>({abortSignal:async()=>{calls++;return {error:timeout,status:500};}});
 await assert.rejects(getSets(client,{spaceId:'s'}),e=>e.code==='57014'&&e.originalMessage===timeout.message&&e.status===500);assert.equal(calls,2);
 calls=0;client.rpc=()=>({abortSignal:async()=>{calls++;return {error:{code:'42501',message:'permission denied'},status:403};}});
 await assert.rejects(getSets(client,{spaceId:'s'}),e=>e.code==='42501');assert.equal(calls,1);
 const abort=new AbortController();abort.abort();calls=0;
 await assert.rejects(getSets(client,{spaceId:'s'},{signal:abort.signal}),{name:'AbortError'});assert.equal(calls,0);
});
