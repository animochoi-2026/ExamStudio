'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {SharedBankStorage}=require('../app/shared-bank-storage.cjs'),S=require('../app/source-upload.cjs');
const id='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';
async function fixture(t,{verified=false,race403=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'source-flight-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'source.pdf'),data=Buffer.from('%PDF-1.7 controlled source');fs.writeFileSync(file,data);const sha=crypto.createHash('sha256').update(data).digest('hex');
 const entry={id,space_id:id,owner_id:user,props:{role:'source',sourceKey:'a'.repeat(64)},size:data.length,sha256:sha,chunks:1,verified};
 let stored=verified?data:null,uploads=0,verifications=0,claims=0;let lease;
 const auth={config:()=>({url:'https://fixture.supabase.co',spaceId:id,storageGateway:true}),membership:async()=>({userId:user}),token:async()=> 'test',request:async(route,{body})=>{
  if(route.endsWith('bank_reserve'))return {...entry};
  if(route.includes('bank_entries'))return [{...entry}];
  if(route.endsWith('bank_source_upload_claim')){claims++;if(entry.verified)return {state:'verified',entry:{...entry}};if(body.action==='release'){lease=null;return {state:'released',entry:{...entry}};}if(lease&&lease!==body.claim_token)return {state:'waiting',entry:{...entry}};lease=body.claim_token;return {state:'claimed',entry:{...entry}};}
  if(route.endsWith('bank-storage'))return {provider:'r2',url:'https://fixture.r2.cloudflarestorage.com/source'};
  if(route.endsWith('bank-verify')){verifications++;entry.verified=true;return {};}
  throw Error(route);
 }};
 const storage=new SharedBankStorage({auth,fetchImpl:async(url,options)=>{if(options.method==='POST'){uploads++;await new Promise(r=>setTimeout(r,15));stored=data;if(race403){entry.verified=true;return Response.json({error:'denied'},{status:403});}return new Response('{}');}return stored?new Response(stored):new Response('',{status:404});}});
 const args={file,id,parent:id,name:'source.pdf',properties:entry.props};return {storage,args,entry,sha,counts:()=>({uploads,verifications,claims})};
}
test('two questions share exactly one source upload/verification; atomic SQL lease supports other processes and expiration',async t=>{
 const f=await fixture(t);let registered=0;const [a,b]=await Promise.all([f.storage.put(f.args).then(v=>(registered++,v)),f.storage.put(f.args).then(v=>(registered++,v))]);assert.equal(a.id,b.id);assert.equal(registered,2);assert.equal(f.counts().uploads,1);assert.equal(f.counts().verifications,1);
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema bank_storage_private;create function auth.uid() returns uuid language sql as $$select '${user}'::uuid$$;create table public.bank_entries(id uuid primary key,space_id uuid,owner_id uuid,props jsonb,sha256 text,verified boolean);create function public.bank_member(uuid) returns boolean language sql as $$select true$$;create function public.bank_read_entry(uuid) returns boolean language sql as $$select true$$;`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261016034437_source_upload_claim.sql'),'utf8'));
 await db.query('insert into bank_entries values($1,$1,$2,$3,$4,false)',[id,user,f.entry.props,f.sha]);
 const tokenA=crypto.randomUUID(),tokenB=crypto.randomUUID(),claim=async(token,action='claim')=>(await db.query('select bank_source_upload_claim($1,$2,$3,$4) value',[id,f.sha,token,action])).rows[0].value;
 assert.equal((await claim(tokenA)).state,'claimed');assert.equal((await claim(tokenB)).state,'waiting');
 await db.exec("update bank_storage_private.source_upload_claims set expires_at=now()-interval '1 second'");assert.equal((await claim(tokenB)).state,'claimed');assert.equal((await claim(tokenA,'renew')).state,'waiting');await claim(tokenB,'release');assert.equal((await claim(tokenA)).state,'claimed');
});
test('verified source is checked against local sha and reused with zero upload/verification',async t=>{
 const f=await fixture(t,{verified:true});const result=await f.storage.put(f.args);assert(result.sourceReused);assert.equal(f.counts().uploads,0);assert.equal(f.counts().verifications,0);assert(f.counts().claims>0);f.entry.sha256='0'.repeat(64);await assert.rejects(f.storage.put(f.args),/내용이 다릅니다/);
});
test('403 only reuses authenticated identical verified owner source; foreign/wrong/inaccessible files remain errors',async t=>{
 const f=await fixture(t,{race403:true});const result=await f.storage.put(f.args);assert(result.sourceReused);assert.equal(f.counts().uploads,1);assert.equal(f.counts().verifications,0);
 const expected={...f.entry};f.entry.owner_id=crypto.randomUUID();await assert.rejects(S.verifiedAfter403(f.storage,expected,f.args,f.sha),e=>e.status===403);
 f.entry.owner_id=user;f.entry.id=crypto.randomUUID();await assert.rejects(S.verifiedAfter403(f.storage,expected,f.args,f.sha),e=>e.status===403);
 f.storage.maybe=async()=>null;await assert.rejects(S.verifiedAfter403(f.storage,expected,f.args,f.sha),e=>e.status===403);
});
