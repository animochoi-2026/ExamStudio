import {mkdir,writeFile,rename,open} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {s3Store,restSource} from './adapters.mjs';
import {preflight,transfer,seal,unseal,sha,internal} from './core.mjs';
import {listReferences,assertFrozen} from './references.mjs';
import {fixtures} from './synthetic.mjs';
const e=process.env;
function stores(mode){
  if(!/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(e.R2_ENDPOINT||''))throw Error('INVALID_R2_ENDPOINT');
  const target=s3Store({endpoint:e.R2_ENDPOINT,region:'auto',bucket:e.R2_BUCKET,accessKeyId:e.R2_ACCESS_KEY_ID,secretAccessKey:e.R2_SECRET_ACCESS_KEY});
  if(mode==='test')return {target};
  const source=e.SOURCE_MODE==='s3'?s3Store({endpoint:e.SOURCE_S3_ENDPOINT,region:e.SOURCE_S3_REGION,bucket:e.SOURCE_BUCKET||'question-bank',accessKeyId:e.SOURCE_S3_ACCESS_KEY_ID,secretAccessKey:e.SOURCE_S3_SECRET_ACCESS_KEY,readOnly:true}):restSource({url:e.SUPABASE_URL,key:e.SUPABASE_READ_KEY,bucket:e.SOURCE_BUCKET||'question-bank',restoreKey:e.SUPABASE_RESTORE_KEY});
  const references=()=>listReferences({url:e.SUPABASE_URL,key:e.SUPABASE_READ_KEY});
  return {source:{...source,references},target};
}
export async function withLock(target,job,fn){
  const key='__migration/global.lock',owner=randomUUID(),body=Buffer.from(JSON.stringify({owner,job,createdAt:new Date().toISOString()}));
  try{await target.put(key,body,{ContentType:'application/json'},{absent:true});}
  catch{const current=await target.get(key,{missing:true});if(!current||!current.body.equals(body))throw Error('MIGRATION_LOCKED_OR_UNCERTAIN');}
  // No expiry/takeover: termination leaves the lock for explicit operator recovery.
  try{return await fn();}finally{
    const current=await target.get(key);if(!current.body.equals(body))throw Error('LOCK_OWNERSHIP_CHANGED');
    await target.remove(key);
  }
}
export async function assertAnonymousDenied(response){
 if([401,403].includes(response.status)){await response.body?.cancel();return;}
 // R2's S3 endpoint can reject an unsigned request as InvalidArgument/Authorization.
 // Other 400s (bad path, configuration, etc.) must not count as an access test.
 if(response.status===400){
  const xml=await response.text();
  if(xml.length<4096&&xml.match(/<Code>([^<]+)<\/Code>/)?.[1]==='InvalidArgument'&&
    ['Authorization','Invalid Argument: Authorization'].includes(xml.match(/<Message>([^<]+)<\/Message>/)?.[1]))return;
 }else await response.body?.cancel();
 throw Error('PRIVATE_ACCESS_CHECK_FAILED');
}
export async function syntheticTest(target,{signedProbe=false,fetchImpl=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const run=randomUUID(),results=[];
 for(const fixture of fixtures(run)){
  const key=`__migration-test/${run}/${fixture.name}`,body=fixture.body;
  let created=false;
  try{
    try{await target.put(key,body,{ContentType:fixture.type},{absent:true});created=true;}
    catch(error){if(![409,412].includes(error.status)){const possible=await target.get(key,{missing:true});created=!!possible&&possible.body.equals(body);}throw error;}
    const got=await target.get(key);if(sha(got.body)!==sha(body))throw Error('SYNTHETIC_HASH_MISMATCH');
    if(got.metadata.ContentType!==fixture.type)throw Error('SYNTHETIC_TYPE_MISMATCH');
    if(signedProbe){
      const url=await target.signedRead(key),anonymous=new URL(url);anonymous.search='';
      await assertAnonymousDenied(await fetchImpl(anonymous,{redirect:'error'}));
      const read=await fetchImpl(url,{redirect:'error',headers:{Origin:'http://localhost:4173'}});
      if(read.headers.get('access-control-allow-origin')!=='http://localhost:4173')throw Error('R2_CORS_CHECK_FAILED');
      if(!read.ok||sha(Buffer.from(await read.arrayBuffer()))!==sha(body))throw Error('SIGNED_READ_FAILED');
      // Only one artificial object needs the full elapsed-time expiration test.
      if(!results.length){await wait(31000);await wait(31000);const expired=await fetchImpl(url,{redirect:'error'});await expired.body?.cancel();if(expired.status!==403)throw Error('SIGNED_URL_DID_NOT_EXPIRE');
        const fresh=await fetchImpl(await target.signedRead(key),{redirect:'error'});if(!fresh.ok||sha(Buffer.from(await fresh.arrayBuffer()))!==sha(body))throw Error('SIGNED_URL_REFRESH_FAILED');}
    }
    results.push({type:fixture.type,bytes:body.length,verified:true});
  }finally{if(created){await target.remove(key);if(await target.get(key,{missing:true}))throw Error('SYNTHETIC_CLEANUP_FAILED');}}
 }
 return {syntheticFiles:results,signedExpiryProbe:signedProbe,verified:true};
}
async function main(){
  const mode=process.argv[2]||'preflight',confirmation=process.argv[3]||'';
  if(!['preflight','test','copy','verify','restore-plan','restore-copy','restore-verify'].includes(mode))throw Error('INVALID_MODE');
  const reverse=mode.startsWith('restore-');
  if(reverse&&e.SOURCE_MODE==='s3')throw Error('RESTORE_USE_REST_NO_UPSERT');
  if(mode==='copy'&&confirmation!=='COPY_FILES_NO_DELETE')throw Error('COPY_CONFIRMATION_REQUIRED');
  if(mode==='restore-copy'&&confirmation!=='RESTORE_FILES_NO_DELETE')throw Error('RESTORE_CONFIRMATION_REQUIRED');
  if(['copy','verify','restore-plan','restore-copy','restore-verify'].includes(mode)&&e.MIGRATION_WRITES_FROZEN!=='true')throw Error('WRITE_FREEZE_REQUIRED');
  const job=e.MIGRATION_JOB||'night-cutover';if(!/^[a-z0-9-]{1,64}$/.test(job))throw Error('INVALID_JOB');
  // Validate encryption key before any network mutation.
  seal({},e.MIGRATION_STATE_KEY);
  const {source,target}=stores(mode),prefix=`__migration/${job}/`;
  const directory=resolve(fileURLToPath(new URL('./.private/',import.meta.url)),job);await mkdir(directory,{recursive:true,mode:0o700});
  async function save(name,data){
    const body=seal(data,e.MIGRATION_STATE_KEY),file=join(directory,name+'.enc'),temp=file+'.'+randomUUID()+'.tmp';
    const fd=await open(temp,'wx',0o600);try{await fd.writeFile(body);await fd.sync();}finally{await fd.close();}await rename(temp,file);
    await target.put(prefix+name+'.enc',body,{ContentType:'application/octet-stream'});
  }
  const load=async name=>{const r=await target.get(prefix+name+'.enc',{missing:true});return r?unseal(r.body,e.MIGRATION_STATE_KEY):null;};
  return withLock(target,job,async()=>{
    if(mode==='test')return syntheticTest(target,{signedProbe:true});
    const confirmFreeze=()=>assertFrozen({url:e.SUPABASE_URL,key:e.SUPABASE_READ_KEY,provider:reverse?'r2':'supabase'});
    if(e.MIGRATION_WRITES_FROZEN==='true')await confirmFreeze();
    const from=reverse?{...target,references:source.references,list:async()=> (await target.list()).filter(r=>!internal(r.key))}:source;
    const to=reverse?source:target;
    const stem=reverse?'restore-':'';
    if(mode==='preflight'||mode==='restore-plan'){
      // Never replace a copied job's baseline. Use a new reviewed job ID.
      if(await load(stem+'state'))throw Error('JOB_ALREADY_STARTED_USE_NEW_JOB');
      const manifest=await preflight(from,to);manifest.writesFrozen=e.MIGRATION_WRITES_FROZEN==='true';
      await save(stem+'manifest',manifest);
      if(!manifest.referenceCheck?.ok)throw Error('DB_REFERENCE_MISMATCH');
      return {mode,...manifest.summary,logicalFiles:manifest.referenceCheck.logicalFiles,referenceCheckPassed:true,targetReachable:true,writesFrozen:manifest.writesFrozen,inventorySHA256:manifest.inventorySHA256};
    }
    const manifest=await load(stem+'manifest');if(!manifest||!manifest.writesFrozen)throw Error('FROZEN_PREFLIGHT_REQUIRED');
    const state=await load(stem+'state')||{schema:1,files:{},failures:[]};
    const result=await transfer({source:from,target:to,manifest,state,save:s=>save(stem+'state',s),mode:mode.endsWith('verify')?'verify':'copy',preserveTargetExtras:reverse});
    try{await confirmFreeze();}catch(error){state.complete=false;state.verified=false;state.failures.push({code:'SERVER_FREEZE_NOT_CONFIRMED'});await save(stem+'state',state);throw error;}
    return result;
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(result=>console.log(JSON.stringify(result))).catch(error=>{
  // Neither SDK errors nor request URLs, paths, keys, manifests or bodies enter logs.
  const safe=/^[A-Z_]{3,80}$/.test(error.message)?error.message:'STORAGE_OPERATION_FAILED';
  console.error(JSON.stringify({ok:false,code:safe}));process.exitCode=1;
});
