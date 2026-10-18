'use strict';
// Server use only. Key never crosses the renderer/HTTP response boundary.
function provider({key,fetchImpl=fetch}){
 if(!key)throw Object.assign(Error('서버 OPENAI_API_KEY 설정이 필요합니다.'),{code:'api_key_missing'});
 async function call(path,body){let r;try{r=await fetchImpl('https://api.openai.com/v1/responses'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(40000)});}catch{throw Object.assign(Error('API 응답 수신 여부 확인 필요'),{responseReceived:false});}
  const v=await r.json();if(!r.ok){const retry=r.headers.get('retry-after');throw Object.assign(Error('평가 API 요청 실패'),{responseReceived:true,status:r.status,code:v.error?.code||null,requestId:r.headers.get('x-request-id'),retryAfterMs:retry?(Number.isFinite(Number(retry))?Number(retry)*1000:Math.max(0,Date.parse(retry)-Date.now())):undefined});}return v;
 }
 return {create:request=>call('',{...request,background:true}),get:id=>{if(!/^resp_[a-zA-Z0-9_-]+$/.test(id))throw Error('응답 ID 오류');return call('/'+id);}};
}
module.exports={provider};
