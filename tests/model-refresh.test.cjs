'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{CodexBridge}=require(require('node:path').join(process.env.EXAM_TEST_CODE_ROOT||require('node:path').resolve(__dirname,'..'),'app/codex.cjs'));
test('automatic account refresh coalesces calls and respects successful/failure cache windows',async()=>{
 const b=new CodexBridge(),calls=[];let fail=false,release;b._getAccount=async()=>{calls.push(1);if(release)await new Promise(r=>release=r);return {account:{type:'chatgpt'},models:b.models,error:fail?'조회 실패':undefined};};
 b.models=[{model:'advertised',supportedReasoningEfforts:['high']}];await b.getAccount();await b.getAccount();assert.equal(calls.length,1);
 b.rateLimits={latest:true};assert.deepEqual((await b.getAccount()).rateLimits,{latest:true});
 await b.getAccount({force:true});assert.equal(calls.length,2);b.accountCheckedAt-=300001;await b.getAccount();assert.equal(calls.length,3);
 fail=true;await b.getAccount({force:true});const r=await b.getAccount();assert.equal(calls.length,4);assert.equal(r.models[0].model,'advertised');assert.equal(r.error,'조회 실패');b.accountCheckedAt-=60001;await b.getAccount();assert.equal(calls.length,5);
 let n=0;b._getAccount=async()=>{n++;await new Promise(r=>release=r);return {models:[]};};b.accountResult=null;const p=b.getAccount(),q=b.getAccount();assert.equal(n,1);release();await Promise.all([p,q]);assert.equal(n,1);
});
test('actual catalog success updates models; model-list error preserves the last list and error',async()=>{
 const b=new CodexBridge();b.start=async()=>{};let failed=false;b._request=async method=>{if(method==='account/read')return {account:{type:'chatgpt'}};if(method==='model/list'){if(failed)throw Error('오프라인');return {data:[{id:'server-id',model:'server-model',displayName:'실제 모델',supportedReasoningEfforts:['high']}],nextCursor:null};}return {};};
 const first=await b.getAccount();assert.equal(first.models[0].model,'server-model');failed=true;const second=await b.getAccount({force:true});assert.equal(second.models[0].model,'server-model');assert.match(second.error,/오프라인/);assert.deepEqual(second.models[0].supportedReasoningEfforts,['high']);
});

test('account notifications refresh the catalog despite an unexpired account cache',async()=>{
 const b=new CodexBridge();let reads=0;const events=[];b.emit=event=>events.push(event);b._getAccount=async()=>{reads++;b.models=[{model:reads===1?'previous':'newly-advertised',supportedReasoningEfforts:['high']}];return {models:b.models};};
 await b.getAccount();assert.equal(reads,1);b._message({method:'account/updated',params:{}});await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,2);assert.equal(events[0].models[0].model,'newly-advertised');
 b.loginId='pending-login';b._message({method:'account/login/completed',params:{loginId:'pending-login'}});await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,3);assert.equal(b.loginId,null);
});
