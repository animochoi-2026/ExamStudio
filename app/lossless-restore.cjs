'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const POLICY='lossless-upload-v1';
async function modules(){return Promise.all([import('./lossless-runtime/lossless-upload-contract.mjs'),import('./lossless-runtime/lossless-core.mjs')]);}
async function restore({bundle,files,folder,storage,options={}}){
 const adapted=structuredClone(bundle),local=new Map(files),bindings=[];
 for(const descriptor of bundle.files.filter(f=>f.encoding?.policy===POLICY)){
  const [{validateStoredProof},{canonicalPng}]=await modules();
  const entry=(await storage.get(descriptor.id)).raw;
  const proof=await validateStoredProof({entry,descriptor,native:bundle.native,files:bundle.files,spaceId:entry.space_id,questionId:bundle.questionId});
  const bytes=files.get(descriptor.key);if(!bytes||bytes.length!==descriptor.size||sha(bytes)!==descriptor.sha256)throw Error('무손실 저장 파일을 검증하지 못했습니다.');
  const codec=await require('./lossless-wasm-codec.cjs')();if(codec.id!==proof.codec)throw Error('지원하지 않는 무손실 저장 규격입니다.');
  const pixels=await codec.decode(bytes);if(pixels.width!==proof.width||pixels.height!==proof.height||sha(pixels.rgba)!==proof.pixelSha256)throw Error('무손실 이미지 픽셀이 다릅니다.');
  const png=Buffer.from(canonicalPng(pixels));if(sha(png)!==proof.canonicalPngSha256||png.length!==proof.canonicalPngBytes)throw Error('무손실 PNG 복원 결과가 다릅니다.');
  const item=adapted.files.find(f=>f.key===descriptor.key);item.name=descriptor.encoding.originalName;item.size=png.length;item.sha256=sha(png);delete item.encoding;local.set(descriptor.key,png);
  bindings.push({descriptor:structuredClone(descriptor),originalName:item.name,canonicalPngSha256:proof.canonicalPngSha256,spaceId:entry.space_id,questionId:bundle.questionId,native:structuredClone(bundle.native),files:structuredClone(bundle.files)});
 }
 const project=require('./bank-model.cjs').restoreSnapshot(adapted,local,folder,options);
 for(const p of project.problems){const own=bindings.filter(b=>p.cropPaths.some(f=>path.basename(f)===b.originalName));if(own.length)p.losslessStorage={version:1,bindings:own};}
 await rehydrate(project,storage);return project;
}
async function rehydrate(project,storage){
 if(!project)return project;
 for(const p of project.problems||[])for(const binding of p.losslessStorage?.bindings||[]){
  const file=p.cropPaths.find(f=>path.basename(f)===binding.originalName);if(!file||!fs.existsSync(file)||sha(fs.readFileSync(file))!==binding.canonicalPngSha256)continue;
  const [{validateStoredProof}]=await modules();const entry=(await storage.get(binding.descriptor.id)).raw;
  const proof=await validateStoredProof({entry,descriptor:binding.descriptor,native:binding.native,files:binding.files,spaceId:binding.spaceId,questionId:binding.questionId});
  if(proof.canonicalPngSha256!==binding.canonicalPngSha256)throw Error('복원 이미지의 서버 증명이 변경되었습니다.');
  require('./lossless-local-identity.cjs').register(file,proof);
 }
 return project;
}
module.exports={restore,rehydrate};
