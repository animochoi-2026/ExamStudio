import test from 'node:test';
import assert from 'node:assert/strict';
import {inventory,preflight,transfer,seal,unseal,retry} from '../../tools/storage-migration/core.mjs';
import {withLock,syntheticTest,assertAnonymousDenied} from '../../tools/storage-migration/cli.mjs';
import {restSource} from '../../tools/storage-migration/adapters.mjs';
function memory(identity,objects={}){
 const data=new Map(Object.entries(objects).map(([k,v])=>[k,{body:Buffer.from(v),metadata:{ContentType:'application/octet-stream'}}]));const calls=[];
 return {identity,data,calls,async list(){calls.push('list');return [...data].map(([key,v])=>({key,size:v.body.length,metadata:v.metadata}));},async get(key,{missing=false}={}){calls.push('get');const v=data.get(key);if(!v&&!missing)throw Error('MISSING');return v||null;},async put(key,body,metadata,options={}){calls.push('put');if(options.absent&&data.has(key))throw Error('CONFLICT');data.set(key,{body:Buffer.from(body),metadata});},async remove(key){calls.push('remove');data.delete(key);}};
}
test('unsigned R2 Authorization error is denied; unrelated errors and public reads fail',async()=>{
 await assertAnonymousDenied(new Response('<Error><Code>InvalidArgument</Code><Message>Authorization</Message></Error>',{status:400}));
 for(const status of [401,403])await assertAnonymousDenied(new Response(null,{status}));
 for(const [status,body] of [[200,'file'],[404,'missing'],[500,'unavailable'],[400,'<Error><Code>InvalidArgument</Code><Message>Bucket</Message></Error>']]){
  await assert.rejects(assertAnonymousDenied(new Response(body,{status})),/PRIVATE_ACCESS_CHECK_FAILED/);
 }
});
async function setup(){const source=memory('source',{'folder/한글/000':'abc','deep/001':'xyz'}),target=memory('target'),manifest=await preflight(source,target),state={files:{}};return {source,target,manifest,state,save:async()=>{}};}
test('bounded prefetch and batched checkpoints still hash all files and reject conflicts',async()=>{
 const source=memory('source',Object.fromEntries(Array.from({length:37},(_,i)=>[`folder/${String(i).padStart(3,'0')}`,String(i)]))),target=memory('target');
 let active=0,peak=0,reads=0,saves=0;const get=source.get.bind(source);source.get=async(...args)=>{active++;reads++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));try{return await get(...args);}finally{active--;}};
 const manifest=await preflight(source,target),state={files:{}},opts={source,target,manifest,state,save:async()=>{saves++;},readConcurrency:8,checkpointEvery:16};
 await transfer({...opts,mode:'copy'});assert.equal(reads,37);assert.equal(peak,8);assert.equal(saves,5);
 await transfer({...opts,mode:'verify'});assert.equal(reads,74);assert.equal(state.verified,true);
 target.data.get('folder/009').body=Buffer.from('X');await assert.rejects(transfer({...opts,mode:'verify'}),/NOT_VERIFIED/);assert.equal(state.verified,false);assert.equal(target.data.get('folder/009').body.toString(),'X');
 assert.ok(!source.calls.includes('put')&&!source.calls.includes('remove'));
});
test('parallel reads preserve embedded URL detection across chunk and batch boundaries',async()=>{
 const source=memory('s',Object.fromEntries(Array.from({length:10},(_,i)=>[`f/${String(i).padStart(3,'0')}`,i===7?'https://p.supabase.co/sto':i===8?'rage/v1/object/sign/b/x':'ok']))),target=memory('t');
 const manifest=await preflight(source,target),state={files:{}};
 await assert.rejects(transfer({source,target,manifest,state,save:async()=>{},mode:'copy',readConcurrency:8,checkpointEvery:16}),/NOT_VERIFIED/);
 assert.ok(state.failures.some(f=>f.code==='EMBEDDED_STORAGE_URL_REVIEW_REQUIRED'));
});
test('preflight lists nested keys and metadata without reading file contents',async()=>{const x=await setup();assert.equal(x.manifest.summary.files,2);assert.deepEqual(x.source.calls,['list']);assert.deepEqual(x.target.calls,['list']);});
test('copy and separate full verification hash every object on resume',async()=>{const x=await setup();assert.equal((await transfer({...x,mode:'copy'})).verified,false);assert.equal((await transfer({...x,mode:'verify'})).verified,true);x.target.data.get('deep/001').body=Buffer.from('bad');await assert.rejects(transfer({...x,mode:'copy'}),/NOT_VERIFIED/);assert.equal(x.target.data.get('deep/001').body.toString(),'bad');assert.equal(x.source.calls.includes('put'),false);assert.equal(x.source.calls.includes('remove'),false);});
test('same size different content is a conflict; no overwrite',async()=>{const x=await setup();x.target.data.set('deep/001',{body:Buffer.from('no!'),metadata:{ContentType:'application/octet-stream'}});await assert.rejects(transfer({...x,mode:'copy'}));assert.equal(x.state.failures[0].code,'TARGET_CONFLICT');});
test('metadata mismatch blocks verification',async()=>{const x=await setup();await transfer({...x,mode:'copy'});x.target.data.get('deep/001').metadata.ContentType='text/plain';await assert.rejects(transfer({...x,mode:'verify'}));});
test('missing and extra objects block cutover',async()=>{const x=await setup();await transfer({...x,mode:'copy'});x.target.data.delete('deep/001');x.target.data.set('unexpected',{body:Buffer.from('x'),metadata:{}});await assert.rejects(transfer({...x,mode:'verify'}));assert.equal(x.state.verified,false);assert.ok(x.state.failures.some(f=>f.code==='TARGET_EXTRA_OR_WRONG_SIZE'));});
test('source changes before or during transfer invalidate verification',async()=>{const x=await setup();x.source.data.get('deep/001').body=Buffer.from('changed');await assert.rejects(transfer({...x,mode:'copy'}),/SOURCE_CHANGED/);});
test('lost PUT acknowledgement reconciles by downloading and hashing',async()=>{const x=await setup(),put=x.target.put;x.target.put=async(...a)=>{await put(...a);throw Error('lost response');};await transfer({...x,mode:'copy'});assert.equal(x.state.complete,true);});
test('checkpoint failure stops; subsequent run verifies existing objects',async()=>{const x=await setup();let n=0;await assert.rejects(transfer({...x,mode:'copy',save:async()=>{if(++n===2)throw Error('disk');}}));await transfer({...x,mode:'copy'});assert.equal(x.state.complete,true);});
test('encrypted journal detects wrong key and tampering',()=>{const key='ab'.repeat(32),b=seal({privateKey:'nested/name'},key);assert.equal(b.includes(Buffer.from('nested/name')),false);assert.deepEqual(unseal(b,key),{privateKey:'nested/name'});assert.throws(()=>unseal(b,'cd'.repeat(32)));b[b.length-1]^=1;assert.throws(()=>unseal(b,key));});
test('duplicate and unknown-size inventory fail closed',()=>{assert.throws(()=>inventory([{key:'a',size:NaN}]));assert.throws(()=>inventory([{key:'a',size:1},{key:'a',size:1}]));});
test('global lock prevents simultaneous local and Actions runs',async()=>{const store=memory('r2');await withLock(store,'first',async()=>{await assert.rejects(withLock(store,'second',async()=>{}),/LOCKED/);});assert.equal(store.data.size,0);});
test('synthetic test deletes only its own exact key, never existing data',async()=>{const store=memory('r2',{production:'keep','__migration-test/old/file':'keep'});await syntheticTest(store);assert.deepEqual([...store.data.keys()],['production','__migration-test/old/file']);});
test('bounded retries only retry transient failures',async()=>{let n=0;assert.equal(await retry(async()=>{if(++n<3)throw Object.assign(Error(),{status:503});return 7;},{sleep:async()=>{}}),7);n=0;await assert.rejects(retry(async()=>{n++;throw Object.assign(Error(),{status:403});},{sleep:async()=>{}}));assert.equal(n,1);});
test('REST list visits every 1000-object page and nested folder without object GET',async()=>{
 const requests=[],source=restSource({url:'https://test.supabase.co',key:'fixture',fetchImpl:async(url,opts)=>{requests.push(url);if(url.endsWith('/bucket'))return Response.json([{id:'question-bank'}]);assert.match(url,/object\/list/);const {prefix,offset}=JSON.parse(opts.body);if(prefix==='')return Response.json([{name:'folder',id:null,metadata:null}]);if(prefix==='folder'&&offset===0)return Response.json(Array.from({length:1000},(_,i)=>({id:'id-'+i,name:String(i),metadata:{size:1,mimetype:'test/type'}})));return Response.json([]);}});
 const rows=await source.list();assert.equal(rows.length,1000);assert.equal(requests.length,4);assert.ok(rows.every(x=>x.key.startsWith('folder/')));
});
test('restore preserves retained backup extras but verifies every required key',async()=>{const x=await setup();x.target.data.set('retained-old',{body:Buffer.from('retain'),metadata:{}});await transfer({...x,mode:'copy',preserveTargetExtras:true});assert.equal(x.target.data.has('retained-old'),true);await transfer({...x,mode:'verify',preserveTargetExtras:true});assert.equal(x.state.verified,true);});
test('embedded expiring or provider URLs block completion without rewriting content',async()=>{const source=memory('source',{'json/000':'{"url":"https://test.supabase.co/storage/v1/object/test"}'}),target=memory('target'),manifest=await preflight(source,target),state={files:{}};await assert.rejects(transfer({source,target,manifest,state,save:async()=>{},mode:'copy'}));assert.equal(state.failures[0].code,'EMBEDDED_STORAGE_URL_REVIEW_REQUIRED');assert.equal(target.data.get('json/000').body.toString(),source.data.get('json/000').body.toString());});
test('a failed new verification invalidates a previously successful journal',async()=>{const x=await setup();await transfer({...x,mode:'copy'});await transfer({...x,mode:'verify'});x.source.data.get('deep/001').body=Buffer.from('changed');await assert.rejects(transfer({...x,mode:'verify'}));assert.equal(x.state.verified,false);});
test('synthetic collision does not delete a pre-existing object',async()=>{let deleted=false;await assert.rejects(syntheticTest({put:async()=>{throw Object.assign(Error('collision'),{status:412});},get:async()=>{throw Error('must not inspect collision');},remove:async()=>{deleted=true;}}));assert.equal(deleted,false);});

test('artificial PDF/image probe verifies private access, CORS, expiry and refreshed content',async()=>{
 const store=memory('r2',{production:'keep'});let sequence=0,elapsed=0;
 store.signedRead=async key=>'https://fixture.invalid/'+encodeURIComponent(key)+'?signature='+ ++sequence;
 const result=await syntheticTest(store,{signedProbe:true,wait:async ms=>{elapsed+=ms;},fetchImpl:async input=>{
   const u=new URL(input),sig=u.searchParams.get('signature');if(!sig||(sig==='1'&&elapsed>60000))return new Response(null,{status:403});
   const obj=store.data.get(decodeURIComponent(u.pathname.slice(1)));return new Response(obj.body,{headers:{'access-control-allow-origin':'http://localhost:4173'}});
 }});
 assert.equal(result.syntheticFiles.length,2);assert.equal(result.signedExpiryProbe,true);assert.deepEqual([...store.data.keys()],['production']);assert.equal(elapsed,62000);
});
