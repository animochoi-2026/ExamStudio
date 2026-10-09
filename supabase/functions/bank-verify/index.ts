// Secrets are Supabase-managed environment variables, never desktop configuration.
import { createHash } from 'node:crypto';
import {verifyUploadRequest,readBoundedRequest} from '../_shared/lossless-upload-server.mjs';
import {validateStoredProof} from '../_shared/lossless-upload-contract.mjs';
import {codec} from '../_shared/lossless-edge-codec.mjs';
import {UPLOAD_ENABLED} from '../_shared/lossless-upload-config.mjs';
const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const reply=(status:number,value:unknown)=>Response.json(value,{status});
Deno.serve(async(req:Request)=>{
 try{
  if(req.method!=='POST')return reply(405,{error:'POST required'});
  const authorization=req.headers.get('authorization')||'';
  const userResponse=await fetch(url+'/auth/v1/user',{headers:{apikey:anon,authorization}});
  if(!userResponse.ok)return reply(401,{error:'Sign in again'});
  const user=await userResponse.json();if(!user.id||!user.email_confirmed_at)return reply(403,{error:'Verified account required'});
  const request=await readBoundedRequest(req);
  if(['lossless-upload-v1','lossless-rebind-v1'].includes(request.operation))return await verifyUploadRequest({request,user,url,anon,service,authorization,fetch,codec,enabled:UPLOAD_ENABLED});
  const {id}=request;if(typeof id!=='string'||!(/^[a-f0-9-]{36}$/).test(id))return reply(400,{error:'Invalid file ID'});
  const headers={apikey:anon,authorization};
  async function entry(fileId:string){const r=await fetch(url+'/rest/v1/bank_entries?id=eq.'+encodeURIComponent(fileId),{headers});if(!r.ok)throw Error('File access denied');const a=await r.json();if(a.length!==1)throw Error('File access denied');return a[0];}
  async function fetchRows(table:string,query:string){const r=await fetch(url+'/rest/v1/'+table+'?'+query,{headers});if(!r.ok)throw Error('Reference access denied');return r.json();}
  const rowsForLinks=(revisionId:string)=>fetchRows('bank_revision_files','revision_id=eq.'+revisionId);
  const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  const same=(a:any,b:any)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  async function read(e:any,collect=false){
   const sha=createHash('sha256'),md=createHash('md5'),parts:Uint8Array[]=[];let size=0;
   if(collect&&e.size>20*1024*1024)throw Error('Metadata too large');
   for(let i=0;i<e.chunks;i++){
    const r=await fetch(`${url}/storage/v1/object/authenticated/question-bank/${e.space_id}/${e.id}/${String(i).padStart(3,'0')}`,{headers});
    if(!r.ok)throw Error('Incomplete upload');const bytes=new Uint8Array(await r.arrayBuffer());
    if(bytes.length!==Math.min(6291456,e.size-i*6291456))throw Error('Chunk size mismatch');
    sha.update(bytes);md.update(bytes);size+=bytes.length;if(collect)parts.push(bytes);
   }
   if(size!==e.size||sha.digest('hex')!==e.sha256||md.digest('hex')!==e.md5)throw Error('File integrity mismatch');
   if(collect){const all=new Uint8Array(size);let offset=0;for(const p of parts){all.set(p,offset);offset+=p.length;}return JSON.parse(new TextDecoder().decode(all));}
  }
  const e=await entry(id);if(e.owner_id!==user.id)return reply(403,{error:'Only the uploader may complete an upload'});
  if(e.kind!=='file')throw Error('Not a file');
  if(e.props.losslessUpload||e.lossless_proof)throw Error('LOSSLESS_PROOF_REQUEST_REQUIRED');
  const commit=await read(e,e.props.role==='commit');
  if(commit){
   if(e.size>5*1024*1024||commit.app!=='examstudio-bank-v1'||commit.schemaVersion!==1||commit.rootId!==e.space_id||commit.questionId!==e.props.questionId||commit.revisionId!==e.props.revisionId||!Array.isArray(commit.files)||commit.files.length>1000)throw Error('Invalid completion record');
   if(new Set(commit.files.map((f:any)=>f.key)).size!==commit.files.length||new Set(commit.files.map((f:any)=>f.id)).size!==commit.files.length)throw Error('Duplicate descriptors');
   const revisions=await fetch(url+'/rest/v1/bank_revisions?id=eq.'+commit.revisionId,{headers});const rows=await revisions.json();
   if(!revisions.ok||rows.length!==1||rows[0].parent_id!==(commit.parentRevisionId||null)||rows[0].actor_id!==user.id)throw Error('Revision mismatch');
   let data:any;let docx=false;const reused:any[]=[];const losslessParts:any[]=[];
   for(const f of commit.files){
    if(!/^[a-f0-9-]{36}$/.test(f.id)||!['docx','data','preview','source','asset','attachment'].includes(f.role))throw Error('Invalid descriptor');
    const part=await entry(f.id);
    if(f.encoding||part.lossless_proof||part.props.losslessUpload)losslessParts.push({entry:part,descriptor:f});
    if(!part.verified||part.space_id!==e.space_id||part.size!==f.size||part.sha256!==f.sha256||part.props.role!==f.role)throw Error('Required file not verified');
    if(f.role!=='source'){
     if(part.props.questionId!==commit.questionId||part.owner_id!==user.id)throw Error('Foreign revision file');
     if(part.props.revisionId!==commit.revisionId){
      if(commit.immutableReferencePolicy!=='difficulty-only-v1'||!['docx','preview','asset','attachment'].includes(f.role))throw Error('Foreign revision file');
      reused.push(f);
     }
    }
    if(f.role==='docx')docx=true;if(f.role==='data'){if(data)throw Error('Multiple native files');data=await read(part,true);}
   }
   if(!docx||!data||data.schemaVersion!==1||data.questionId!==commit.questionId||data.revisionId!==commit.revisionId||data.native?.format!=='examstudio-project-v1'||!data.native.project||JSON.stringify(data.files)!==JSON.stringify(commit.files.filter((f:any)=>f.role!=='data')))throw Error('Native data mismatch');
   const problem=data.native.project.problems?.find((p:any)=>[p.original,...(p.variants||[])].some((q:any)=>q?.id===data.native.targetQuestionId));
   const target=problem&&[problem.original,...(problem.variants||[])].find((q:any)=>q?.id===data.native.targetQuestionId);if(!target)throw Error('Native question missing');
   commit.content={body:target.body,choices:target.choices||[],answer:target.answer||null,solution:target.solution||null};
   for(const pair of losslessParts)await validateStoredProof({...pair,native:data.native,files:data.files,spaceId:e.space_id,questionId:commit.questionId});
   if(reused.length||commit.immutableReferencePolicy){
    if(commit.immutableReferencePolicy!=='difficulty-only-v1')throw Error('Unknown reference policy');
    const revision=rows[0];
    // Completed records remain replayable even if their old parent payload is
    // later pruned. Their own immutable commit and persisted links are proof.
    if(revision.committed){
     if(!e.verified)throw Error('Unverified completed reference');
     const links=await rowsForLinks(commit.revisionId);
     if(!links.some((x:any)=>x.file_id===id)||reused.some(f=>!links.some((x:any)=>x.file_id===f.id)))throw Error('Completed reference link missing');
    }else{
     const parentId=commit.parentRevisionId;if(typeof parentId!=='string'||!/^[a-f0-9-]{36}$/.test(parentId))throw Error('Reference parent missing');
     const [parent]=await fetchRows('bank_catalog','revision_id=eq.'+parentId),[parentRevision]=await fetchRows('bank_revisions','id=eq.'+parentId),[question]=await fetchRows('bank_questions','id=eq.'+commit.questionId);
     if(!parent||parent.space_id!==e.space_id||parent.question_id!==commit.questionId||!parentRevision?.committed||parentRevision.question_id!==commit.questionId||question?.owner_id!==user.id||question?.space_id!==e.space_id)throw Error('Foreign reference parent');
     if(!Number.isInteger(commit.baseReviewVersion))throw Error('Invalid reference review version');
     if(parentRevision.review_version!==commit.baseReviewVersion)return reply(409,{code:'PT409',error:'Reference review changed'});
     const teacher=(c:any)=>[c.confirmed?.difficulty,c.confirmed?.difficultyBand,c.metadata?.difficulty?.userScore,c.metadata?.difficulty?.teacherBand].some(x=>x!==undefined&&x!==null&&x!=='');
     if(teacher(parent)||teacher({metadata:commit.metadata}))throw Error('Teacher difficulty is protected');
     const links=await rowsForLinks(parentId),immutable=(files:any[])=>files.filter((f:any)=>!['data','commit'].includes(f.role));
     const parentCommitEntry=await entry(parent.commit_id);
     if(!parentCommitEntry.verified||parentCommitEntry.space_id!==e.space_id||parentCommitEntry.props.role!=='commit'||parentCommitEntry.props.questionId!==commit.questionId||parentCommitEntry.props.revisionId!==parentId||!links.some((x:any)=>x.file_id===parent.commit_id))throw Error('Parent commit not verified');
     const parentCommit:any=await read(parentCommitEntry,true);
     if(parentCommit.questionId!==commit.questionId||parentCommit.revisionId!==parentId||parentCommit.rootId!==e.space_id||!same(parentCommit.files,parent.files)||parentCommit.sourceId!==commit.sourceId||parentCommit.folderId!==commit.folderId)throw Error('Parent commit descriptor or source mismatch');
     if(!same(immutable(commit.files),immutable(parent.files)))throw Error('Immutable descriptors changed');
     if(reused.some(f=>!links.some((x:any)=>x.file_id===f.id)||!parent.files.some((x:any)=>same(x,f))))throw Error('Reference link or descriptor mismatch');
     const oldDataFile=parent.files.find((f:any)=>f.role==='data');if(!oldDataFile)throw Error('Parent native missing');
     const oldEntry=await entry(oldDataFile.id);
     if(!oldEntry.verified||oldEntry.space_id!==e.space_id||oldEntry.props.role!=='data'||oldEntry.props.questionId!==commit.questionId||oldEntry.size!==oldDataFile.size||oldEntry.sha256!==oldDataFile.sha256)throw Error('Parent native not verified');
     const oldData:any=await read(oldEntry,true);
     if(oldData.questionId!==commit.questionId||oldData.revisionId!==parentId||!same(oldData.metadata,parent.metadata)||!same(data.metadata,commit.metadata))throw Error('Reference metadata mismatch');
     const withoutDifficulty=(m:any)=>{const copy={...m};delete copy.difficulty;return copy;};
     const unchangedBundle=(b:any)=>{const copy={...b};for(const key of ['revisionId','parentRevisionId','modifiedAt','appVersion','metadata','native','files'])delete copy[key];return copy;};
     if(!same(unchangedBundle(oldData),unchangedBundle(data)))throw Error('Native source envelope changed');
     if(!same(withoutDifficulty(parent.metadata),withoutDifficulty(commit.metadata))||!same(parent.metadata?.difficulty?.scope,commit.metadata?.difficulty?.scope))throw Error('Non-difficulty metadata changed');
     const mathNative=(native:any)=>{const copy=JSON.parse(JSON.stringify(native));const p=copy.project?.problems?.find((p:any)=>[p.original,...(p.variants||[])].some((q:any)=>q?.id===copy.targetQuestionId));const q=p&&[p.original,...(p.variants||[])].find((q:any)=>q?.id===copy.targetQuestionId);if(!q)throw Error('Reference native target missing');delete q.assessment;if(p.recognition){delete p.recognition.assessment;delete p.recognition.assessmentOrigin;}return copy;};
     if(!same(mathNative(oldData.native),mathNative(data.native)))throw Error('Native content changed');
    }
   }
  }
  // bank_finish rechecks current membership, closing the revocation race.
  const r=await fetch(url+'/rest/v1/rpc/bank_finish',{method:'POST',headers:{apikey:service,authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({f:id,actor:user.id,record:commit||null})});
  if(!r.ok){
   const failure=await r.json().catch(()=>({}));const message=String(failure.message||'');
   if(r.status===409||failure.code==='PT409')return reply(409,{code:'PT409',error:message||'수정 충돌: 최신 문항을 다시 확인하세요.'});
   if(r.status===401||r.status===403)return reply(r.status,{code:failure.code,error:'현재 계정의 저장 권한을 다시 확인하세요.'});
   return reply(r.status>=500?503:400,{code:failure.code,error:/업데이트 필요|수정 충돌|검수값이 수정/.test(message)?message:'저장 검증에 실패했습니다. 기존 로컬 문항은 보존됩니다.'});
  }return reply(200,{verified:true});
 }catch(e){return reply((e as any).status||400,{error:e instanceof Error?e.message:'Verification failed'});}
});
