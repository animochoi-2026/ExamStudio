// Server-only adapter. Callers must pass the user's JWT, never a service JWT.
export const CHUNK_SIZE = 6291456;
export const objectName = (e, i) => `${e.space_id}/${e.id}/${String(i).padStart(3, '0')}`;
const validName = /^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[0-9]{3}$/;
export function createFileStore({env, fetchImpl = fetch, signer}) {
  const provider = env('BANK_STORAGE_PROVIDER') || 'supabase';
  if (!['supabase', 'r2'].includes(provider)) throw Error('STORAGE_PROVIDER_INVALID');
  const url = env('SUPABASE_URL'), anon = env('SUPABASE_ANON_KEY');
  const headers = authorization => ({apikey: anon, authorization, 'Content-Type': 'application/json'});
  async function rpc(name, body, authorization) {
    const r = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {method:'POST',headers:headers(authorization),body:JSON.stringify(body)});
    if (!r.ok) throw Error('STORAGE_AUTHORIZATION_FAILED');
    const text = await r.text(); return text ? JSON.parse(text) : null;
  }
  async function allowed(key, operation, authorization) {
    if (!validName.test(key) || !authorization?.startsWith('Bearer ')) throw Error('STORAGE_ACCESS_DENIED');
    // This checks DB mode, write freeze, membership, file ownership and revision visibility.
    if (await rpc('bank_file_access', {object_name:key, operation, expected_provider:provider}, authorization) !== true)
      throw Error('STORAGE_ACCESS_DENIED');
  }
  function target(key) {
    const endpoint=env('R2_ENDPOINT'), bucket=env('R2_BUCKET');
    if (!/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(endpoint || '') || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket || '') || !signer)
      throw Error('R2_CONFIGURATION_MISSING');
    return `${endpoint}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
  async function signed(key, options = {}) {
    const request = await signer.sign(target(key), options);
    return fetchImpl(request);
  }
  async function read(key, authorization) {
    if (provider === 'supabase') return fetchImpl(`${url}/storage/v1/object/authenticated/question-bank/${key}`, {headers:headers(authorization)});
    await allowed(key, 'read', authorization);
    return signed(key, {method:'GET'});
  }
  async function access(key, authorization) {
    await allowed(key, 'read', authorization);
    if (provider !== 'r2') return {provider};
    const u = new URL(target(key)); u.searchParams.set('X-Amz-Expires', '60');
    const request = await signer.sign(u.toString(), {method:'GET',aws:{signQuery:true}});
    return {provider, url:request.url, expiresIn:60};
  }
  async function put(key, bytes, authorization) {
    if (provider === 'supabase') return fetchImpl(`${url}/storage/v1/object/question-bank/${key}`, {method:'POST',headers:{...headers(authorization),'Content-Type':'application/octet-stream','x-upsert':'false'},body:bytes});
    await allowed(key, 'write', authorization);
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > CHUNK_SIZE) throw Error('STORAGE_CHUNK_LIMIT');
    // Immutable names: a replay is checked by the existing client checksum path.
    const r = await signed(key, {method:'PUT',headers:{'Content-Type':'application/octet-stream','If-None-Match':'*'},body:bytes});
    if (r.status === 412) return Response.json({error:'Duplicate'}, {status:409});
    return r;
  }
  async function remove(keys, authorization) {
    if (provider === 'supabase') {
      const r=await fetchImpl(`${url}/storage/v1/object/question-bank`, {method:'DELETE',headers:headers(authorization),body:JSON.stringify({prefixes:keys})});
      if(!r.ok) throw Error('STORAGE_DELETE_FAILED'); return;
    }
    for (const key of keys) await allowed(key,'delete',authorization);
    for (const key of keys) {
      const r=await signed(key,{method:'DELETE'}); if(!r.ok) throw Error('STORAGE_DELETE_FAILED');
      const head=await signed(key,{method:'HEAD'}); if(head.status!==404) throw Error('STORAGE_DELETE_UNCONFIRMED');
      // Receipts permit SQL finish while preserving the untouched Supabase backup.
      const service=env('SUPABASE_SERVICE_ROLE_KEY');
      const receipt=await fetchImpl(`${url}/rest/v1/rpc/bank_r2_delete_receipt`,{method:'POST',headers:{apikey:service,authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({object_name:key})});
      if(!receipt.ok) throw Error('STORAGE_RECEIPT_FAILED');
    }
  }
  async function usage(spaceId,authorization) {
    if(!/^[a-f0-9-]{36}$/.test(spaceId))throw Error('INVALID_SPACE');
    // Existing owner-only RPC grants capacity visibility; ordinary members cannot list.
    const baseline=await rpc('bank_project_usage',{s:spaceId},authorization);
    if(provider==='supabase')return {...baseline,provider};
    const xmlText=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
    let token,objects=0,bytes=0;const seen=new Set();
    do {
      const u=new URL(target(''));u.searchParams.set('list-type','2');u.searchParams.set('prefix',spaceId+'/');u.searchParams.set('max-keys','1000');if(token)u.searchParams.set('continuation-token',token);
      const r=await fetchImpl(await signer.sign(u.toString(),{method:'GET'}));if(!r.ok)throw Error('USAGE_UNAVAILABLE');
      const xml=await r.text();if(!xml.includes('<ListBucketResult')||xml.includes('<!DOCTYPE'))throw Error('USAGE_INVALID');
      for(const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){const size=Number(/<Size>(\d+)<\/Size>/.exec(match[1])?.[1]);if(!Number.isSafeInteger(size)||size<0)throw Error('USAGE_INVALID');objects++;bytes+=size;}
      if(!/<IsTruncated>true<\/IsTruncated>/.test(xml))break;
      token=xmlText(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1]||'');if(!token||seen.has(token))throw Error('USAGE_INCOMPLETE');seen.add(token);
    }while(true);
    return {...baseline,provider,r2Objects:objects,r2Bytes:bytes,r2MeasuredAt:new Date().toISOString()};
  }
  return {provider,read,access,put,remove,rpc,usage};
}
