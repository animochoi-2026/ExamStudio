import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {reconcileReferences} from './references.mjs';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const canonical=v=>JSON.stringify(Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
export const internal=k=>k.startsWith('__migration/')||k.startsWith('__migration-test/');
export function inventory(rows){
  const sorted=[...rows].sort((a,b)=>a.key.localeCompare(b.key,'en'));
  const seen=new Set();for(const r of sorted){if(!r.key||seen.has(r.key)||!Number.isSafeInteger(r.size)||r.size<0||internal(r.key))throw Error('INVALID_INVENTORY');seen.add(r.key);}
  return sorted;
}
export function summary(rows){const types={};for(const r of rows){const t=r.metadata?.ContentType||'unknown';types[t]??={files:0,bytes:0};types[t].files++;types[t].bytes+=r.size;}return {files:rows.length,bytes:rows.reduce((n,r)=>n+r.size,0),types};}
export function seal(value,key){
  if(!/^[a-f0-9]{64}$/i.test(key||''))throw Error('STATE_KEY_REQUIRED');
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),nonce);
  const data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
  return Buffer.concat([Buffer.from('ESR2'),nonce,cipher.getAuthTag(),data]);
}
export function unseal(bytes,key){
  if(bytes.subarray(0,4).toString()!=='ESR2')throw Error('INVALID_JOURNAL');
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),bytes.subarray(4,16));decipher.setAuthTag(bytes.subarray(16,32));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(32)),decipher.final()]).toString());
}
export async function retry(fn,{attempts=4,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  for(let n=0;;n++)try{return await fn();}catch(e){if(n>=attempts-1||!(e.retryable||[429,500,502,503,504].includes(e.status)))throw e;await sleep(Math.min(5000,200*2**n));}
}
const signature=rows=>sha(Buffer.from(canonical(rows)));
export async function preflight(source,target){
  const rows=inventory(await source.list());
  const targetRows=inventory((await target.list()).filter(r=>!internal(r.key)));
  const referenceCheck=source.references?reconcileReferences(await source.references(),rows):null;
  return {schema:1,source:source.identity,target:target.identity,rows,inventorySHA256:signature(rows),summary:summary(rows),targetSummary:summary(targetRows),referenceCheck,targetReachable:true,measuredAt:new Date().toISOString()};
}
const metadataFields=['ContentType','CacheControl','ContentDisposition','ContentEncoding','ContentLanguage','Metadata'];
function compareMetadata(a,b){return metadataFields.every(k=>canonical(a?.[k]??null)===canonical(b?.[k]??null));}
export async function transfer({source,target,manifest,state,save,mode,preserveTargetExtras=false}){
  if(!['copy','verify'].includes(mode))throw Error('INVALID_MODE');
  state.complete=false;state.verified=false;state.failures=[];await save(state);
  async function checkReferences(){if(source.references){const check=reconcileReferences(await source.references(),manifest.rows);if(!check.ok||!manifest.referenceCheck?.ok||check.sha256!==manifest.referenceCheck.sha256)throw Error('DB_REFERENCE_MISMATCH');}}
  await checkReferences();
  if(manifest.source!==source.identity||manifest.target!==target.identity||signature(inventory(manifest.rows))!==manifest.inventorySHA256)throw Error('MANIFEST_IDENTITY_MISMATCH');
  if(signature(inventory(await source.list()))!==manifest.inventorySHA256)throw Error('SOURCE_CHANGED_REPLAN_REQUIRED');
  let previousFile='',tail=Buffer.alloc(0);
  for(const entry of manifest.rows){
    try {
      const original=await retry(()=>source.get(entry.key));
      if(original.body.length!==entry.size)throw Error('SOURCE_SIZE_CHANGED');
      const file=entry.key.split('/').slice(0,-1).join('/');
      const scan=Buffer.concat([file===previousFile?tail:Buffer.alloc(0),original.body]);
      previousFile=file;tail=original.body.subarray(Math.max(0,original.body.length-8192));
      if(/https?:\/\/[^\s"<>]{0,2048}(?:supabase\.co\/storage\/v1|r2\.dev)/i.test(scan.toString('utf8'))){state.failures.push({key:entry.key,code:'EMBEDDED_STORAGE_URL_REVIEW_REQUIRED'});}
      const digest=sha(original.body);const existing=await retry(()=>target.get(entry.key,{missing:true}));
      if(existing){
        if(existing.body.length!==entry.size||sha(existing.body)!==digest||!compareMetadata(original.metadata,existing.metadata))throw Error('TARGET_CONFLICT');
      }else if(mode==='copy'){
        // Never overwrite. If a PUT response is lost, the subsequent GET proves
        // what happened; a name or journal entry alone never permits skipping.
        await retry(async()=>{
          try {await target.put(entry.key,original.body,original.metadata,{absent:true});}
          catch(e){const uncertain=await retry(()=>target.get(entry.key,{missing:true}));if(!uncertain)throw e;if(sha(uncertain.body)!==digest||!compareMetadata(original.metadata,uncertain.metadata))throw Error('TARGET_CONFLICT');}
        });
        const written=await retry(()=>target.get(entry.key));
        if(written.body.length!==entry.size||sha(written.body)!==digest||!compareMetadata(original.metadata,written.metadata))throw Error('TARGET_VERIFICATION_FAILED');
      }else throw Error('TARGET_MISSING');
      state.files[entry.key]={size:entry.size,sha256:digest,metadata:original.metadata,verifiedAt:new Date().toISOString()};
    } catch(e){state.failures.push({key:entry.key,code:['SOURCE_SIZE_CHANGED','TARGET_CONFLICT','TARGET_MISSING','TARGET_VERIFICATION_FAILED'].includes(e.message)?e.message:'OBJECT_IO_FAILED'});}
    await save(state);
  }
  // A final list detects additions, removals and metadata drift during this run.
  if(signature(inventory(await source.list()))!==manifest.inventorySHA256)state.failures.push({code:'SOURCE_CHANGED_DURING_RUN'});
  const targetRows=inventory((await target.list()).filter(r=>!internal(r.key)));
  const expected=new Map(manifest.rows.map(r=>[r.key,r.size]));
  for(const r of targetRows){if((!expected.has(r.key)&&!preserveTargetExtras)||(expected.has(r.key)&&expected.get(r.key)!==r.size))state.failures.push({key:r.key,code:'TARGET_EXTRA_OR_WRONG_SIZE'});expected.delete(r.key);}
  for(const key of expected.keys())state.failures.push({key,code:'TARGET_MISSING'});
  await checkReferences();
  state.complete=state.failures.length===0;state.verified=state.complete&&mode==='verify';state.finishedAt=new Date().toISOString();await save(state);
  if(!state.complete)throw Error('MIGRATION_NOT_VERIFIED');
  return {files:manifest.rows.length,bytes:manifest.summary.bytes,verified:state.verified,inventorySHA256:manifest.inventorySHA256};
}
