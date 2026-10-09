'use strict';
// Reuse local render bytes only within the same actor/root/question. Remote
// immutable references still require the existing server policy and checks.
const fs=require('node:fs'),path=require('node:path'),{sha}=require('./lossless-image.cjs');
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
function fingerprint(input,version){
 if(!version)return null;
 const aliases=new Map(input.refs.map(r=>[path.resolve(r.localPath),{role:r.role,sha256:r.sha256}]));
 const visit=v=>typeof v==='string'&&path.isAbsolute(v)?aliases.get(path.resolve(v))||v:Array.isArray(v)?v.map(visit):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,visit(x)])):v;
 const project=visit(input.project);for(const k of ['id','createdAt','updatedAt'])delete project[k];
 return sha(Buffer.from(JSON.stringify(stable({project,problemId:input.problemId,questionId:input.questionId,version}))));
}
function descriptor(file){const bytes=fs.readFileSync(file);return {file,size:bytes.length,sha256:sha(bytes)};}
function valid(record){try{return record&&fs.statSync(record.file).size===record.size&&sha(fs.readFileSync(record.file))===record.sha256;}catch{return false;}}
function copyVerified(record,target){
 try{fs.copyFileSync(record.file,target,fs.constants.COPYFILE_EXCL);}catch(error){
  if(error.code!=='EEXIST'||!valid({...record,file:target}))throw error;
 }
}
function reuse(bank,job,input,dir){
 const key=fingerprint(input,bank.rendererVersion);job.renderFingerprint=key;if(!key)return false;
 const prior=bank.state.jobs.find(j=>j.id!==job.id&&j.status==='complete'&&j.renderFingerprint===key&&j.actorId===job.actorId&&j.rootId===(job.rootId||bank.state.root?.id)&&j.questionId===job.questionId&&valid(j.renderArtifacts?.docx)&&(j.previewStatus!=='complete'||valid(j.renderArtifacts?.preview)));
 if(!prior)return false;
 copyVerified(prior.renderArtifacts.docx,path.join(dir,'question.docx'));
 if(prior.previewStatus==='complete')copyVerified(prior.renderArtifacts.preview,path.join(dir,'preview.png'));
 job.previewStatus=prior.previewStatus;job.renderReusedFrom=prior.id;
 // The selected encoded bytes are also immutable. Avoid encoding them again
 // for tag-only revisions; remote IDs/permission checks are never reused here.
 if(prior.previewStorage&&prior.previewStorage.sourceSha256===prior.renderArtifacts.preview?.sha256){
  try{if(sha(fs.readFileSync(prior.previewStorage.file))===prior.previewStorage.sha256)job.previewStorage=structuredClone(prior.previewStorage);}catch{}
 }
 return true;
}
function record(job,dir){job.renderArtifacts={docx:descriptor(path.join(dir,'question.docx'))};if(job.previewStatus==='complete')job.renderArtifacts.preview=descriptor(path.join(dir,'preview.png'));}
module.exports={fingerprint,reuse,record};
