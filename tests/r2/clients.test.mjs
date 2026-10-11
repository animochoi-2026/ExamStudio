import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadChunk} from '../../web-bank/file-storage.js';
import desktop from '../../app/shared-bank-storage.cjs';
import {AwsClient} from '../../supabase/functions/_shared/vendor/aws4fetch-1.0.20/aws4fetch.mjs';

test('desktop R2 usage shows actual R2 bytes rather than retained Supabase originals',async()=>{
 const calls=[];const auth={config:()=>({spaceId:'s',storageGateway:true}),token:async()=>'caller',request:async(route,options)=>{calls.push({route,options});return route.includes('/rpc/')?{questions:7,actualStorageBytes:800}:{provider:'r2',r2Bytes:1200,r2Objects:9};}};
 const result=await new desktop.SharedBankStorage({auth}).usage();assert.equal(result.actualStorageBytes,1200);assert.equal(result.supabaseStorageBytes,800);assert.equal(result.questions,7);assert.equal(result.r2Objects,9);assert.equal(calls[1].options.token,'caller');
 auth.config=()=>({spaceId:'s'});calls.length=0;assert.deepEqual(await new desktop.SharedBankStorage({auth}).usage(),{questions:7,actualStorageBytes:800});assert.equal(calls.length,1);
});
test('browser default directly uses existing Supabase download',async()=>{const client={storage:{from:bucket=>({download:key=>({bucket,key})})}};assert.deepEqual(await downloadChunk(client,{},'path'),{bucket:'question-bank',key:'path'});});
test('browser R2 fetch omits credentials and obtains bytes only after access response',async()=>{
 const before=globalThis.fetch;let seen;
 try{globalThis.fetch=async(url,options)=>{seen=options;return new Response('fixture');};const client={functions:{invoke:async()=>({data:{provider:'r2',url:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=fixture'}})}};
 const r=await downloadChunk(client,{storageGateway:true},'key');assert.equal(await r.data.text(),'fixture');assert.equal(seen.credentials,'omit');assert.equal(seen.headers,undefined);assert.equal(seen.cache,'no-store');
 }finally{globalThis.fetch=before;}
});
test('browser authorization failure never downloads from R2',async()=>{const r=await downloadChunk({functions:{invoke:async()=>({error:Error('denied')})}},{storageGateway:true},'key');assert.equal(r.error.message,'denied');});

test('browser expiry reauthorizes once; revoked permission prevents retry download',async()=>{
 const before=globalThis.fetch;let signed=0,reads=0;
 try{globalThis.fetch=async()=>{reads++;return new Response('expired',{status:403});};
 const client={functions:{invoke:async()=>++signed===1?{data:{provider:'r2',url:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com/b/k'}}:{error:Error('revoked')}}};
 const r=await downloadChunk(client,{storageGateway:true},'key');assert.equal(r.error.message,'revoked');assert.equal(signed,2);assert.equal(reads,1);
 }finally{globalThis.fetch=before;}
});

test('browser expired URL is replaced once and fresh response succeeds',async()=>{
 const before=globalThis.fetch;let signed=0,reads=0;
 try{globalThis.fetch=async()=>++reads===1?new Response('expired',{status:403}):new Response('fresh');const client={functions:{invoke:async()=>{signed++;return{data:{provider:'r2',url:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com/b/k?attempt='+signed}};}}};
 const r=await downloadChunk(client,{storageGateway:true},'key');assert.equal(await r.data.text(),'fresh');assert.equal(signed,2);
 }finally{globalThis.fetch=before;}
});

test('browser CORS-hidden expired response triggers exactly one reauthorization',async()=>{
 const before=globalThis.fetch;let signed=0,reads=0;
 try{globalThis.fetch=async()=>{reads++;throw new TypeError('Failed to fetch');};const client={functions:{invoke:async()=>{signed++;return {data:{provider:'r2',url:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com/b/k'}};}}};
 const r=await downloadChunk(client,{storageGateway:true},'key');assert.ok(r.error);assert.equal(signed,2);assert.equal(reads,2);
 }finally{globalThis.fetch=before;}
});

test('desktop expiry rechecks authorization and returns fresh bytes without JWT leak',async()=>{
 let requests=0,reads=0;const auth={config:()=>({storageGateway:true}),token:async()=>'caller',request:async()=>{requests++;return{provider:'r2',url:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com/b/k'};}};
 const storage=new desktop.SharedBankStorage({auth,fetchImpl:async(u,opts)=>{assert.equal(opts.headers,undefined);return ++reads===1?new Response('expired',{status:403}):new Response('fresh');}});
 assert.equal(await (await storage.object({id:'f',space_id:'s'},0)).text(),'fresh');assert.equal(requests,2);
});
test('desktop signs through authenticated gateway and never forwards JWT to R2',async()=>{const calls=[];const auth={config:()=>({storageGateway:true,url:'https://fixture.supabase.co',publishableKey:'public'}),token:async()=>'fixture-token',request:async(route,options)=>{calls.push({route,options});return {provider:'r2',url:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com/private/path'};}};const storage=new desktop.SharedBankStorage({auth,fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return new Response('data');}});await storage.object({id:'file',space_id:'space'},0);assert.equal(calls[0].options.token,'fixture-token');assert.equal(calls[1].options.headers,undefined);await storage.object({id:'file',space_id:'space'},0,Buffer.from('test'));assert.match(calls[2].url,/functions\/v1\/bank-storage$/);assert.equal(calls[2].options.headers['x-bank-object'],'space/file/000');});
test('real pinned signer includes conditional write in signature and expires signed GET',async()=>{const signer=new AwsClient({accessKeyId:'fixture-id',secretAccessKey:'fixture-secret',region:'auto',service:'s3'});const r=await signer.sign('https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com/test/path',{method:'PUT',headers:{'If-None-Match':'*'},body:new Uint8Array([1])});assert.match(r.headers.get('authorization'),/if-none-match/);const get=await signer.sign('https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com/test/path?X-Amz-Expires=60',{method:'GET',aws:{signQuery:true}});assert.ok(new URL(get.url).searchParams.has('X-Amz-Signature'));assert.equal(new URL(get.url).searchParams.get('X-Amz-Expires'),'60');});
