'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const {BankError}=require('./bank-auth.cjs');
const API='https://www.googleapis.com/drive/v3',UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
const FOLDER='application/vnd.google-apps.folder',APP='examstudio-bank-v1';
const digest=(bytes,algorithm='sha256')=>crypto.createHash(algorithm).update(bytes).digest('hex');
const quote=x=>String(x).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const validId=x=>typeof x==='string'&&/^[\w-]{5,200}$/.test(x);
class DriveBankStorage{
 constructor({auth,fetchImpl=fetch}){this.auth=auth;this.fetch=fetchImpl;}
 async request(url,{raw=false,...options}={},renew=true){
  if(!/^https:\/\/www\.googleapis\.com\/(?:drive\/v3\/|upload\/drive\/v3\/)/.test(url))throw new BankError('허용되지 않은 Drive 주소입니다.');
  let response;try{response=await this.fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(90000),headers:{...options.headers,Authorization:'Bearer '+await this.auth.token()}});}catch(e){if(e instanceof BankError)throw e;throw new BankError('Drive 통신에 실패했습니다. 로컬 문항은 보존되어 있습니다.','network',true);}
  if(response.status===401&&renew){this.auth.invalidate();return this.request(url,{raw,...options},false);}
  if(response.ok||response.status===308)return raw?response:response.status===204?{}:response.json();
  let reason='';try{const value=await response.json();reason=value.error?.errors?.[0]?.reason||'';}catch{}
  if(response.status===404)throw new BankError('Drive 파일을 찾을 수 없거나 이 앱에 접근 권한이 없습니다.','not_found');
  if(response.status===409)throw new BankError('동일한 파일 ID가 이미 존재합니다.','exists');
  if(response.status===401)throw new BankError('Google 인증이 만료되었습니다. 재연결하세요.','auth');
  const transient=response.status===429||response.status>=500||['rateLimitExceeded','userRateLimitExceeded'].includes(reason);
  throw new BankError(reason==='storageQuotaExceeded'?'Google Drive 저장공간이 부족합니다.':response.status===403?'Drive 권한 또는 사용 한도를 확인하세요.':`Drive 요청 실패 (${response.status})`,transient?'network':'permission',transient);
 }
 async generateId(){return (await this.request(API+'/files/generateIds?count=1&space=drive&type=files')).ids[0];}
 async get(id){if(!validId(id))throw Error('Drive 파일 ID를 확인하세요.');return this.request(API+`/files/${id}?fields=id,name,mimeType,size,md5Checksum,sha256Checksum,trashed,parents,appProperties,capabilities,owners,permissions,modifiedTime`);}
 async maybe(id){try{return await this.get(id);}catch(e){if(e.code==='not_found')return null;throw e;}}
 async list(query,pageToken=null){const params=new URLSearchParams({q:query,spaces:'drive',pageSize:'100',fields:'nextPageToken,files(id,name,mimeType,size,md5Checksum,parents,appProperties,modifiedTime)',...(pageToken?{pageToken}:{})});return this.request(API+'/files?'+params);}
 async find(key,parent){return (await this.list(`trashed = false and mimeType = '${FOLDER}' and appProperties has { key='bankKey' and value='${quote(key)}' }${parent?` and '${quote(parent)}' in parents`:''}`)).files;}
 async checkRoot(id){const f=await this.get(id);if(f.trashed||f.mimeType!==FOLDER||!f.capabilities?.canAddChildren)throw Error('쓰기가 가능한 문제은행 폴더를 지정하세요.');if(!(f.owners||[]).some(o=>o.me)||f.permissions?.some(p=>p.type!=='user'||p.role!=='owner'))throw Error('문제은행은 본인 소유의 비공개 폴더를 사용하세요. 공유 권한이 있는 폴더는 연결하지 않았습니다.');return f;}
 async folder({key,name,parent,registry,save}){
  const k=digest(Buffer.from(key));let entry=registry[k];
  if(entry?.id){const known=await this.maybe(entry.id);if(known){if(known.trashed||known.mimeType!==FOLDER||parent&&!known.parents?.includes(parent))throw new BankError('저장 폴더가 이동되거나 변경되었습니다. 연결 폴더를 확인하세요.','conflict');return known.id;}if(entry.created)throw new BankError('기존 저장 폴더의 접근 권한이 사라졌습니다. 폴더 연결을 확인하세요.','permission');}
  const found=await this.find(k,parent);if(found.length>1)throw new BankError('동일한 문제은행 폴더가 여러 개입니다. 폴더 ID를 직접 지정해 주세요.','conflict');
  if(found.length){registry[k]={id:found[0].id,created:true};save();return found[0].id;}
  if(!entry){entry=registry[k]={id:await this.generateId(),created:false};save();}
  try{await this.request(API+'/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:entry.id,name,mimeType:FOLDER,...(parent?{parents:[parent]}:{}),appProperties:{app:APP,bankKey:k}})});}catch(e){if(e.code!=='exists')throw e;const f=await this.get(entry.id);if(f.appProperties?.bankKey!==k)throw new BankError('Drive 폴더 ID 충돌입니다.','conflict');}
  entry.created=true;save();return entry.id;
 }
 async put({file,id,name,parent,properties,session,saveSession}){
  const size=fs.statSync(file).size;if(!size)throw new BankError('빈 파일은 저장할 수 없습니다.');const bytes=fs.readFileSync(file),md5=digest(bytes,'md5');
  const known=await this.maybe(id);if(known){if(known.trashed||Number(known.size)!==size||known.md5Checksum!==md5||!known.parents?.includes(parent))throw new BankError('Drive 파일이 외부에서 변경되었습니다. 새 버전을 덮어쓰지 않았습니다.','conflict');return known;}
  let url=null,offset=0;
  if(session){try{url=this.auth.safeStorage.decryptString(Buffer.from(session,'base64'));const status=await this.request(url,{method:'PUT',headers:{'Content-Length':'0','Content-Range':`bytes */${size}`},raw:true});if(status.status!==308){const result=await status.json();if(Number(result.size)!==size||result.md5Checksum!==md5)throw new BankError('업로드 파일의 무결성 검증에 실패했습니다.','conflict');saveSession(null);return result;}offset=Number((status.headers.get('range')||'').match(/-(\d+)$/)?.[1]??-1)+1;}catch(e){if(!['not_found'].includes(e.code))throw e;url=null;}}
  if(!url){const response=await this.request(UPLOAD+'?uploadType=resumable&fields=id,size,md5Checksum,parents',{method:'POST',raw:true,headers:{'Content-Type':'application/json','X-Upload-Content-Type':mime(name),'X-Upload-Content-Length':String(size)},body:JSON.stringify({id,name,mimeType:mime(name),parents:[parent],appProperties:{app:APP,...properties}})});url=response.headers.get('location');if(!url)throw new BankError('Drive 업로드 주소가 없습니다.','network',true);saveSession(this.auth.safeStorage.encryptString(url).toString('base64'));}
  for(;offset<size;){const end=Math.min(size,offset+8*1024*1024);const response=await this.request(url,{method:'PUT',raw:true,headers:{'Content-Type':mime(name),'Content-Length':String(end-offset),'Content-Range':`bytes ${offset}-${end-1}/${size}`},body:bytes.subarray(offset,end)});if(response.status===308){const next=Number((response.headers.get('range')||'').match(/-(\d+)$/)?.[1]??-1)+1;if(next<=offset)throw new BankError('Drive 업로드 진행을 확인하지 못했습니다.','network',true);offset=next;}else{const result=await response.json();if(Number(result.size)!==size||result.md5Checksum!==md5)throw new BankError('업로드 파일의 무결성 검증에 실패했습니다.','conflict');saveSession(null);return result;}}
  const result=await this.get(id);if(Number(result.size)!==size||result.md5Checksum!==md5)throw new BankError('업로드 완료 파일을 확인할 수 없습니다.','network',true);return result;
 }
 async download(id,expected){const meta=await this.get(id);if(meta.trashed||expected&&Number(meta.size)!==expected.size)throw new BankError('Drive 파일 크기가 변경되었습니다.','conflict');if(Number(meta.size)>350*1024*1024)throw Error('지원 크기를 초과한 파일입니다.');const response=await this.request(API+`/files/${id}?alt=media`,{raw:true});const bytes=Buffer.from(await response.arrayBuffer());if(expected&&(bytes.length!==expected.size||digest(bytes)!==expected.sha256))throw new BankError('Drive 파일이 변경되었거나 다운로드가 손상되었습니다.','conflict');return bytes;}
 async commits(rootId,questionId,pageToken){return this.list(`trashed = false and appProperties has { key='app' and value='${APP}' } and appProperties has { key='role' and value='commit' } and appProperties has { key='rootId' and value='${quote(rootId)}' }${questionId?` and appProperties has { key='questionId' and value='${quote(questionId)}' }`:''}`,pageToken);}
}
function mime(name){return /\.docx$/i.test(name)?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':/\.json$/i.test(name)?'application/json':/\.pdf$/i.test(name)?'application/pdf':/\.png$/i.test(name)?'image/png':/\.jpe?g$/i.test(name)?'image/jpeg':'application/octet-stream';}
module.exports={DriveBankStorage,APP,FOLDER,digest,validId,mime};
