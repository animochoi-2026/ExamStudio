import {AwsClient} from './vendor/aws4fetch-1.0.20/aws4fetch.mjs';
import {createHash} from 'node:crypto';
const maxBytes=100*1024*1024;
async function boundedJson(request){
 const reader=request.body?.getReader();if(!reader)throw Error('PDF 요청 본문이 없습니다.');const chunks=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1100000)throw Error('PDF 요청 크기 오류');chunks.push(value);}}catch(e){await reader.cancel();throw e;}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
const keyPattern=/^[a-f0-9-]{36}\/(image-pdf\/[a-f0-9-]{36}\/(current|[a-f0-9-]{36}\.(tmp|bak))|native-pdf\/[a-f0-9-]{36}\/[a-f0-9-]{36})\.pdf$/;
export function imagePdfGateway({env,fetchImpl=fetch,signer=new AwsClient({accessKeyId:env('R2_ACCESS_KEY_ID')||'',secretAccessKey:env('R2_SECRET_ACCESS_KEY')||'',service:'s3',region:'auto'})}){
 const origins=(env('BANK_FILE_ORIGINS')||'https://examstudio-shared-bank.pages.dev').split(',').map(x=>x.trim());
 const rpc=async(actor,job,grade)=>{const service=env('SUPABASE_SERVICE_ROLE_KEY'),r=await fetchImpl(env('SUPABASE_URL')+'/rest/v1/rpc/bank_image_pdf_service',{method:'POST',headers:{apikey:service,authorization:'Bearer '+service,'content-type':'application/json',...(grade?{'x-exam-grade':grade}:{})},body:JSON.stringify({actor,job}),signal:AbortSignal.timeout(45000)});const data=await r.json();if(!r.ok)throw Error(data.message||'PDF 권한 확인 실패');return data;};
 const url=key=>{const endpoint=env('R2_ENDPOINT'),bucket=env('R2_BUCKET');if(!keyPattern.test(key)||env('BANK_STORAGE_PROVIDER')!=='r2'||!/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(endpoint||'')||!/^[a-z0-9-]+$/.test(bucket||''))throw Error('PDF 저장소 설정 오류');return endpoint+'/'+bucket+'/'+key;};
 const stored=async(key,options)=>fetchImpl(await signer.sign(url(key),options),{signal:AbortSignal.timeout(90000)});
 const copy=async(from,to,etag)=>{const r=await stored(to,{method:'PUT',headers:{'x-amz-copy-source':'/'+env('R2_BUCKET')+'/'+from,...(etag?{'x-amz-copy-source-if-match':etag}:{})}});if(!r.ok||!(await r.text()).includes('CopyObjectResult'))throw Error('PDF 파일 교체 실패. 이전 파일 복구를 확인합니다.');};
 const remove=async key=>{const r=await stored(key,{method:'DELETE'});if(!r.ok&&r.status!==404)throw Error('PDF 임시 파일 정리 대기');};
 async function recover(slot,secret){
  const prefix=slot.space_id+'/image-pdf/'+slot.id+'/',backup=prefix+slot.pending_id+'.bak.pdf',head=await stored(slot.key,{method:'HEAD'});
  if(head.ok&&head.headers.get('x-amz-meta-sha256')===slot.sha256){/* Old committed bytes already intact. */}
  else if(slot.sha256){const old=await stored(backup,{method:'HEAD'});if(!old.ok||old.headers.get('x-amz-meta-sha256')!==slot.sha256)throw Error('기존 PDF 복구 확인 필요');await copy(backup,slot.key,old.headers.get('etag'));}
  else if(head.ok)await remove(slot.key);
  await rpc(null,{operation:'recovered',slot:slot.id,token:slot.pending_id,secret});
 }
 return async request=>{
  const origin=request.headers.get('origin'),headers={'cache-control':'no-store','vary':'Origin','access-control-allow-headers':'authorization, apikey, content-type, x-client-info, x-exam-grade','access-control-allow-methods':'POST, OPTIONS'};
  if(origin&&!origins.includes(origin))return new Response(null,{status:403});if(origin)headers['access-control-allow-origin']=origin;
  const reply=(status,data)=>Response.json(data,{status,headers});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});if(request.method!=='POST')return reply(405,{error:'POST required'});
  try{
   const {job}=await boundedJson(request);if(!job)throw Error('PDF 요청 오류');
   if(job.operation==='cleanup'){
    const stuck=await rpc(null,{operation:'recover',secret:job.secret});let recovered=0;
    for(const slot of stuck)try{await recover(slot,job.secret);recovered++;}catch{}
    const keys=await rpc(null,{operation:'gc',secret:job.secret});let deleted=0;
    for(const key of keys)try{await remove(key);await rpc(null,{operation:'gc_done',key,secret:job.secret});deleted++;}catch{}
    return reply(200,{deleted,pending:keys.length-deleted,recovered});
   }
   if(!['claim','read','read_previous','upload','finalize','heartbeat','abort'].includes(job.operation))throw Error('지원하지 않는 PDF 작업입니다.');
   const authorization=request.headers.get('authorization')||'';if(!authorization.startsWith('Bearer '))return reply(401,{error:'로그인이 필요합니다.'});
   const auth=await fetchImpl(env('SUPABASE_URL')+'/auth/v1/user',{headers:{apikey:env('SUPABASE_ANON_KEY'),authorization},signal:AbortSignal.timeout(15000)});
   if(!auth.ok)return reply(401,{error:'로그인 권한이 만료되었습니다. 다시 로그인하세요.'});const user=await auth.json();if(!user.id||!user.email_confirmed_at||user.is_anonymous)return reply(403,{error:'인증된 계정이 필요합니다.'});
   const grade=/^[mh][123]$/.test(job.grade||'')?job.grade:request.headers.get('x-exam-grade');
   if(['upload','finalize'].includes(job.operation)&&(!Number.isSafeInteger(job.bytes)||job.bytes<100||job.bytes>maxBytes||!/^[a-f0-9]{64}$/.test(job.sha256||'')))throw Error('PDF 용량 또는 SHA256 확인 실패 (최대 100MB).');
   const data=await rpc(user.id,{...job,operation:job.operation==='finalize'?'promote':job.operation},grade);
   if(['read','read_previous'].includes(job.operation)&&data.hit){
    const head=await stored(data.key,{method:'HEAD'});
    if(!head.ok||Number(head.headers.get('content-length'))!==data.bytes||head.headers.get('x-amz-meta-sha256')!==data.sha256)throw Error('저장된 PDF 파일 확인 실패. 잠시 후 다시 시도하세요.');
    const u=new URL(url(data.key));u.searchParams.set('X-Amz-Expires','60');u.searchParams.set('response-cache-control','no-store');
    const signed=await signer.sign(u.toString(),{method:'GET',aws:{signQuery:true}});return reply(200,{...data,url:signed.url});
   }
   if(job.operation==='upload'){
    if(!Number.isSafeInteger(job.bytes)||job.bytes<100||job.bytes>maxBytes||!/^[a-f0-9]{64}$/.test(job.sha256||''))throw Error('PDF 용량 또는 SHA256 확인 실패 (최대 100MB).');
    const u=new URL(url(data.tempKey));u.searchParams.set('X-Amz-Expires','300');
    const uploadHeaders={'content-type':'application/pdf','x-amz-meta-sha256':job.sha256,'cache-control':'no-store'};
    const signed=await signer.sign(u.toString(),{method:'PUT',headers:uploadHeaders,aws:{signQuery:true}});
    return reply(200,{url:signed.url,headers:uploadHeaders});
   }
   if(job.operation==='finalize'){
    const started=performance.now();let backup=false,replaced=false;
    try{
     const head=await stored(data.tempKey,{method:'HEAD'}),size=Number(head.headers.get('content-length'));
     if(!head.ok||size<100||size>maxBytes||size!==job.bytes)throw Error('업로드된 PDF 크기 확인 실패');
     const response=await stored(data.tempKey,{method:'GET',headers:{'if-match':head.headers.get('etag')}});if(!response.ok)throw Error('업로드된 PDF 읽기 실패');
     // Verify the actual uploaded bytes, not client metadata alone.
     const hash=createHash('sha256'),text=new TextDecoder();let length=0,first=new Uint8Array(),tail=new Uint8Array();
     for await(const chunk of response.body){length+=chunk.length;if(length>size)throw Error('PDF 파일 크기 불일치');hash.update(chunk);
      if(first.length<5){const next=new Uint8Array(Math.min(5,first.length+chunk.length));next.set(first);next.set(chunk.subarray(0,next.length-first.length),first.length);first=next;}
      const next=new Uint8Array(Math.min(1024,tail.length+chunk.length)),keep=Math.max(0,next.length-chunk.length);if(keep)next.set(tail.subarray(-keep));next.set(chunk.subarray(-Math.min(chunk.length,next.length)),keep);tail=next;
     }
     if(length!==size||text.decode(first)!=='%PDF-'||!text.decode(tail).includes('%%EOF'))throw Error('불완전한 PDF 파일입니다. 이전 파일은 유지됩니다.');
     const sha256=hash.digest('hex');
     if(sha256!==job.sha256||sha256!==head.headers.get('x-amz-meta-sha256'))throw Error('PDF SHA256 확인 실패');
     if(data.previous){const old=await stored(data.key,{method:'HEAD'});if(!old.ok||old.headers.get('x-amz-meta-sha256')!==data.sha256)throw Error('기존 PDF 확인 실패');await copy(data.key,data.backupKey,old.headers.get('etag'));backup=true;}
     await copy(data.tempKey,data.key,head.headers.get('etag'));replaced=true;
     const final=await stored(data.key,{method:'HEAD'});if(!final.ok||final.headers.get('x-amz-meta-sha256')!==sha256||Number(final.headers.get('content-length'))!==size)throw Error('최종 PDF 확인 실패');
     const committed=await rpc(user.id,{...job,operation:'commit',sha256,bytes:size,etag:final.headers.get('etag')},grade);
     // Durable GC also retries these deletes if the response is interrupted.
     await Promise.allSettled([remove(data.tempKey),remove(data.backupKey)]);
     return reply(200,{...committed,sha256,bytes:size,pages:job.pages,timings:{verifyStoreMs:performance.now()-started}});
    }catch(error){
     // A lost commit response must never restore older bytes over a committed file.
     let current;try{current=await rpc(user.id,{operation:'outcome',slot:data.key.split('/')[2]},grade);}catch{}
     if(current?.sha256===job.sha256&&current.phase===null)return reply(200,{stored:true,...current});
     // If DB outcome is unknown, retain backup and lease for scheduled recovery.
     if(current){
      // CopyObject may finish even when its HTTP response is lost. Inspect R2,
      // not a client-side boolean, before releasing the promotion lease.
      const final=await stored(data.key,{method:'HEAD'});
      if(!final.ok&&final.status!==404)throw Error('PDF 복구 확인을 기다리고 있습니다. 기존 파일을 정리하지 않습니다.');
      if(data.previous&&(!final.ok||final.headers.get('x-amz-meta-sha256')!==data.sha256)){
       const old=await stored(data.backupKey,{method:'HEAD'});if(!old.ok||old.headers.get('x-amz-meta-sha256')!==data.sha256)throw Error('기존 PDF 복구 확인 필요');await copy(data.backupKey,data.key,old.headers.get('etag'));
      }else if(!data.previous&&final.ok)await remove(data.key);
      await rpc(user.id,{operation:'rollback',slot:data.key.split('/')[2],token:job.token},grade);
     }
     throw error;
    }
   }
   return reply(200,data);
  }catch(error){return reply(400,{error:error.message||'PDF 처리 실패'});}
 };
}
