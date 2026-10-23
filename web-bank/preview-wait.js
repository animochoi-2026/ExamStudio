// A preview must finish or explain which resource stopped responding.
// Superseded renders release their waiters without publishing a stale layout.
export function previewWait(signal,{timeoutMs=30000}={}){
 return (promise,label='미리보기 자료')=>new Promise((resolve,reject)=>{
  let timer,settled=false;const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);fn(value);};
  const abort=()=>finish(reject,new DOMException('미리보기 준비를 취소했습니다.','AbortError'));
  Promise.resolve(promise).then(value=>finish(resolve,value),error=>finish(reject,error));
  if(signal.aborted)return abort();
  signal.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>finish(reject,Error(label+' 응답이 지연되었습니다. 연결을 확인한 뒤 배치 다시 시도를 눌러 주세요.')),timeoutMs);
 });
}
