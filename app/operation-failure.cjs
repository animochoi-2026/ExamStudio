'use strict';
// Only allowlisted error metadata crosses the transport/persistence boundary.
function message(value){return String(value?.message||value||'알 수 없는 오류').replace(/Bearer\s+[^\s"']+/gi,'Bearer [redacted]').replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g,'[redacted]').replace(/\bsk-[\w-]+/g,'[redacted]').replace(/((?:refresh_token|access_token|password)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,'$1[redacted]').slice(0,2000);}
function details(error,service){
 let parsed;try{parsed=JSON.parse(error?.message||'');}catch{}
 const e=parsed?{...parsed,...error}:error||{},nested=e.error&&typeof e.error==='object'?e.error:{},info=e.codexErrorInfo||e.data?.codexErrorInfo||nested.codexErrorInfo;
 const result={message:message(error),service:service||e.service};
 for(const key of ['code','status','retryAfterMs','dispatched','queueStopped','requestRejected','threadId','turnId'])if(['string','number','boolean'].includes(typeof e[key]))result[key]=e[key];
 const serverCode=e.serverCode||nested.code||nested.type||e.data?.code;
 if(typeof serverCode==='string')result.serverCode=serverCode.slice(0,100);
 if(typeof info==='string')result.codexErrorInfo=info;
 else if(info&&typeof info==='object'){const key=Object.keys(info)[0];result.codexErrorInfo=info.type||key;const status=info.httpStatusCode??info[key]?.httpStatusCode;if(Number.isInteger(status))result.status=status;}
 return result;
}
function transport(error,service){return Object.assign(new Error(message(error)),details(error,service));}
function classify(error){
 const d=details(error),c=[d.code,d.serverCode,d.codexErrorInfo].filter(Boolean).map(x=>String(x).toLowerCase()),m=d.message;
 let category='item';
 if(c.includes('response_unknown'))category='unknown';
 else if(c.some(x=>['usagelimitexceeded','insufficient_quota','usage_limit_reached','quota_exceeded'].includes(x)))category='usage';
 else if(c.some(x=>['auth','unauthorized','authentication_error','authenticationerror','refresh_token_already_used','refresh_token_not_found','session_not_found','refresh_uncertain'].includes(x))||d.status===401)category='login';
 else if(d.status===429||c.some(x=>['ratelimitexceeded','rate_limit_exceeded','rate_limit_error'].includes(x)))category='rate';
 else if(c.some(x=>['responsestreamdisconnected','responsestreamconnectionfailed','responsetoomanyfailedattempts'].includes(x)))category='unknown';
 else if(d.status>=500||c.some(x=>['server_error','internalservererror','service_unavailable'].includes(x)))category='service';
 else if(c.some(x=>/^(ECONN|ETIMEDOUT|network|offline)/i.test(x)))category=d.dispatched===false?'connection':'unknown';
 else if(c.some(x=>['enospc','eacces','eperm'].includes(x))||/^(ENOSPC|EACCES|EPERM)\b/.test(m))category='storage';
 else if(c.some(x=>['invalid_request_error','model_not_found'].includes(x))&&/model|模型|모델/i.test(m))category='configuration';
 // Exact legacy messages are recoverable evidence, not fuzzy quota detection.
 else if(/^Invalid Refresh Token: (Already Used|Refresh Token Not Found)$/i.test(m))category='login';
 else if(/원문\s*판독.*확인|보류|확인 필요|미확정|보호|미완료|산출물|누락|불명확|애매/.test(m))category='review';
 return {...d,category,service:d.service||(category==='login'&&/Refresh Token/.test(m)?'supabase':undefined),global:!['item','review'].includes(category)};
}
const waitingStatus=category=>category==='usage'?'waiting_usage':category==='login'?'waiting_login':'waiting_service';
const label=category=>({usage:'사용량 소진 · 초기화 후 이어하기',login:'로그인 필요',rate:'속도 제한 · 잠시 후 이어하기',service:'서비스 장애 · 복구 후 이어하기',connection:'통신 대기',configuration:'AI 설정 확인 필요',storage:'저장 공간·권한 확인 필요',unknown:'결과 확인 필요'})[category];
module.exports={message,details,transport,classify,waitingStatus,label};
