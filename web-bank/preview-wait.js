// A preview must finish or explain which resource stopped responding.
// Superseded renders release their waiters without publishing a stale layout.
export function previewWait(signal,{timeoutMs=30000}={}){
 return (promise,label='미리보기 자료')=>new Promise((resolve,reject)=>{
  let timer,settled=false;const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);fn(value);};
  const abort=()=>finish(reject,new DOMException('미리보기 준비를 취소했습니다.','AbortError'));
  Promise.resolve(promise).then(value=>finish(resolve,value),error=>finish(reject,error));
  if(signal.aborted)return abort();
  signal.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>finish(reject,Object.assign(Error(label+' 응답이 지연되었습니다. 연결을 확인한 뒤 배치 다시 시도를 눌러 주세요.'),{code:'PREVIEW_RESOURCE_TIMEOUT'})),timeoutMs);
 });
}

// Retry only preparation of the already selected questions, never composition
// or saving. Invalid content, permissions, overflow and cancellation stay errors.
export function isTransientPreparationError(error){
 if(!error||error.name==='AbortError'||['42501','28000','PGRST301'].includes(error.code)||[401,403].includes(Number(error.status)))return false;
 const source=error.originalMessage||error.message||'';
 // 57014 also covers explicit query cancellation. Only statement timeouts retry.
 if(error.code==='57014')return /statement timeout/i.test(source);
 return error.code==='PREVIEW_RESOURCE_TIMEOUT'||error.name==='EncodingError'||[502,503,504].includes(Number(error.status))||/failed to fetch|fetch failed|networkerror|network request failed|load failed|failed to send a request|statement timeout|\b(502|503|504)\b/i.test(source);
}
export async function retryTransientPreview(handle,options={}){
 if(!handle||handle.ready()||options.signal?.aborted)return false;
 const error=handle.layoutError?.();
 if(!error||error.name==='AbortError')return false;
 if(!isTransientPreparationError(error))return false;
 options.onProgress?.('자료 준비가 일시 중단되어 같은 문항으로 한 번 다시 준비합니다.');
 await handle.render({...options,persistLayout:false});
 return true;
}
