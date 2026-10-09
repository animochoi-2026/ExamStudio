import {hash,same,confirmedCrop,hold} from './lossless-core.mjs';
export const POLICY='lossless-upload-v1';
export const BINDING='lossless-native-source-v1';
export const needsLossless=d=>d?.encoding?.policy===POLICY;
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function checkDescriptor(d){
 if(!d||d.role!=='asset'||!needsLossless(d)||Object.keys(d.encoding).sort().join(',')!=='originalName,policy'||!Number.isSafeInteger(d.size)||d.size<1||!hex(d.sha256)||typeof d.key!=='string'||!d.key||!String(d.name).endsWith('.webp')||typeof d.encoding.originalName!=='string'||!d.encoding.originalName.toLowerCase().endsWith('.png')||/[\\/:\x00]/.test(d.name)||/[\\/:\x00]/.test(d.encoding.originalName))hold('LOSSLESS_DESCRIPTOR_INVALID');
}
// Local paths/IDs and recomputed diagnostics do not grant source identity.
// Source byte hashes, every source/crop region, content, settings, consent,
// ignored issues and the target crop's structural positions remain bound.
export async function nativeBinding(native,descriptor,files){
 checkDescriptor(descriptor);
 if(!confirmedCrop(native,descriptor)||!Array.isArray(files))hold('LOSSLESS_NATIVE_BINDING');
 const n=structuredClone(native),p=n.project;
 for(const k of ['id','createdAt','updatedAt'])delete p[k];
 for(const problem of p.problems||[]){
  for(const k of ['threadId','geminiThreadId','losslessStorage','losslessUploadOrigin'])delete problem[k];
  const r=problem.recognition;if(r){for(const k of ['status','assessment','assessmentOrigin'])delete r[k];r.statementBox||=[];if(r.generationConsent)delete r.generationConsent.active;}
  for(const q of [problem.original,...(problem.variants||[])].filter(Boolean)){
   q.statementBox||=[];q.layoutDocument??=r?.layoutDocument||null;
   for(const k of ['assessment','approval','legacyInclude','include','needsReview','reviewReasons','validation','checks'])delete q[k];
   if(q.questionOnlyExport)delete q.questionOnlyExport.sourceKey;
  }
 }
 const byKey=new Map(files.map(f=>[f.key,f])),tokens=new Map();
 function normalize(v){
  if(typeof v==='string'&&v.startsWith('bank-asset:')){
   const key=v.slice(11),f=byKey.get(key);
   if(key===descriptor.key)return 'lossless-target-crop';
   if(f?.role==='source'){if(!hex(f.sha256)||!Number.isSafeInteger(f.size))hold('LOSSLESS_SOURCE_IDENTITY');return {sourceSha256:f.sha256,sourceSize:f.size};}
   if(!tokens.has(key))tokens.set(key,tokens.size);return 'native-asset:'+tokens.get(key);
  }
  if(Array.isArray(v))return v.map(normalize);
  if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])]));
  return v;
 }
 // Every actual native source must resolve to a source descriptor.
 for(const source of p.sources||[p.source]){const key=source?.path?.startsWith('bank-asset:')?source.path.slice(11):null;if(!key||byKey.get(key)?.role!=='source')hold('LOSSLESS_SOURCE_IDENTITY');}
 return hash({policy:BINDING,native:normalize(n)});
}
export async function validateStoredProof({entry,descriptor,native,files,spaceId,questionId}){
 checkDescriptor(descriptor);const e=entry?.lossless_proof;
 if(!entry?.verified||entry.kind!=='file'||entry.props?.losslessUpload!==POLICY||!e||e.policy!==POLICY||e.bindingPolicy!==BINDING||e.spaceId!==entry.space_id||e.questionId!==entry.props.questionId||e.ownerId!==entry.owner_id||e.fileId!==entry.id||e.originRevisionId!==entry.props.revisionId||entry.props.role!=='asset'||entry.sha256!==descriptor.sha256||entry.size!==descriptor.size||!same(e.descriptor,descriptor)||e.spaceId!==spaceId||e.questionId!==questionId||!hex(e.originalSha256)||!hex(e.originalLegacyDigest)||!hex(e.canonicalPngSha256)||!hex(e.restoredLegacyDigest)||!hex(e.pixelSha256)||e.pngContract!=='rgba8-stored-deflate-v1'||e.nativeBindingSha256!==await nativeBinding(native,descriptor,files))hold('LOSSLESS_PROOF_MISMATCH');
 return e;
}
