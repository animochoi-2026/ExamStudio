'use strict';
const crypto=require('node:crypto'),fs=require('node:fs');
const R=require('./upload-recovery.cjs'),{BankError}=require('./bank-auth.cjs');
const flights=new Map();
const messages={waiting:'같은 원본 시험지를 처리 중입니다. 완료된 결과를 함께 사용합니다.',reused:'원본 시험지가 이미 업로드·검증되어 기존 파일을 재사용합니다.',forbidden:'이 원본 시험지에 접근하거나 변경할 권한이 없습니다.',conflict:'서버에 저장된 원본 시험지와 현재 파일의 내용이 다릅니다. 원본 파일을 확인해 주세요.'};
function state(value,entryId,extra={}){const c=R.context.getStore();if(!c)return;c.job.sourceUpload={state:value,entryId,...extra};c.job.uploadState=value==='검증 완료'?'문항 이미지 확인':'원본 준비 대기';c.save();}
function match(storage,e,args,sha){const c=storage.auth.config();if(!e||e.space_id!==c.spaceId||e.props?.role!=='source'||e.props?.sourceKey!==args.properties.sourceKey||(args.reservedId&&e.id!==args.reservedId))throw Object.assign(new BankError(messages.forbidden,'forbidden'),{status:403});if(e.sha256!==sha||Number(e.size)!==fs.statSync(args.file).size)throw new BankError(messages.conflict,'conflict');return e;}
async function run(storage,args,work){
 const sha=crypto.createHash('sha256').update(fs.readFileSync(args.file)).digest('hex'),member=await storage.auth.membership(),c=storage.auth.config();
 const key=[c.url,c.spaceId,member.userId,args.properties.sourceKey,sha].join(':');
 const active=flights.get(key);
 if(active){state('대기',args.id,{message:messages.waiting});try{const result=await active;match(storage,result.raw,args,sha);state('검증 완료',result.id,{reused:true,message:messages.reused});return result;}catch(e){state('재시도 대기',args.id);throw e;}}
 const pending=Promise.resolve().then(()=>work());flights.set(key,pending);
 try{const result=await pending;state('검증 완료',result.id,{reused:!!result.sourceReused,message:result.sourceReused?messages.reused:undefined});return result;}
 catch(e){state(e.code==='conflict'?'실패':'재시도 대기',args.id);throw e;}
 finally{if(flights.get(key)===pending)flights.delete(key);}
}
async function acquire(storage,e,args,sha,{sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now}={}){
 match(storage,e,args,sha);const claimToken=crypto.randomUUID(),start=now();
 const call=async action=>{try{return await storage.rpc('bank_source_upload_claim',{entry_id:e.id,expected_sha:sha,claim_token:claimToken,action});}catch(error){if(error.status===403)error.message=messages.forbidden;if(error.serverCode==='22000')throw new BankError(messages.conflict,'conflict');throw error;}};
 for(;;){const result=await call('claim');match(storage,result.entry,{...args,reservedId:e.id},sha);
  if(result.state==='verified')return {entry:result.entry,reused:true,release:async()=>{},renew:async()=>{}};
  if(result.state==='claimed'){state('업로드 중',e.id);return {entry:result.entry,reused:false,release:()=>call('release'),renew:async()=>{const r=await call('renew');if(r.state==='verified')return r.entry;if(r.state!=='claimed')throw Object.assign(Error(messages.waiting),{code:'timeout',retryable:true});return null;}};}
  state('대기',e.id,{message:messages.waiting,leaseExpiresAt:result.expiresAt});
  if(now()-start>=45000)throw Object.assign(Error('원본 준비 대기 시간이 지나 재시도 대기로 전환했습니다.'),{code:'timeout',retryable:true});
  await sleep(1000+Math.floor(Math.random()*250));
 }
}
async function verifiedAfter403(storage,e,args,sha){
 // Authenticated read plus explicit ownership check: never turn arbitrary 403 into success.
 const member=await storage.auth.membership(),m=await storage.maybe(e.id);if(!m)throw Object.assign(new BankError(messages.forbidden,'forbidden'),{status:403});
 const actual=match(storage,m.raw,{...args,reservedId:e.id},sha);
 if(actual.owner_id!==member.userId||!actual.verified)throw Object.assign(new BankError(messages.forbidden,'forbidden'),{status:403});
 state('검증 완료',e.id,{reused:true,message:messages.reused});return {...m,sourceReused:true};
}
module.exports={run,acquire,match,state,verifiedAfter403,messages};
