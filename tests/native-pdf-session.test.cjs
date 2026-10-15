const test=require('node:test'),assert=require('node:assert/strict');
const storage=()=>{const data=new Map([['sessionId','expired']]);return {data,get:async k=>data.get(k),put:async(k,v)=>data.set(k,v),delete:async k=>data.delete(k)};};
test('expired browser recovers before rendering, not after a render begins',async()=>{
 const {openRenderSession,releaseRenderSession}=await import('../services/pdf-renderer/session.mjs');const s=storage();let launches=0,disconnects=0;
 const context={close:async()=>{}},browser={createBrowserContext:async()=>context,sessionId:()=> 'fresh',disconnect:async()=>{disconnects++;}};
 const driver={connect:async()=>({createBrowserContext:async()=>{throw Error('Target closed');},disconnect:async()=>{disconnects++;}}),launch:async()=>{launches++;return browser;}};
 const result=await openRenderSession(driver,{},s);assert.equal(result.context,context);assert.equal(launches,1);assert.equal(s.data.get('sessionId'),'fresh');assert.equal(disconnects,1);await releaseRenderSession(result,s);assert.equal(disconnects,2);
});
test('cleanup errors do not replace a completed PDF or original failure',async()=>{
 const {releaseRenderSession}=await import('../services/pdf-renderer/session.mjs');const s=storage();let disconnected=false;
 await assert.doesNotReject(releaseRenderSession({context:{close:async()=>{throw Error('Connection closed');}},browser:{disconnect:async()=>{disconnected=true;throw Error('Closed');}}},s));
 assert(disconnected);assert.equal(s.data.has('sessionId'),false);
});
test('fresh launch failure is surfaced without repeated rendering or an immortal session',async()=>{
 const {openRenderSession}=await import('../services/pdf-renderer/session.mjs');const s=storage();let launches=0;
 await assert.rejects(openRenderSession({connect:async()=>{throw Error('Expired');},launch:async()=>{launches++;return {createBrowserContext:async()=>{throw Error('Unavailable');},disconnect:async()=>{}};}},{},s),/Unavailable/);
 assert.equal(launches,1);assert.equal(s.data.has('sessionId'),false);
});
test('last render releases paid browser time, while queued work retains the session',async()=>{
 const {releaseRenderSession}=await import('../services/pdf-renderer/session.mjs');let closes=0,disconnects=0,contexts=0;const s=storage(),session={context:{close:async()=>{contexts++;}},browser:{close:async()=>{closes++;},disconnect:async()=>{disconnects++;}}};
 await releaseRenderSession(session,s,{closeIdle:false});assert.equal(closes,0);assert.equal(disconnects,1);assert(s.data.has('sessionId'));
 await releaseRenderSession(session,s,{closeIdle:true});assert.equal(closes,1);assert.equal(disconnects,1);assert.equal(contexts,2);assert.equal(s.data.has('sessionId'),false);
 await assert.doesNotReject(releaseRenderSession({browser:{close:async()=>{throw Error('Already closed');}}},s,{closeIdle:true}));
});
