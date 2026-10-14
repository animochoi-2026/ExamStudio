const maxBytes=100*1024*1024;
const validKey=/^[a-f0-9-]{36}\/paper-pdf\/[a-f0-9-]{36}\/(questions|answers)\/[a-f0-9-]{36}\.pdf$/;
export function paperPdfGateway({env,signer,fetchImpl=fetch}){
 const origins=(env('BANK_FILE_ORIGINS')||'https://examstudio-shared-bank.pages.dev').split(',').map(x=>x.trim());
 async function rpc(actor,job,grade){
  const service=env('SUPABASE_SERVICE_ROLE_KEY');
  const r=await fetchImpl(env('SUPABASE_URL')+'/rest/v1/rpc/bank_paper_pdf_service',{method:'POST',headers:{apikey:service,authorization:'Bearer '+service,'Content-Type':'application/json',...(grade?{'x-exam-grade':grade}:{})},body:JSON.stringify({actor,job}),signal:AbortSignal.timeout(45000)});
  const data=await r.json();if(!r.ok)throw Error(data.message||'PDF 권한 확인 실패');return data;
 }
 function url(key){if(!validKey.test(key))throw Error('PDF 파일 경로 오류');const endpoint=env('R2_ENDPOINT'),bucket=env('R2_BUCKET');if(env('BANK_STORAGE_PROVIDER')!=='r2'||!/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(endpoint||'')||!/^[a-z0-9-]+$/.test(bucket||''))throw Error('PDF 저장소 설정 오류');return endpoint+'/'+bucket+'/'+key;}
 const stored=async(key,options)=>fetchImpl(await signer.sign(url(key),options),{signal:AbortSignal.timeout(60000)});
 async function remove(key){if(!key)return;const r=await stored(key,{method:'DELETE'});if(!r.ok)throw Error('이전 PDF 정리 대기');const head=await stored(key,{method:'HEAD'});if(head.status!==404)throw Error('PDF 삭제 확인 실패');await rpc(null,{operation:'gc_done',key});}
 return async request=>{
  const origin=request.headers.get('origin'),headers={'Vary':'Origin','Cache-Control':'no-store','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-exam-grade, x-pdf-job','Access-Control-Allow-Methods':'POST, OPTIONS'};
  if(origin&&!origins.includes(origin))return new Response(null,{status:403});if(origin)headers['Access-Control-Allow-Origin']=origin;
  const reply=(status,data)=>Response.json(data,{status,headers});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});if(request.method!=='POST')return reply(405,{error:'POST required'});
  try{
   const encoded=request.headers.get('x-pdf-job');let job;
   if(encoded){if(encoded.length>4096)throw Error('요청 크기 오류');job=JSON.parse(encoded);}
   else{const body=await request.text();if(body.length>4096)throw Error('요청 크기 오류');job=JSON.parse(body);}
   if(job.operation==='cleanup'&&!encoded){
    const keys=await rpc(null,{operation:'gc',secret:job.secret});let deleted=0;
    for(let i=0;i<keys.length;i+=4)await Promise.all(keys.slice(i,i+4).map(async key=>{try{await remove(key);deleted++;}catch{}}));
    return reply(200,{deleted,pending:keys.length-deleted});
   }
   if(!['status','claim','read','upload','abort'].includes(job.operation))throw Error('지원하지 않는 PDF 작업입니다.');
   const authorization=request.headers.get('authorization')||'';if(!authorization.startsWith('Bearer '))return reply(401,{error:'로그인이 필요합니다.'});
   const identity=await fetchImpl(env('SUPABASE_URL')+'/auth/v1/user',{headers:{apikey:env('SUPABASE_ANON_KEY'),authorization},signal:AbortSignal.timeout(15000)});if(!identity.ok)return reply(401,{error:'로그인을 확인하세요.'});
   const user=await identity.json();if(!user.id||!user.email_confirmed_at||user.is_anonymous)return reply(403,{error:'인증된 계정이 필요합니다.'});
   const grade=/^[mh][123]$/.test(job.grade||'')?job.grade:request.headers.get('x-exam-grade');
   const data=await rpc(user.id,job,grade);
   if(job.operation==='read'&&data.hit){
    const head=await stored(data.key,{method:'HEAD'});if(head.status===404){await rpc(user.id,{...job,operation:'missing'},grade);return reply(200,{hit:false});}if(!head.ok||Number(head.headers.get('content-length'))!==data.bytes||head.headers.get('x-amz-meta-sha256')!==data.sha256)throw Error('보관된 PDF 파일 확인에 실패했습니다.');
    const u=new URL(url(data.key));u.searchParams.set('X-Amz-Expires','60');const signed=await signer.sign(u.toString(),{method:'GET',aws:{signQuery:true}});
    return reply(200,{hit:true,url:signed.url,sha256:data.sha256,bytes:data.bytes});
   }
   if(job.operation==='upload'){
    if(!encoded||Number(request.headers.get('content-length'))>maxBytes)throw Error('PDF 용량 제한은 100MB입니다.');
    // Bounded stream read; no partial upload can replace the current file.
    const reader=request.body?.getReader();if(!reader)throw Error('PDF 파일이 없습니다.');const chunks=[];let size=0;
    let readExpired=false;const timer=setTimeout(()=>{readExpired=true;reader.cancel().catch(()=>{});},120000);
    try{for(;;){const {value,done}=await reader.read();if(readExpired)throw Error('PDF 전송 시간이 초과되었습니다.');if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw Error('PDF 용량 제한은 100MB입니다.');}chunks.push(value);}}finally{clearTimeout(timer);}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}chunks.length=0;
    if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw Error('PDF 형식 오류');
    const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    const put=await stored(data.key,{method:'PUT',headers:{'Content-Type':'application/pdf','If-None-Match':'*','x-amz-meta-sha256':sha256},body:bytes});
    if(!put.ok&&put.status!==412)throw Error('새 PDF 업로드에 실패했습니다. 이전 파일은 유지됩니다.');
    const head=await stored(data.key,{method:'HEAD'});if(!head.ok||Number(head.headers.get('content-length'))!==size||head.headers.get('x-amz-meta-sha256')!==sha256)throw Error('새 PDF 저장 확인에 실패했습니다.');
    const committed=await rpc(user.id,{...job,operation:'commit',bytes:size,sha256},grade);
    let cleanupPending=false;try{await remove(committed.obsolete);}catch{cleanupPending=true;}
    return reply(200,{stored:true,cleanupPending});
   }
   return reply(200,data);
  }catch(error){return reply(400,{error:error.message||'PDF 처리 실패'});}
 };
}
