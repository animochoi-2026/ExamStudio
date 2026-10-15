// Only short-lived GET URLs enter memory. No keys or URLs are persisted.
export async function readChunkRange(client,config,key,begin,end,{signal}={}){
 if(!Number.isSafeInteger(begin)||!Number.isSafeInteger(end)||begin<0||end<=begin)throw Error('원본 파일 요청 범위가 잘못되었습니다.');
 for(let attempt=0;attempt<2;attempt++){
  signal?.throwIfAborted();let url;
  if(config.storageGateway){const {data,error}=await client.functions.invoke('bank-storage',{body:{operation:'read',key},signal});if(error)throw error;
   if(data.provider==='r2'){const target=new URL(data.url);if(target.protocol!=='https:'||!target.hostname.endsWith('.r2.cloudflarestorage.com'))throw Error('Invalid file access response');url=target.href;}
   else if(data.provider!=='supabase')throw Error('Unknown file provider');
  }
  if(!url){const {data,error}=await client.storage.from('question-bank').createSignedUrl(key,60);if(error)throw error;url=data.signedUrl;}
  const response=await fetch(url,{headers:{Range:`bytes=${begin}-${end-1}`},credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal});
  if(response.status===403&&attempt===0){await response.body?.cancel();continue;}
  // Never silently download the complete original when byte ranges fail.
  // Some private buckets do not expose Content-Range through CORS. HTTP 206
  // and exact byte length are still required; validate the header when exposed.
  const header=response.headers.get('content-range'),range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(header||'');
  if(response.status!==206||header&&(!range||Number(range[1])!==begin||Number(range[2])!==end-1)){await response.body?.cancel();throw Error('원본 PDF 부분 읽기를 사용할 수 없습니다. 다시 시도해 주세요.');}
  const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==end-begin)throw Error('원본 PDF 부분 파일 크기가 맞지 않습니다.');return bytes;
 }
}
export async function downloadChunk(client,config,key,{signal}={}) {
  if(!config.storageGateway) return client.storage.from('question-bank').download(key);
  for(let attempt=0;attempt<2;attempt++) {
  signal?.throwIfAborted();const {data,error}=await client.functions.invoke('bank-storage',{body:{operation:'read',key},signal});
  if(error) return {error};
  if(data.provider==='supabase') return client.storage.from('question-bank').download(key);
  try {
    const url=new URL(data.url);
    if(data.provider!=='r2'||url.protocol!=='https:'||!url.hostname.endsWith('.r2.cloudflarestorage.com')) throw Error('Invalid file access response');
    let response;
    try{response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal});}
    catch(error){
      // R2 omits CORS headers on expired URLs; browsers expose a network error
      // instead of HTTP 403. Reauthorize once, even in that case.
      if(attempt===0&&error instanceof TypeError)continue;
      throw error;
    }
    // Reauthorize once after expiry; never retry a gateway permission denial.
    if(response.status===403&&attempt===0){await response.body?.cancel();continue;}
    if(!response.ok) throw Error('파일 접근 주소가 만료되었거나 읽기에 실패했습니다. 다시 열어 주세요.');
    return {data:await response.blob()};
  } catch(error) {return {error};}
  }
}
