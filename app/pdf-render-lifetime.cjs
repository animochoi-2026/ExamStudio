'use strict';
// A hidden print window must not keep an export (or a remote cache lease)
// pending forever when Chromium loses a renderer or a resource never loads.
async function renderLifetime(window, render, {timeoutMs=180000}={}) {
 let timer,expired=false;
 const timeoutError=()=>new Error('PDF 출력 준비 시간이 초과되었습니다. 다시 시도하세요.');
 const checkActive=()=>{if(expired)throw timeoutError();};
 try {
  return await Promise.race([
   Promise.resolve().then(()=>render(checkActive)),
   new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(timeoutError());},timeoutMs);})
  ]);
 } finally {
  clearTimeout(timer);
  if(!window.isDestroyed())window.destroy();
 }
}
module.exports={renderLifetime};
