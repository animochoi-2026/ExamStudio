import {fileStore} from '../_shared/file-store-runtime.mjs';
const store=fileStore(fetch,key=>Deno.env.get(key));
import {createHash} from 'node:crypto';
import {verifyTransition} from './transition-verify.mjs';
import {same} from './lossless-core.mjs';
import {createWasmCodec,WASM_SHA256} from './lossless-wasm-codec.mjs';
const origin=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const codec=createWasmCodec(async()=>{
 // Identical pinned bytes to the deployed upload verifier; hash checked by loader.
 const r=await fetch('https://cdn.jsdelivr.net/npm/@imagemagick/magick-wasm@0.0.44/dist/x86/magick.wasm',{redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('CODEC_DOWNLOAD_FAILED');return new Uint8Array(await r.arrayBuffer());
});
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
Deno.serve(async(req:Request)=>{try{
 if(req.method!=='POST')return Response.json({error:'POST_REQUIRED'},{status:405});
 const authorization=req.headers.get('authorization')||'',headers={apikey:anon,authorization};
 const u=await fetch(origin+'/auth/v1/user',{headers});if(!u.ok)return Response.json({error:'SIGN_IN_REQUIRED'},{status:401});const user=await u.json();if(!user.id||!user.email_confirmed_at)return Response.json({error:'CONFIRMED_ACCOUNT_REQUIRED'},{status:403});
 if(Number(req.headers.get('content-length')||0)>4*1024*1024)throw Error('REQUEST_LIMIT');
 const reader=req.body?.getReader();if(!reader)throw Error('BODY_REQUIRED');const chunks:Uint8Array[]=[];let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4*1024*1024){await reader.cancel();throw Error('REQUEST_LIMIT');}chunks.push(value);}const body=new Uint8Array(size);let pos=0;for(const x of chunks){body.set(x,pos);pos+=x.length;}const request=JSON.parse(new TextDecoder().decode(body));
 const rows=async(table:string,query:string,privileged=false)=>{const r=await fetch(origin+'/rest/v1/'+table+'?'+query,{headers:privileged?{apikey:service,authorization:'Bearer '+service}:headers});if(!r.ok)throw Error('ROW_READ_FAILED');return r.json();};
 const rpc=async(name:string,args:unknown,success:unknown)=>{const r=await fetch(origin+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:service,authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify(args)});const value=await r.json().catch(()=>({}));if(!r.ok)return Response.json({error:'TRANSACTION_REJECTED',code:value.code||null,reason:typeof value.message==='string'&&/^[A-Za-z ]{1,100}$/.test(value.message)?value.message:null},{status:value.code==='PT409'?409:r.status});return Response.json(success);};
 let resuming=false;
 if(request.operation==='resume'){
  if(!UUID.test(request.id))throw Error('INVALID_ID');const [receipt]=await rows('bank_image_transitions','id=eq.'+request.id+'&actor_id=eq.'+user.id,true);if(!receipt)return Response.json({error:'RECEIPT_REQUIRED'},{status:404});
  const [owned]=await rows('bank_questions','id=eq.'+receipt.question_id);if(!owned||owned.owner_id!==user.id)return Response.json({error:'OWNER_REQUIRED'},{status:403});
  request.operation='finalize';request.plan=receipt.request.plan;request.commitId=receipt.new_catalog.commit_id;resuming=!!receipt.rolled_back_at;
 }
 if(request.operation==='status'||request.operation==='rollback'){
  if(!UUID.test(request.id))throw Error('INVALID_ID');const [receipt]=await rows('bank_image_transitions','id=eq.'+request.id+'&actor_id=eq.'+user.id,true);
  if(!receipt)return Response.json({found:false});
  const [q]=await rows('bank_questions','id=eq.'+receipt.question_id);if(!q||q.owner_id!==user.id)return Response.json({error:'OWNER_REQUIRED'},{status:403});
  if(request.operation==='rollback')return await rpc('bank_finish',{f:receipt.new_catalog.commit_id,actor:user.id,record:{operation:'existing-image-rollback-v1',migrationId:request.id}},{rolledBack:true,previousRevisionId:receipt.base_revision_id});
  return Response.json({found:true,committed:!receipt.rolled_back_at,rolledBack:!!receipt.rolled_back_at,revisionId:receipt.target_revision_id});
 }
 if(request.operation!=='finalize')throw Error('INVALID_OPERATION');
 const p=request.plan;if(!p||![p.id,p.questionId,p.spaceId,p.baseRevisionId,p.targetRevisionId,request.commitId].every(x=>typeof x==='string'&&UUID.test(x))||p.ownerId!==user.id)throw Error('INVALID_PLAN');
 const entryCache=new Map(),entry=async(id:string)=>{if(!UUID.test(id))throw Error('INVALID_FILE_ID');if(!entryCache.has(id)){const a=await rows('bank_entries','id=eq.'+id);if(a.length!==1)throw Error('ENTRY_MISSING');entryCache.set(id,a[0]);}return entryCache.get(id);};
 const raw=async(e:any)=>{if(e.kind!=='file'||e.size>20*1024*1024)throw Error('FILE_LIMIT');const parts=[];let size=0;for(let i=0;i<e.chunks;i++){const r=await store.read(`${e.space_id}/${e.id}/${String(i).padStart(3,'0')}`,authorization);if(!r.ok)throw Error('OBJECT_READ_FAILED');const b=new Uint8Array(await r.arrayBuffer());if(b.length!==Math.min(6291456,e.size-i*6291456))throw Error('CHUNK_MISMATCH');parts.push(b);size+=b.length;}const bytes=new Uint8Array(size);let at=0;for(const b of parts){bytes.set(b,at);at+=b.length;}if(size!==e.size||createHash('sha256').update(bytes).digest('hex')!==e.sha256||createHash('md5').update(bytes).digest('hex')!==e.md5)throw Error('OBJECT_HASH_MISMATCH');return bytes;};
 const json=async(e:any)=>JSON.parse(new TextDecoder().decode(await raw(e)));
 const [q]=await rows('bank_questions','id=eq.'+p.questionId);if(!q||q.owner_id!==user.id||q.space_id!==p.spaceId)return Response.json({error:'OWNER_REQUIRED'},{status:403});
 const ce=await entry(request.commitId),commit=await json(ce);
 if(ce.owner_id!==user.id||ce.props.role!=='commit'||ce.props.revisionId!==p.targetRevisionId)throw Error('COMMIT_ENTRY_SCOPE');
 const [receipt]=await rows('bank_image_transitions','id=eq.'+p.id+'&actor_id=eq.'+user.id,true);
 if(receipt&&!resuming){if(receipt.rolled_back_at||receipt.target_revision_id!==p.targetRevisionId||receipt.new_catalog.commit_id!==ce.id||!same(receipt.request.plan,p))throw Error('MIGRATION_REPLAY_CHANGED');return Response.json({committed:true,reused:true,revisionId:p.targetRevisionId});}
 const [base]=await rows('bank_revisions','id=eq.'+p.baseRevisionId),[cat]=await rows('bank_catalog','revision_id=eq.'+p.baseRevisionId);
 if(!same(q,p.before.question)||!same(base,p.before.revision)||!same(cat,p.before.catalog))return Response.json({error:'BASELINE_CHANGED'},{status:409});
 const oldCommit=await json(await entry(cat.commit_id));if(!same(oldCommit,p.before.commit))throw Error('OLD_COMMIT_CHANGED');
 const oldData=cat.files.find((f:any)=>f.role==='data'),newData=commit.files.find((f:any)=>f.role==='data');if(!oldData||!newData)throw Error('NATIVE_MISSING');
 const oldBundle=await json(await entry(oldData.id)),bundle=await json(await entry(newData.id));
 const verified=await verifyTransition({plan:p,commit,oldBundle,bundle,entry,raw,codec});
 if(resuming)return await rpc('bank_finish',{f:ce.id,actor:user.id,record:{operation:'existing-image-resume-v1',migrationId:p.id}},{committed:true,reused:true,revisionId:p.targetRevisionId});
 const record={...commit,content:verified.content,commitId:ce.id};
 return await rpc('bank_finish',{f:ce.id,actor:user.id,record:{operation:'existing-image-finalize-v1',plan:p,commit:record,changes:verified.changes,proofs:verified.proofs}},{committed:true,reused:false,revisionId:p.targetRevisionId});
}catch(e){return Response.json({error:/^[A-Z_]{3,80}$/.test(e.message)?e.message:'MIGRATION_VERIFICATION_FAILED'},{status:e.status||400});}});
