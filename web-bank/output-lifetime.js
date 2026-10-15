export function outputLifetime(signal,ms=180000){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(Error('PDF 준비 시간이 초과되었습니다. 다시 시도해 주세요.')),ms);
 const cancel=()=>controller.abort(signal.reason||Error('PDF 요청을 취소했습니다.'));
 if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
 return {signal:controller.signal,current:()=>!controller.signal.aborted,
  wait(promise){return new Promise((resolve,reject)=>{const abort=()=>reject(controller.signal.reason);if(controller.signal.aborted){Promise.resolve(promise).catch(()=>{});abort();return;}controller.signal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>controller.signal.removeEventListener('abort',abort));});},
  close(){clearTimeout(timeout);signal?.removeEventListener('abort',cancel);controller.abort(Error('PDF 준비가 종료되었습니다.'));}
 };
}
