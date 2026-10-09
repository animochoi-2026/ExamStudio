'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const {BankError}=require('./bank-auth.cjs'),{digest,FOLDER}=require('./bank-drive.cjs');
const CHUNK=6291456;
class SharedBankStorage{
 constructor({auth,fetchImpl=fetch}){this.auth=auth;this.fetch=fetchImpl;this.kind='shared';}
 async rpc(name,body){return this.auth.request('/rest/v1/rpc/'+name,{method:'POST',body,token:await this.auth.token()});}
 async rows(table,query=''){return this.auth.request('/rest/v1/'+table+'?'+query,{token:await this.auth.token()});}
 meta(e){return{id:e.id,name:e.name,mimeType:e.kind==='folder'?FOLDER:'application/octet-stream',size:e.size,md5Checksum:e.md5,sha256:e.sha256,parents:e.parent_id?[e.parent_id]:[],appProperties:e.props,verified:e.verified,ownerId:e.owner_id,author:e.author,raw:e};}
 async generateId(){return crypto.randomUUID();}
 async maybe(id){if(!/^[a-f0-9-]{36}$/.test(id))return null;const rows=await this.rows('bank_entries','id=eq.'+id);return rows[0]?this.meta(rows[0]):null;}
 async get(id){const m=await this.maybe(id);if(!m)throw new BankError('문항 파일이 없거나 공동 문제은행 접근 권한이 없습니다.','auth');return m;}
 async checkRoot(id){await this.auth.membership();if(id!==this.auth.config().spaceId)throw new BankError('연결 설정과 다른 공동 문제은행입니다.','conflict');return this.get(id);}
 async getRoot(){return this.checkRoot(this.auth.config().spaceId);}
 async find(key,parent){return(await this.rows('bank_entries','space_id=eq.'+this.auth.config().spaceId+'&bank_key=eq.'+encodeURIComponent(key)+(parent?'&parent_id=eq.'+parent:''))).map(e=>this.meta(e));}
 async folder({key,name,parent,registry,save}){const e=await this.rpc('bank_folder',{s:this.auth.config().spaceId,k:key,n:name,p:parent});registry[key]={id:e.id};save();return e.id;}
 async list(query){const key=/key='sourceKey' and value='([a-f0-9]{64})'/.exec(query)?.[1];if(!key)throw Error('지원하지 않는 공동 저장소 조회입니다.');
  // bank_source_identity is partial on role=source. Include its predicate so
  // PostgREST can use the existing index instead of scanning every entry
  // through the membership RLS policy for each queued question.
  const rows=await this.rows('bank_entries','space_id=eq.'+this.auth.config().spaceId+'&verified=eq.true&props->>role=eq.source&props->>sourceKey=eq.'+key);return{files:rows.map(e=>this.meta(e))};}
 async beginRevision(job){const member=await this.auth.membership();if(job.actorId!==member.userId)throw new BankError('이 업로드를 등록한 계정으로 다시 로그인하세요.','auth');await this.rpc('bank_begin_revision',{s:this.auth.config().spaceId,q:job.questionId,r:job.revisionId,p:job.parentRevisionId||null});}
 async sourceCandidates(source){return this.rpc('bank_source_candidates',{s:this.auth.config().spaceId,source});}
 async prepareItem(item){
  try{const member=await this.auth.membership(),rows=await this.rows('bank_questions','id=eq.'+item.id);return{actorId:member.userId,foreign:!!(rows[0]?.owner_id||item.ownerId)&&(rows[0]?.owner_id||item.ownerId)!==member.userId,owner:rows[0]||null};}
  catch(e){const actor=this.auth.status().account?.id;if(e.code!=='network'||!actor)throw e;return{actorId:actor,foreign:!!item.ownerId&&item.ownerId!==actor,offline:true};}
 }
 async object(e,index,bytes){const c=this.auth.config(),route=`/storage/v1/object/${bytes?'':'authenticated/'}question-bank/${e.space_id}/${e.id}/${String(index).padStart(3,'0')}`;let r;try{r=await this.fetch(c.url+route,{method:bytes?'POST':'GET',headers:{apikey:c.publishableKey,Authorization:'Bearer '+await this.auth.token(),...(bytes?{'Content-Type':'application/octet-stream','x-upsert':'false'}:{})},body:bytes,signal:AbortSignal.timeout(120000)});}catch{throw new BankError('파일 전송 중 연결이 끊겼습니다. 대기열에서 재시도할 수 있습니다.','network',true);}return r;}
 async put({file,id,name,parent,properties,losslessVerification}){
  const bytes=fs.readFileSync(file),sha=digest(bytes),md=digest(bytes,'md5');
  const e=await this.rpc('bank_reserve',{s:this.auth.config().spaceId,f:id,p:parent,n:name,properties,bytes:bytes.length,sha,md,chunk_count:Math.ceil(bytes.length/CHUNK)});
  if(e.verified){if(losslessVerification){const {validateStoredProof}=await import('./lossless-runtime/lossless-upload-contract.mjs');await validateStoredProof({entry:e,descriptor:losslessVerification.descriptor,native:losslessVerification.native,files:losslessVerification.files,spaceId:this.auth.config().spaceId,questionId:properties.questionId});}return this.meta(e);}
  for(let i=0;i<e.chunks;i++){const part=bytes.subarray(i*CHUNK,(i+1)*CHUNK),r=await this.object(e,i,part);if(!r.ok){
   const detail=await r.json().catch(()=>({}));if(r.status===409||String(detail.statusCode)==='409'||detail.error==='Duplicate'){const existing=await this.object(e,i);if(!existing.ok||digest(Buffer.from(await existing.arrayBuffer()))!==digest(part))throw new BankError('기존 업로드 조각이 다릅니다. 덮어쓰지 않았습니다.','conflict');}
   else throw new BankError('공동 파일 업로드 실패: '+(detail.message||r.status),r.status===401||r.status===403?'auth':'failed',r.status===429||r.status>=500);
  }}
  await this.auth.request('/functions/v1/bank-verify',{method:'POST',body:losslessVerification||{id:e.id},token:await this.auth.token()});const result=await this.get(e.id);if(!result.verified)throw Error('서버 파일 검증이 끝나지 않았습니다.');return result;
 }
 async download(id,expected){const m=await this.get(id),e=m.raw;if(!e.verified)throw Error('업로드 완료되지 않은 파일입니다.');if(expected&&(expected.size!==e.size||expected.sha256!==e.sha256))throw new BankError('파일 목록이 서버와 다릅니다.','conflict');const parts=[];for(let i=0;i<e.chunks;i++){const r=await this.object(e,i);if(!r.ok)throw new BankError('파일 다운로드 권한 또는 연결을 확인하세요.',r.status===401||r.status===403?'auth':'network',r.status>=500);const part=Buffer.from(await r.arrayBuffer());if(part.length!==Math.min(CHUNK,e.size-i*CHUNK))throw Error('파일 조각 크기가 다릅니다.');parts.push(part);}const b=Buffer.concat(parts);if(b.length!==e.size||digest(b)!==e.sha256)throw new BankError('다운로드한 파일의 무결성 검증 실패','conflict');return b;}
 async commits(rootId,questionId,pageToken){await this.checkRoot(rootId);const offset=Number(pageToken||0);if(!Number.isSafeInteger(offset)||offset<0)throw Error('목록 페이지 오류');const rows=await this.rpc('bank_commits',{s:rootId,q:questionId||null,start_at:offset}),files=rows.map(e=>this.meta(e));return{files,nextPageToken:rows.length===100?String(offset+100):null};}
 async members(){return this.rows('bank_members','space_id=eq.'+this.auth.config().spaceId+'&order=email');}
 async invite(email,enabled=true){await this.rpc('bank_invite',{s:this.auth.config().spaceId,email_address:email,enabled_value:enabled});return this.members();}
 async search(filters={},start=0){return this.rpc('bank_search',{s:this.auth.config().spaceId,filters,start_at:start});}
 async review({revisionId,patch,reason,expected,approve=true,proposal=null}){return this.rpc('bank_review',{r:revisionId,p:patch,reason_text:reason,expected,approve,proposal});}
 async propose({revisionId,patch,reason,expected}){return this.rpc('bank_propose',{r:revisionId,p:patch,reason_text:reason,expected});}
 async role(email,role){return this.rpc('bank_set_role',{s:this.auth.config().spaceId,email_address:email,new_role:role});}
 async usage(){return this.rpc('bank_usage',{s:this.auth.config().spaceId});}
 async archive(questionId,archived,reason){return this.rpc('bank_archive',{q:questionId,archived_value:archived,reason_text:reason});}
 async visibility(revisionId,visibility,reason){return this.rpc('bank_set_visibility',{r:revisionId,v:visibility,reason});}
 async personal(questionId,note,favorite){return this.rpc('bank_personal_save',{q:questionId,n:note,f:favorite});}
 async reindex(){const member=await this.auth.membership();let start=null,count=0;do{const page=await this.commits(this.auth.config().spaceId,null,start);for(const f of page.files){if(f.ownerId!==member.userId)continue;const existing=await this.rows('bank_catalog','revision_id=eq.'+f.appProperties.revisionId);if(existing.length)continue;await this.auth.request('/functions/v1/bank-verify',{method:'POST',body:{id:f.id},token:await this.auth.token()});count++;}start=page.nextPageToken;}while(start);return{count};}
}
module.exports={SharedBankStorage,CHUNK};
