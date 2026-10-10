import {canonical,sha} from './core.mjs';
const CHUNK=6291456;
export function reconcileReferences(entries,objects){
  const expected=new Map(),seen=new Set(),failures=[];
  for(const e of entries){
    if(seen.has(e.id)||!Number.isSafeInteger(e.size)||e.size<0||!Number.isSafeInteger(e.chunks)||e.chunks!==Math.ceil(e.size/CHUNK))throw Error('INVALID_DB_FILE_REFERENCE');
    seen.add(e.id);
    for(let i=0;i<e.chunks;i++)expected.set(`${e.space_id}/${e.id}/${String(i).padStart(3,'0')}`,Math.min(CHUNK,e.size-i*CHUNK));
  }
  const expectedObjects=expected.size;
  for(const o of objects){if(!expected.has(o.key))failures.push({key:o.key,code:'UNREFERENCED_OBJECT'});else if(expected.get(o.key)!==o.size)failures.push({key:o.key,code:'REFERENCE_SIZE_MISMATCH'});expected.delete(o.key);}
  for(const key of expected.keys())failures.push({key,code:'REFERENCED_OBJECT_MISSING'});
  const rows=[...entries].sort((a,b)=>a.id.localeCompare(b.id,'en'));
  return {logicalFiles:entries.length,expectedObjects,unverifiedFiles:entries.filter(e=>!e.verified).length,failures,ok:failures.length===0,sha256:sha(Buffer.from(canonical(rows)))};
}
export async function listReferences({url,key,fetchImpl=fetch}){
  // Full-project reconciliation cannot be trusted with a user's RLS-filtered JWT.
  let serverKey=key?.startsWith('sb_secret_');
  try{serverKey ||= JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role==='service_role';}catch{}
  if(!serverKey||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url||''))throw Error('COMPLETE_DB_READ_CREDENTIAL_REQUIRED');
  const rows=[],seen=new Set();let total;
  for(let offset=0;;){
    const q='kind=eq.file&select=id,space_id,size,chunks,sha256,verified,created_at,props&order=id.asc&limit=1000&offset='+offset;
    const r=await fetchImpl(url+'/rest/v1/bank_entries?'+q,{headers:{apikey:key,Authorization:'Bearer '+key,Prefer:'count=exact'},signal:AbortSignal.timeout(120000)});
    if(!r.ok)throw Error('DB_REFERENCE_READ_FAILED');
    const count=Number(/\/(\d+)$/.exec(r.headers.get('content-range')||'')?.[1]);
    if(!Number.isSafeInteger(count)||(total!=null&&total!==count))throw Error('DB_REFERENCE_LIST_CHANGED');total=count;
    const page=await r.json();if(!Array.isArray(page))throw Error('INVALID_DB_REFERENCE_PAGE');
    for(const entry of page){if(seen.has(entry.id))throw Error('DUPLICATE_DB_REFERENCE');seen.add(entry.id);rows.push(entry);}
    offset+=page.length;if(offset===total)return rows;
    if(!page.length||offset>total)throw Error('INCOMPLETE_DB_REFERENCES');
  }
}
export async function assertFrozen({url,key,provider,fetchImpl=fetch}){
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url||'')||!key)throw Error('SOURCE_CONFIGURATION_MISSING');
 const r=await fetchImpl(url+'/rest/v1/rpc/bank_storage_status',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('SERVER_FREEZE_NOT_CONFIRMED');
 const status=await r.json();if(status.frozen!==true||status.provider!==provider)throw Error('SERVER_FREEZE_NOT_CONFIRMED');
}
