import {AwsClient} from './vendor/aws4fetch-1.0.20/aws4fetch.mjs';
const keyPattern=/^[a-f0-9-]{36}\/native-pdf\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.pdf$/;
async function bounded(request,limit){
 const reader=request.body?.getReader();if(!reader)throw Error('요청 본문이 없습니다.');const chunks=[];let length=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit)throw Error('출력 자료 크기 제한을 넘었습니다.');chunks.push(value);}}
 catch(error){await reader.cancel();throw error;}
 const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return bytes;
}
export function nativePdfGateway({env,fetchImpl=fetch,signer=new AwsClient({accessKeyId:env('R2_ACCESS_KEY_ID')||'',secretAccessKey:env('R2_SECRET_ACCESS_KEY')||'',service:'s3',region:'auto'})}){
 const origins=(env('BANK_FILE_ORIGINS')||'https://examstudio-shared-bank.pages.dev').split(',').map(s=>s.trim());
 const rpc=async(actor,job,grade)=>{
  const service=env('SUPABASE_SERVICE_ROLE_KEY'),res=await fetchImpl(env('SUPABASE_URL')+'/rest/v1/rpc/bank_native_pdf_service',{method:'POST',headers:{apikey:service,authorization:'Bearer '+service,'content-type':'application/json',...(grade?{'x-exam-grade':grade}:{})},body:JSON.stringify({actor,job}),signal:AbortSignal.timeout(45000)});
  const data=await res.json();if(!res.ok)throw Error(data.message||'PDF 권한 확인 실패');return data;
 };
 const url=key=>{
  const endpoint=env('R2_ENDPOINT'),bucket=env('R2_BUCKET');if(!keyPattern.test(key)||env('BANK_STORAGE_PROVIDER')!=='r2'||!/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(endpoint||'')||!/^[a-z0-9-]+$/.test(bucket||''))throw Error('PDF 저장소 설정 오류');return endpoint+'/'+bucket+'/'+key;
 };
 const stored=async(key,options)=>fetchImpl(await signer.sign(url(key),options),{signal:AbortSignal.timeout(60000)});
 async function remove(key){if(!key)return;const res=await stored(key,{method:'DELETE'});if(!res.ok)throw Error('PDF 정리 대기');if((await stored(key,{method:'HEAD'})).status!==404)throw Error('PDF 삭제 확인 대기');await rpc(null,{operation:'gc_done',key});}
 return async request=>{
  const origin=request.headers.get('origin'),headers={'cache-control':'no-store','vary':'Origin','access-control-allow-headers':'authorization, apikey, content-type, x-client-info, x-exam-grade','access-control-allow-methods':'POST, OPTIONS'};
  if(origin&&!origins.includes(origin))return new Response(null,{status:403});if(origin)headers['access-control-allow-origin']=origin;
  const reply=(status,data)=>Response.json(data,{status,headers});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});if(request.method!=='POST')return reply(405,{error:'POST required'});
  try{
   const payload=JSON.parse(new TextDecoder().decode(await bounded(request,40*1024*1024))),{job,input,pdfBase64}=payload;
   if(!job||JSON.stringify(job).length>1100000)throw Error('PDF 요청 오류');
   if(['claim','render','upload','commit','renderer_config'].includes(job.operation))return reply(410,{error:'네이티브 PDF 생성은 종료됐습니다. 웹 화면을 새로고침해 이미지 PDF로 생성하세요.'});
   if(job.operation==='cleanup'){
    const keys=await rpc(null,{operation:'gc',secret:job.secret});let deleted=0;
    for(let i=0;i<keys.length;i+=4)await Promise.all(keys.slice(i,i+4).map(async key=>{try{await remove(key);deleted++;}catch{}}));return reply(200,{deleted,pending:keys.length-deleted});
   }
   if(!['claim','read','render','upload','abort'].includes(job.operation))throw Error('지원하지 않는 PDF 작업입니다.');
   const authorization=request.headers.get('authorization')||'';if(!authorization.startsWith('Bearer '))return reply(401,{error:'로그인이 필요합니다.'});
   const identity=await fetchImpl(env('SUPABASE_URL')+'/auth/v1/user',{headers:{apikey:env('SUPABASE_ANON_KEY'),authorization},signal:AbortSignal.timeout(15000)});
   if(!identity.ok)return reply(401,{error:'로그인을 확인하세요.'});const user=await identity.json();if(!user.id||!user.email_confirmed_at||user.is_anonymous)return reply(403,{error:'인증된 계정이 필요합니다.'});
   const grade=/^[mh][123]$/.test(job.grade||'')?job.grade:request.headers.get('x-exam-grade');
   const data=await rpc(user.id,job,grade);
   if(job.operation==='read'&&data.hit){
    const head=await stored(data.key,{method:'HEAD'});if(head.status===404){await rpc(user.id,{...job,operation:'missing'},grade);return reply(200,{hit:false});}
    if(!head.ok||Number(head.headers.get('content-length'))!==data.bytes||head.headers.get('x-amz-meta-sha256')!==data.sha256)throw Error('보관된 PDF 확인 실패');
    const u=new URL(url(data.key));u.searchParams.set('X-Amz-Expires','60');const signed=await signer.sign(u.toString(),{method:'GET',aws:{signQuery:true}});return reply(200,{hit:true,url:signed.url,bytes:data.bytes,sha256:data.sha256});
   }
   if(['render','upload'].includes(job.operation)){
    let bytes,timings={};
    if(job.operation==='render'){
     if(input?.engine!==job.engine||input?.questionCount!==data.questionCount)throw Error('출력 문항 수·생성기 확인 실패');
     const cfg=await rpc(null,{operation:'renderer_config'});
     if(!/^https:\/\/examstudio-pdf-renderer\.[a-z0-9-]+\.workers\.dev$/.test(cfg.url||''))throw Error('PDF 출력 서버 연결 준비가 필요합니다.');
     const res=await fetchImpl(cfg.url,{method:'POST',headers:{authorization:'Bearer '+cfg.secret,'content-type':'application/json'},body:JSON.stringify({input,identity:data.identity}),signal:AbortSignal.timeout(120000)});
     if(!res.ok)throw Error('PDF 생성 실패: '+((await res.json().catch(()=>({}))).error||res.status));
     bytes=await bounded(res,100*1024*1024);timings=JSON.parse(res.headers.get('x-pdf-timings')||'{}');
    }else{
     if(typeof pdfBase64!=='string'||pdfBase64.length>35*1024*1024)throw Error('PDF 크기 제한 오류');bytes=Uint8Array.from(atob(pdfBase64),x=>x.charCodeAt(0));
    }
    const text=new TextDecoder();if(bytes.length<100||text.decode(bytes.subarray(0,5))!=='%PDF-'||!text.decode(bytes.subarray(-1024)).includes('%%EOF'))throw Error('불완전한 PDF입니다. 다시 시도하세요.');
    const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join(''),started=performance.now();
    const put=await stored(data.key,{method:'PUT',headers:{'content-type':'application/pdf','if-none-match':'*','x-amz-meta-sha256':sha256},body:bytes});if(!put.ok&&put.status!==412)throw Error('PDF 저장 실패');
    const head=await stored(data.key,{method:'HEAD'});if(!head.ok||Number(head.headers.get('content-length'))!==bytes.length||head.headers.get('x-amz-meta-sha256')!==sha256)throw Error('PDF 저장 확인 실패');
    const committed=await rpc(user.id,{...job,operation:'commit',sha256,bytes:bytes.length},grade);timings.uploadMs=performance.now()-started;
    // The minute cleanup job retries obsolete objects without delaying download.
    const cleanupPending=!!committed.obsolete;
    return reply(200,{stored:true,bytes:bytes.length,sha256,timings,cleanupPending});
   }
   return reply(200,data);
  }catch(error){return reply(400,{error:error.message||'PDF 처리 실패'});}
 };
}
