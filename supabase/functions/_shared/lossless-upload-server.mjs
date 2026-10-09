import {Buffer} from 'node:buffer';
import {sha,hash,same,pngSafe,hold} from './lossless-core.mjs';
import {proofDigests} from './lossless-proof-digests.mjs';
import {POLICY,BINDING,checkDescriptor,nativeBinding,validateStoredProof} from './lossless-upload-contract.mjs';
export async function readBoundedRequest(req){
 const limit=12*1024*1024,declared=Number(req.headers.get('content-length')||0);
 if(declared>limit)hold('LOSSLESS_REQUEST_LIMIT',413);
 const reader=req.body?.getReader();if(!reader)hold('Invalid request',400);
 const chunks=[];let size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();hold('LOSSLESS_REQUEST_LIMIT',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let at=0;for(const b of chunks){bytes.set(b,at);at+=b.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export async function makeUploadProof({entry,descriptor,native,files,original,stored,codec}){
 if(!codec?.supported)hold('LOSSLESS_CODEC_UNSUPPORTED',501);
 checkDescriptor(descriptor);
 if(original.length>6291456||stored.length>6291456||stored.length>=original.length||!pngSafe(original))hold('LOSSLESS_INPUT_UNSUPPORTED',422);
 if(!same({id:entry.id,name:entry.name,size:entry.size,sha256:entry.sha256},{id:descriptor.id,name:descriptor.name,size:descriptor.size,sha256:descriptor.sha256})||stored.length!==entry.size||await sha(stored)!==entry.sha256)hold('LOSSLESS_BYTE_MISMATCH');
 const binding=await nativeBinding(native,descriptor,files),a=await codec.decode(original),b=await codec.decode(stored);
 if(a.format!=='png'||b.format!=='webp'||a.width!==b.width||a.height!==b.height||a.rgba.length!==b.rgba.length||!a.rgba.every((x,i)=>x===b.rgba[i]))hold('LOSSLESS_PIXEL_MISMATCH');
 const originalSha256=await sha(original);
 if(files.some(f=>f.role==='source'&&f.sha256===originalSha256))hold('LOSSLESS_SOURCE_ALIAS');
 return {policy:POLICY,bindingPolicy:BINDING,fileId:entry.id,spaceId:entry.space_id,questionId:entry.props.questionId,ownerId:entry.owner_id,originRevisionId:entry.props.revisionId,descriptor,nativeSha256:await hash(native),nativeBindingSha256:binding,originalSha256,originalSize:original.length,originalName:descriptor.encoding.originalName,...proofDigests(original,b),width:b.width,height:b.height,codec:codec.id,pngContract:'rgba8-stored-deflate-v1',color:'srgb',orientation:'unchanged'};
}
export async function verifyUploadRequest({request,user,url,anon,service,authorization,fetch,codec,enabled}){
 if(!enabled)hold('LOSSLESS_DISABLED',501);
 const headers={apikey:anon,authorization},rows=async(t,q)=>{const r=await fetch(url+'/rest/v1/'+t+'?'+q,{headers});if(!r.ok)hold('LOSSLESS_READ_DENIED',403);return r.json();};
 const one=async(t,id)=>{if(!/^[a-f0-9-]{36}$/.test(id))hold('LOSSLESS_BAD_ID');const a=await rows(t,'id=eq.'+id);if(a.length!==1)hold('LOSSLESS_READ_DENIED',403);return a[0];};
 const e=await one('bank_entries',request.id);
 if(e.owner_id!==user.id||e.kind!=='file'||e.props.role!=='asset'||e.props.losslessUpload!==POLICY)hold('LOSSLESS_OWNER_DENIED',403);
 const revision=await one('bank_revisions',e.props.revisionId),question=await one('bank_questions',e.props.questionId);
 if(revision.actor_id!==user.id||revision.question_id!==question.id||question.owner_id!==user.id||question.space_id!==e.space_id)hold('LOSSLESS_REVISION_DENIED',403);
 if(!request.native||JSON.stringify(request.native).length>1048576||!Array.isArray(request.files)||request.files.length>1000)hold('LOSSLESS_NATIVE_LIMIT',422);
 if(e.verified){const proof=await validateStoredProof({entry:e,descriptor:request.descriptor,native:request.native,files:request.files,spaceId:e.space_id,questionId:question.id});return Response.json({verified:true,proof});}
 if(revision.committed)hold('LOSSLESS_REVISION_COMMITTED');
 const raw=async x=>{if(x.size>6291456||x.chunks!==1)hold('LOSSLESS_INPUT_UNSUPPORTED',422);const r=await fetch(`${url}/storage/v1/object/authenticated/question-bank/${x.space_id}/${x.id}/000`,{headers});if(!r.ok)hold('LOSSLESS_OBJECT_DENIED',403);const b=new Uint8Array(await r.arrayBuffer());if(b.length!==x.size||await sha(b)!==x.sha256)hold('LOSSLESS_BYTE_MISMATCH');return b;};
 const stored=await raw(e);let proof;
 if(request.operation==='lossless-rebind-v1'){
  const prior=await one('bank_entries',request.sourceFileId);
  if(prior.owner_id!==user.id||prior.space_id!==e.space_id||prior.props.questionId!==e.props.questionId||!prior.lossless_proof||prior.sha256!==e.sha256||prior.size!==e.size)hold('LOSSLESS_REBIND_DENIED',403);
  const old=prior.lossless_proof;
  // Full bytes are the same, and the authenticated immutable provenance was
  // produced by full RGBA verification. Rebinding never accepts caller proof.
  checkDescriptor(request.descriptor);
  if(!prior.verified||old.policy!==POLICY||old.fileId!==prior.id||old.ownerId!==user.id||old.spaceId!==e.space_id||old.questionId!==e.props.questionId||old.descriptor.sha256!==prior.sha256||old.descriptor.size!==prior.size||old.nativeBindingSha256!==await nativeBinding(request.native,request.descriptor,request.files)||request.descriptor.encoding.originalName!==old.originalName||request.descriptor.id!==e.id||request.descriptor.size!==e.size||request.descriptor.sha256!==e.sha256||request.descriptor.name!==e.name)hold('LOSSLESS_REBIND_MISMATCH');
  proof={...old,fileId:e.id,originRevisionId:e.props.revisionId,descriptor:request.descriptor,nativeSha256:await hash(request.native),provenanceFileId:prior.id};
 }else{
  const base64=request.originalBase64;
  if(typeof base64!=='string'||base64.length>8388608||!base64.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))hold('LOSSLESS_INPUT_UNSUPPORTED',422);
  const original=new Uint8Array(Buffer.from(base64,'base64'));
  if(Buffer.from(original).toString('base64')!==base64)hold('LOSSLESS_INPUT_UNSUPPORTED',422);
  proof=await makeUploadProof({entry:e,descriptor:request.descriptor,native:request.native,files:request.files,original,stored,codec});
 }
 const r=await fetch(url+'/rest/v1/rpc/bank_finish',{method:'POST',headers:{apikey:service,authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({f:e.id,actor:user.id,record:{losslessProof:proof}})});
 if(!r.ok){const failure=await r.json().catch(()=>({}));hold(failure.message||'LOSSLESS_PROOF_PERSIST_FAILED',failure.code==='PT409'?409:r.status);}
 return Response.json({verified:true,proof});
}
