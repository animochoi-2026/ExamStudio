// Only short-lived GET URLs enter memory. No keys or URLs are persisted.
export async function downloadChunk(client,config,key) {
  if(!config.storageGateway) return client.storage.from('question-bank').download(key);
  for(let attempt=0;attempt<2;attempt++) {
  const {data,error}=await client.functions.invoke('bank-storage',{body:{operation:'read',key}});
  if(error) return {error};
  if(data.provider==='supabase') return client.storage.from('question-bank').download(key);
  try {
    const url=new URL(data.url);
    if(data.provider!=='r2'||url.protocol!=='https:'||!url.hostname.endsWith('.r2.cloudflarestorage.com')) throw Error('Invalid file access response');
    let response;
    try{response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});}
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
