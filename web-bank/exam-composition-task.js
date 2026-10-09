// Only automatic composition uses this worker. Closing generation immediately
// terminates the calculation, so input and cancellation stay responsive.
const version=typeof __COMPOSITION_VERSION__==='undefined'?'development':__COMPOSITION_VERSION__;
export function composeInWorker(candidates,rules,{signal,request}={}){
 if(signal?.aborted)return Promise.reject(new DOMException('시험지 생성 취소','AbortError'));
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('exam-composition-worker.js?v='+version,location.href),{type:'module'});
  let settled=false;
  const finish=(error,result)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);worker.terminate();error?reject(error):resolve(result);};
  const cancel=()=>finish(new DOMException('시험지 생성 취소','AbortError'));
  signal?.addEventListener('abort',cancel,{once:true});
  worker.onmessage=({data})=>data.version!==version?finish(new Error('출제 계산 파일의 버전이 다릅니다. 새로고침 후 다시 실행하세요.')):data.error?finish(new Error(data.error.message)):finish(null,data.result);
  worker.onerror=event=>finish(new Error(event.message||'문항 구성 계산을 불러오지 못했습니다.'));
  worker.onmessageerror=()=>finish(new Error('문항 구성 계산 응답을 확인하지 못했습니다.'));
  try{worker.postMessage(request?{kind:'mock',request,version}:{candidates,rules,version});}catch(error){finish(error);}
 });
}
