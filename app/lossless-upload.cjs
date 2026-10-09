'use strict';
const fs=require('node:fs'),path=require('node:path'),L=require('./lossless-image.cjs');
const POLICY='lossless-upload-v1';
const FALLBACK=new Set(['LOSSLESS_DISABLED','LOSSLESS_CODEC_UNSUPPORTED','LOSSLESS_INPUT_UNSUPPORTED','LOSSLESS_NATIVE_LIMIT']);
async function prepareJob(bank,job,bundle,input,dir){
 job.losslessAssets||={};
 const {confirmedCrop}=await import('./lossless-runtime/lossless-core.mjs');
 for(const ref of input.refs){
  if(ref.role!=='asset'||job.losslessAssets[ref.key])continue;
  if(!confirmedCrop(bundle.native,ref)||input.refs.some(r=>r.role==='source'&&r.sha256===ref.sha256))continue;
  const prior=(input.losslessSources||[]).find(b=>b.originalName===ref.name&&b.canonicalPngSha256===ref.sha256);
  let canRebind=false;
  if(prior){const entry=(await bank.storage.get(prior.descriptor.id)).raw;
   const {nativeBinding,validateStoredProof}=await import('./lossless-runtime/lossless-upload-contract.mjs');
   const old=await validateStoredProof({entry,descriptor:prior.descriptor,native:prior.native,files:prior.files,spaceId:prior.spaceId,questionId:prior.questionId});
   const next={...prior.descriptor,key:ref.key};
   canRebind=entry.owner_id===bank.auth.status().account?.id&&entry.props.questionId===job.questionId&&old.nativeBindingSha256===await nativeBinding(bundle.native,next,bundle.files);
  }
  if(canRebind){
   const bytes=await bank.storage.download(prior.descriptor.id,prior.descriptor);
   const target=path.join(dir,'lossless-rebind',prior.descriptor.sha256+'.webp');fs.mkdirSync(path.dirname(target),{recursive:true});
   if(fs.existsSync(target)){if(L.sha(fs.readFileSync(target))!==prior.descriptor.sha256)throw Error('Lossless rebind local bytes changed');}else fs.writeFileSync(target,bytes,{flag:'wx'});
   job.losslessAssets[ref.key]={adopted:true,file:target,name:path.basename(target),sha256:prior.descriptor.sha256,sourceFileId:prior.descriptor.id,originalName:ref.name};bank.save();continue;
  }
  if(ref.size>6291456)continue;
  const result=await L.prepare(ref.localPath,path.join(dir,'lossless-assets'),{role:'question_crop'});
  // The client and server share the same admitted PNG/WebP envelope.
  if(result.adopted){try{const {inspect}=await import('./lossless-runtime/lossless-wasm-codec.mjs');inspect(fs.readFileSync(ref.localPath));inspect(fs.readFileSync(result.file));}catch{result.adopted=false;result.reason='server-envelope';}}
  job.losslessAssets[ref.key]={...result,originalName:ref.name};bank.save();
 }
}
async function uploadAsset({bank,job,bundle,ref,assets,upload}){
 const stored=job.losslessAssets?.[ref.key];
 if(!stored?.adopted||stored.fallback)return upload(ref.key,ref.localPath,ref.name,ref.role,assets);
 if(L.sha(fs.readFileSync(stored.file))!==stored.sha256)throw Error('Prepared lossless bytes changed');
 const remoteKey=ref.key+':lossless';let remote=job.remote[remoteKey];
 if(!remote){remote=job.remote[remoteKey]={id:await bank.storage.generateId()};bank.save();}
 const bytes=fs.readFileSync(stored.file),descriptor={...bundle.files.find(f=>f.key===ref.key),key:ref.key,id:remote.id,name:stored.name,role:'asset',size:bytes.length,sha256:L.sha(bytes),encoding:{policy:POLICY,originalName:stored.originalName}};
 const proofRequest={operation:stored.sourceFileId?'lossless-rebind-v1':POLICY,id:remote.id,native:bundle.native,descriptor,files:bundle.files,...(stored.sourceFileId?{sourceFileId:stored.sourceFileId}:{originalBase64:fs.readFileSync(ref.localPath).toString('base64')})};
 try{
  await bank.storage.put({file:stored.file,id:remote.id,name:stored.name,parent:assets,properties:{questionId:job.questionId,revisionId:job.revisionId,role:'asset',rootId:job.rootId,losslessUpload:POLICY},losslessVerification:proofRequest});
 }catch(error){
  const code=error.losslessCode||error.code;
  if(!FALLBACK.has(code))throw error;
  stored.fallback=code;bank.save();return upload(ref.key,ref.localPath,ref.name,ref.role,assets);
 }
 job.filesCompleted++;bank.save();return descriptor;
}
module.exports={POLICY,prepareJob,uploadAsset,FALLBACK};
