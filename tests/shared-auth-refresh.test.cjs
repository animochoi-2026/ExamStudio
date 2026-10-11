'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {SharedBankAuth}=require('../app/shared-bank-auth.cjs');
const config={url:'https://test-project.supabase.co',spaceId:'57fcd460-b526-487f-9075-5503e4d07145',publishableKey:'sb_publishable_test'};
const secure={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).reverse(),decryptString:b=>Buffer.from(b).reverse().toString()};
function fixture(t,fetchImpl){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rotation-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const create=()=>new SharedBankAuth({directory,safeStorage:secure,openExternal:()=>{},fetchImpl});const a=create();a.write({config,account:{id:'a'},member:{userId:'a'},tokens:{access_token:'old-access',refresh_token:'old-refresh',expiresAt:0}});return {a,b:create(),directory};}
test('multiple auth clients coordinate one rotation and persist before any membership request',async t=>{
 let calls=0;const {a,b}=fixture(t,async url=>{assert.match(url,/grant_type=refresh_token/);calls++;await new Promise(r=>setTimeout(r,20));return Response.json({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600});});
 const tokens=await Promise.all(Array.from({length:20},(_,i)=>(i%2?a:b).token()));assert.deepEqual(new Set(tokens),new Set(['new-access']));assert.equal(calls,1);assert.equal(a.read().tokens.refresh_token,'new-refresh');assert.equal(a.read().refreshIntent,undefined);
 a.invalidate('old-access');assert.ok(a.read().tokens.expiresAt>Date.now());
});
test('invalid refresh persisted; restart does not retry consumed token; auth alone can be replaced',async t=>{
 let calls=0;const {a,b}=fixture(t,async()=>{calls++;return Response.json({msg:'Invalid Refresh Token: Already Used',code:'refresh_token_already_used'},{status:400});});
 await assert.rejects(a.token(),e=>e.code==='auth'&&e.service==='supabase');await assert.rejects(b.token(),e=>e.code==='auth');assert.equal(calls,1);assert.equal(b.status().connected,false);
 b.write({...b.read(),authFailure:undefined,tokens:{access_token:'signed-in',refresh_token:'new-session',expiresAt:Date.now()+3600000}});assert.equal(await b.token(),'signed-in');assert.equal(calls,1);
});
test('crash after refresh dispatch requires login, never replays an uncertain token',async t=>{
 const {a}=fixture(t,()=>assert.fail('refresh intent must not be replayed'));a.write({...a.read(),refreshIntent:{at:new Date().toISOString()}});await assert.rejects(a.token(),e=>e.serverCode==='refresh_uncertain');assert.equal(a.status().connected,false);
});
test('older login result cannot overwrite newer session',async t=>{
 let release;const gate=new Promise(r=>release=r);const {a,b}=fixture(t,async url=>{if(url.endsWith('/user')){await gate;return Response.json({id:'old',email_confirmed_at:'date'});}return Response.json({userId:'old'});});
 const accept=a.accept({access_token:'stale',refresh_token:'stale',expires_in:3600},a.epoch);
 b.write({...b.read(),tokens:{access_token:'new',refresh_token:'new',expiresAt:Date.now()+3600000}});release();await assert.rejects(accept,/상태가 변경/);assert.equal(a.read().tokens.refresh_token,'new');
});
test('independent auth directories do not share sessions',async t=>{
 let calls=0;const fetchImpl=async()=>Response.json({access_token:'session-'+(++calls),refresh_token:'r-'+calls,expires_in:3600});const one=fixture(t,fetchImpl),two=fixture(t,fetchImpl);const tokens=await Promise.all([one.a.token(),two.a.token()]);assert.equal(calls,2);assert.notEqual(tokens[0],tokens[1]);
});
test('storage preserves auth errors instead of wrapping them as network failures',async()=>{
 const {SharedBankStorage}=require('../app/shared-bank-storage.cjs');const storage=new SharedBankStorage({auth:{config:()=>config,token:()=>{throw Object.assign(Error('login required'),{code:'auth',service:'supabase'});}},fetchImpl:()=>assert.fail('no object request')});await assert.rejects(storage.object({space_id:'s',id:'i'},0,Buffer.from('x')),e=>e.code==='auth'&&e.service==='supabase');
});
test('two OS processes serialize one session refresh',async t=>{
 const {directory}=fixture(t,()=>assert.fail('parent refresh'));const http=require('node:http'),{spawn}=require('node:child_process');let calls=0;
 const server=http.createServer(async(req,res)=>{calls++;req.resume();await new Promise(r=>setTimeout(r,40));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({access_token:'process-access',refresh_token:'process-refresh',expires_in:3600}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const run=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(__dirname,'refresh-process-worker.cjs'),directory,'http://127.0.0.1:'+server.address().port],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',b=>out+=b);child.once('error',reject);child.once('exit',code=>{try{assert.equal(code,0);assert.equal(out,'OK');resolve();}catch(e){reject(e);}});});
 await Promise.all([run(),run()]);assert.equal(calls,1);
});

test('disk failure after token rotation retains intent and cannot restore the old refresh token',async t=>{
 let calls=0;const {a,b}=fixture(t,async()=>{calls++;return Response.json({access_token:'new',refresh_token:'new-r',expires_in:3600});});const write=a.write.bind(a);a.write=(value,lease)=>{if(value.tokens?.refresh_token==='new-r')throw Object.assign(Error('disk full'),{code:'ENOSPC'});return write(value,lease);};await assert.rejects(a.token(),e=>e.code==='ENOSPC');assert.ok(b.read().refreshIntent);await assert.rejects(b.token(),e=>e.serverCode==='refresh_uncertain');assert.equal(calls,1);
});
