'use strict';
// Local derivatives only. Source bytes are never rewritten; ambiguous metadata
// is preserved by declining conversion. No network or authorization decisions.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const POLICY='lossless-preview-v1';
function mime(bytes){
 if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 throw Error('Unsupported preview image signature');
}
function pngPolicy(bytes){
 if(mime(bytes)!=='image/png')return 'not-png';
 for(let at=8;at<bytes.length;){
  if(at+12>bytes.length)return 'invalid-png';const size=bytes.readUInt32BE(at),type=bytes.toString('ascii',at+4,at+8);
  if(at+12+size>bytes.length)return 'invalid-png';
  // pHYs, ICC, EXIF, text, gamma/chromaticities, animation and unknown chunks
  // are excluded rather than silently discarded or color-normalized.
  if(!['IHDR','IDAT','IEND','PLTE','tRNS','sRGB'].includes(type))return 'metadata-'+type;
  at+=size+12;if(type==='IEND')return at===bytes.length?null:'trailing-data';
 }
 return 'invalid-png';
}
async function optimize(bytes,{role,encode=bytes=>sharp(bytes).webp({lossless:true,effort:6}).toBuffer()}={}){
 const original=Buffer.from(bytes),sourceSha256=sha(original),keep=reason=>({adopted:false,reason,bytes:original,sourceSha256,sha256:sourceSha256,policy:POLICY});
 if(!['preview','question_crop'].includes(role))return keep('excluded-role');
 if(original.length>64*1024*1024)return keep('input-limit');
 try{
  const reason=pngPolicy(original);if(reason)return keep(reason);
  const m=await sharp(original,{limitInputPixels:40000000}).metadata();
  if(m.format!=='png'||m.depth!=='uchar'||m.space!=='srgb'||m.pages>1||m.icc||m.exif||m.xmp||m.iptc||m.orientation)return keep('unsupported-metadata-or-depth');
  if(m.width*m.height>40000000)return keep('pixel-limit');
  const encoded=await encode(original);if(encoded.length>=original.length)return keep('not-smaller');
  if(mime(encoded)!=='image/webp')return keep('encoder-format');
  const decode=b=>sharp(b,{limitInputPixels:40000000}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const before=await decode(original),after=await decode(encoded);
  if(before.info.width!==after.info.width||before.info.height!==after.info.height||before.info.channels!==after.info.channels||!before.data.equals(after.data))return keep('pixel-mismatch');
  return {adopted:true,reason:'smaller-pixel-identical',bytes:encoded,sourceSha256,sha256:sha(encoded),width:m.width,height:m.height,policy:POLICY};
 }catch(error){return keep('conversion-failed');}
}
async function prepare(file,directory,{role='preview'}={}){
 const original=fs.readFileSync(file),result=await optimize(original,{role});
 if(!result.adopted)return {...result,bytes:undefined,file,name:path.basename(file)};
 fs.mkdirSync(directory,{recursive:true});const target=path.join(directory,result.sha256+'.webp');
 try{fs.writeFileSync(target,result.bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;if(sha(fs.readFileSync(target))!==result.sha256)throw Error('Immutable image collision');}
 return {...result,bytes:undefined,file:target,name:path.basename(target)};
}
module.exports={optimize,prepare,mime,sha,POLICY};
