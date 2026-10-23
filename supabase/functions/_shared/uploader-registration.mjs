import {createHash} from 'node:crypto';
import {fileStore} from './file-store-runtime.mjs';
import receipt from './uploader-assessment.mjs';

// An attestation does not finish an upload. The original verifier and SQL
// membership/revision/file guards remain authoritative after this returns.
export function uploaderRegistration(env,fetchImpl=fetch,verify=receipt.verify){
 const store=fileStore(fetchImpl,env),url=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY');
 return async ({entry,user,authorization})=>{
  if(entry.verified)return;
  const headers={apikey:anon,authorization};
  async function read(e,limit){
   if(e.kind!=='file'||!Number.isSafeInteger(e.size)||e.size<1||e.size>limit||e.chunks!==Math.ceil(e.size/6291456))throw Error('uploader_metadata_size');
   const chunks=[],sha=createHash('sha256'),md=createHash('md5');let size=0;
   for(let i=0;i<e.chunks;i++){
    const r=await store.read(`${e.space_id}/${e.id}/${String(i).padStart(3,'0')}`,authorization);
    if(!r.ok)throw Error('uploader_file_access');const reader=r.body.getReader(),expected=Math.min(6291456,e.size-i*6291456);let chunkSize=0;
    for(;;){const {done,value}=await reader.read();if(done)break;chunkSize+=value.length;size+=value.length;if(chunkSize>expected){await reader.cancel();throw Error('uploader_file_size');}sha.update(value);md.update(value);chunks.push(value);}
    if(chunkSize!==expected)throw Error('uploader_file_size');
   }
   if(size!==e.size||sha.digest('hex')!==e.sha256||md.digest('hex')!==e.md5)throw Error('uploader_file_integrity');
   return JSON.parse(await new Blob(chunks).text());
  }
  const commit=await read(entry,5*1024*1024);
  if(commit.metadata?.difficulty?.v123Active?.evaluation_protocol!=='uploader-assessment-v1')return;
  if(commit.app!=='examstudio-bank-v1'||commit.schemaVersion!==1||commit.parentRevisionId||commit.rootId!==entry.space_id||commit.questionId!==entry.props.questionId||commit.revisionId!==entry.props.revisionId||!Array.isArray(commit.files)||commit.files.length>1000)throw Error('uploader_commit_identity');
  const nativeFiles=commit.files.filter(f=>f.role==='data');if(nativeFiles.length!==1||!/^[a-f0-9-]{36}$/.test(nativeFiles[0].id))throw Error('uploader_native_descriptor');
  const descriptor=nativeFiles[0],r=await fetchImpl(url+'/rest/v1/bank_entries?id=eq.'+descriptor.id,{headers,signal:AbortSignal.timeout(15000)});
  const rows=r.ok?await r.json():[],part=rows.length===1?rows[0]:null;
  if(!part?.verified||part.owner_id!==user.id||part.space_id!==entry.space_id||part.props?.questionId!==commit.questionId||part.props?.revisionId!==commit.revisionId||part.props?.role!=='data'||part.size!==descriptor.size||part.sha256!==descriptor.sha256)throw Error('uploader_native_access');
  const data=await read(part,20*1024*1024);
  if(data.schemaVersion!==1||data.native?.format!=='examstudio-project-v1'||JSON.stringify(data.files)!==JSON.stringify(commit.files.filter(f=>f.role!=='data')))throw Error('uploader_native_mismatch');
  const problem=data.native.project?.problems?.find(p=>p.original?.id===data.native.targetQuestionId),q=problem?.original;if(!q)throw Error('uploader_original_missing');
  commit.content={body:q.body,choices:q.choices||[],answer:q.answer||null,solution:q.solution||null};
  const verified=verify(data,commit),service=env('SUPABASE_SERVICE_ROLE_KEY');
  const accepted=await fetchImpl(url+'/rest/v1/rpc/bank_uploader_receipt',{method:'POST',headers:{apikey:service,authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({r:commit.revisionId,actor:user.id,s:entry.space_id,q:commit.questionId,c:commit.content,m:commit.metadata,f:commit.files,manifest:verified.manifest,evaluation_key:verified.evaluationKey}),signal:AbortSignal.timeout(15000)});
  if(!accepted.ok)throw Error('uploader_receipt_rejected');
 };
}
