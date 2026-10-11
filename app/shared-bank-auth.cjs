'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const {BankError}=require('./bank-auth.cjs');
const Locks=require('./session-lock.cjs'), Failure=require('./operation-failure.cjs');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function configuration(c){
 if(c&&Object.keys(c).some(k=>!['url','spaceId','publishableKey'].includes(k)))throw Error('연결 JSON에는 url, spaceId, publishableKey만 넣으세요. 개인 정보나 비밀키를 포함할 수 없습니다.');
 if(!c||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.url)||!UUID.test(c.spaceId))throw Error('공동 문제은행 연결 JSON의 URL·spaceId를 확인하세요.');
 const key=c.publishableKey;
 let publicKey=typeof key==='string'&&/^sb_publishable_[\w-]+$/.test(key);
 if(typeof key==='string'&&key.split('.').length===3){try{publicKey=JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role==='anon';}catch{}}
 if(!publicKey)throw Error('공개 publishable/anon 키만 허용합니다. 관리자 secret/service_role 키는 앱에 넣지 마세요.');
 return{url:c.url,spaceId:c.spaceId,publishableKey:key};
}
class SharedBankAuth{
 constructor({directory,safeStorage,openExternal,fetchImpl=fetch,port=53682}){Object.assign(this,{safeStorage,openExternal,fetch:fetchImpl,port});this.file=path.join(directory,'shared-auth.enc');this.epoch=0;this.error=null;}
 read(){if(!fs.existsSync(this.file))return{};try{return JSON.parse(this.safeStorage.decryptString(fs.readFileSync(this.file)));}catch{throw new BankError('이 PC의 공동 로그인 정보를 읽지 못했습니다. 연결 설정을 다시 가져오세요.','auth');}}
 write(v,lease){const owned=!lease;if(owned)lease=Locks.acquire(this.file);if(!lease)throw Object.assign(new BankError('공동 문제은행 인증 갱신 중입니다. 잠시 후 다시 시도하세요.','network',true),{service:'supabase',dispatched:false});try{if(!this.safeStorage.isEncryptionAvailable()||this.safeStorage.getSelectedStorageBackend?.()==='basic_text')throw new BankError('운영체제 보안 저장소를 사용할 수 없습니다.','auth');fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=this.file+'.'+crypto.randomUUID()+'.tmp',bytes=this.safeStorage.encryptString(JSON.stringify({...v,revision:crypto.randomUUID()}));const fd=fs.openSync(temp,'wx');try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,this.file);}finally{if(owned)lease.release();}}

 configure(c){if(this.session)throw Error('진행 중인 로그인을 취소하세요.');this.epoch++;this.write({config:configuration(c)});this.error=null;}
 config(){const c=this.read().config;if(!c)throw new BankError('관리자에게 받은 공동 문제은행 연결 JSON을 먼저 불러오세요.','auth');return configuration(c);}
 status(){try{const v=this.read();return{kind:'shared',configured:!!v.config,connected:!!v.tokens?.refresh_token&&!!v.member&&!this.error&&!v.authFailure,account:v.account||null,member:v.member||null,projectUrl:v.config?.url,spaceId:v.config?.spaceId,error:v.authFailure?.message||this.error,connecting:!!this.session};}catch(e){return{kind:'shared',configured:false,connected:false,error:e.message};}}
 async request(route,{method='GET',body,token}={}){const c=this.config();let r;try{r=await this.fetch(c.url+route,{method,headers:{apikey:c.publishableKey,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});}catch{throw Object.assign(new BankError('공동 저장 서버에 연결하지 못했습니다.','network',true),{service:'supabase',code:'network'});}const v=await r.json().catch(()=>null);if(!r.ok){const message=v?.message||v?.msg||v?.error_description||v?.error||'공동 저장 서버 요청 실패';const conflict=r.status===409||v?.code==='PT409'||/수정 충돌|검수값이 수정/.test(message),statementTimeout=v?.code==='57014'&&/statement timeout/i.test(message)||/canceling statement due to statement timeout/i.test(message);const error=new BankError(Failure.message(message),conflict?'conflict':statementTimeout?'timeout':r.status===401||r.status===403||(r.status===400&&route.includes('grant_type=refresh_token'))?'auth':'failed',!conflict&&!statementTimeout&&(r.status===429||r.status>=500));Object.assign(error,{service:'supabase',status:r.status,serverCode:typeof v?.code==='string'?v.code:typeof v?.error_code==='string'?v.error_code:undefined});if(typeof v?.code==='string'&&v.code.startsWith('LOSSLESS_'))error.losslessCode=v.code;throw error;}return v;}
 async accept(t,epoch){const revision=this.read().revision;const account=await this.request('/auth/v1/user',{token:t.access_token});if(!account.id||!account.email_confirmed_at)throw new BankError('확인된 Google 계정으로 로그인하세요.','auth');const c=this.config(),member=await this.request('/rest/v1/rpc/bank_join',{method:'POST',body:{s:c.spaceId},token:t.access_token});return Locks.withLock(this.file,async lease=>{if(epoch!==this.epoch||revision!==this.read().revision)throw new BankError('로그인 상태가 변경되었습니다. 공동 문제은행 연결을 다시 확인하세요.','auth');this.write({config:c,account:{id:account.id,email:account.email},member,tokens:{...t,expiresAt:Date.now()+t.expires_in*1000}},lease);this.error=null;return this.status();});}
 async token(){if(this.refreshing)return this.refreshing;this.refreshing=Locks.withLock(this.file,async lease=>{
  const v=this.read();if(v.authFailure)throw Object.assign(new BankError(v.authFailure.message,'auth'),{service:'supabase',serverCode:v.authFailure.serverCode});
  if(!v.tokens?.refresh_token)throw Object.assign(new BankError('공동 문제은행에 다시 로그인하세요. 대기열과 저장 결과는 유지됩니다.','auth'),{service:'supabase'});
  if(v.tokens.expiresAt>Date.now()+60000){this.error=null;return v.tokens.access_token;}
  if(v.refreshIntent){const authFailure={message:'공동 문제은행 인증 갱신 결과를 확인하지 못했습니다. 다시 로그인하세요.',serverCode:'refresh_uncertain'};this.write({...v,authFailure},lease);throw Object.assign(new BankError(authFailure.message,'auth'),{service:'supabase',serverCode:authFailure.serverCode});}
  // A durable intent prevents replaying a consumed token after an interrupted refresh.
  this.write({...v,refreshIntent:{at:new Date().toISOString()}},lease);
  let rotated=false;try{const t=await this.request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:v.tokens.refresh_token}});
   if(!t?.access_token||!t?.refresh_token||!Number.isFinite(t.expires_in))throw Object.assign(Error('공동 문제은행 갱신 응답을 확인하지 못했습니다.'),{code:'refresh_uncertain',service:'supabase'});
   // Persist rotation BEFORE user/membership/network requests. Membership is checked by its own API.
   rotated=true;this.write({...v,refreshIntent:undefined,authFailure:undefined,tokens:{...t,expiresAt:Date.now()+t.expires_in*1000}},lease);this.error=null;return t.access_token;
  }catch(e){if(rotated)throw e;const f=Failure.classify(e);if(f.category==='login'||f.category==='unknown'||e.code==='refresh_uncertain'){
    const authFailure={message:'공동 문제은행에 다시 로그인하세요. '+Failure.message(e),serverCode:e.serverCode||'refresh_uncertain'};this.write({...v,refreshIntent:undefined,authFailure},lease);this.error=authFailure.message;
    throw Object.assign(new BankError(authFailure.message,'auth'),{service:'supabase',serverCode:authFailure.serverCode});
   }this.write({...v,refreshIntent:undefined},lease);throw e;}
 }).finally(()=>this.refreshing=null);return this.refreshing;}

 async membership(){const token=await this.token();return this.request('/rest/v1/rpc/bank_join',{method:'POST',body:{s:this.config().spaceId},token});}
 invalidate(rejectedToken){const lease=Locks.acquire(this.file);if(!lease)return;try{const v=this.read();if(v.tokens&&(!rejectedToken||rejectedToken===v.tokens.access_token)){v.tokens.expiresAt=0;this.write(v,lease);}}finally{lease.release();}}
 async connect({browser='auto'}={}){
  if(this.session)throw Error('로그인 창을 완료하거나 취소하세요.');const c=this.config(),epoch=++this.epoch,verifier=crypto.randomBytes(48).toString('base64url'),state=crypto.randomBytes(32).toString('base64url');let finish,settled=false,consumed=false;
  const completion=new Promise((resolve,reject)=>{finish=(e,v)=>{if(settled)return;settled=true;if(e)this.epoch++;e?reject(e):resolve(v);};});completion.catch(()=>{});
  const server=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://127.0.0.1');if(u.pathname!=='/bank/callback'){res.writeHead(404).end();return;}if(req.method!=='GET'||u.searchParams.get('bank_state')!==state){res.writeHead(400).end('Invalid state');return;}if(consumed||settled){res.writeHead(409).end();return;}consumed=true;res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');try{if(!u.searchParams.get('code'))throw new BankError('로그인이 취소되었습니다.','auth');const t=await this.request('/auth/v1/token?grant_type=pkce',{method:'POST',body:{auth_code:u.searchParams.get('code'),code_verifier:verifier}});const result=await this.accept(t,epoch);res.end('공동 문제은행에 연결했습니다. 문제공방으로 돌아가세요.');finish(null,result);}catch(e){res.end('연결하지 못했습니다. 문제공방에서 초대 여부와 오류를 확인하세요.');finish(e);}});
  await new Promise((resolve,reject)=>{server.once('error',()=>reject(Error('로그인용 포트 53682를 사용할 수 없습니다. 다른 문제공방 로그인 창을 닫으세요.')));server.listen(this.port,'127.0.0.1',resolve);});
  this.session={cancel:()=>finish(new BankError('로그인을 취소했습니다. 기존 연결은 유지됩니다.','auth'))};const timer=setTimeout(()=>finish(new BankError('로그인 시간이 만료되었습니다. 로그인 버튼을 다시 눌러 주세요.','auth')),600000);
  try{const u=new URL(c.url+'/auth/v1/authorize');u.search=new URLSearchParams({provider:'google',redirect_to:`http://127.0.0.1:${server.address().port}/bank/callback?bank_state=${state}`,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'s256',prompt:'select_account'});await this.openExternal(u.href,{browser});return await completion;}catch(e){this.error=e.message;throw e;}finally{clearTimeout(timer);server.closeAllConnections();server.close();this.session=null;}
 }
 cancel(){this.session?.cancel();}
 disconnect(){const lease=Locks.acquire(this.file);if(!lease)throw new BankError('공동 문제은행 갱신이 끝난 뒤 연결을 해제하세요.','network',true);try{this.epoch++;this.cancel();const v=this.read();this.write({config:v.config},lease);this.error=null;return this.status();}finally{lease.release();}}
}
module.exports={SharedBankAuth,configuration};
