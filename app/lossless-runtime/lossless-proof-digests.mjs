// Server-only: node:crypto is already used by the existing bank-verify Edge.
// No encoder/decoder contract changes and no full PNG or base64 allocation.
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {hold} from './lossless-core.mjs';
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
const crcUpdate=(state,bytes)=>{for(let i=0;i<bytes.length;i++)state=(state>>>8)^crcTable[(state^bytes[i])&255];return state>>>0;};
const u32=n=>Uint8Array.of(n>>>24,n>>>16,n>>>8,n);
const enc=new TextEncoder();
function* smallChunk(type,data){const t=enc.encode(type);yield u32(data.length);yield t;yield data;yield u32((crcUpdate(crcUpdate(0xffffffff,t),data)^0xffffffff)>>>0);}

// Yields exactly core.canonicalPng's RGBA8/filter-0/stored-deflate bytes.
// The <=65535 byte scan buffer is borrowed until the next next() call; consumers
// must consume synchronously (or copy explicitly if retaining test bytes).
export function* canonicalPngParts({width,height,rgba}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>6100000||rgba.length!==width*height*4)hold('Pixel limit');
 yield Uint8Array.of(137,80,78,71,13,10,26,10);
 const ihdr=new Uint8Array(13);ihdr.set(u32(width));ihdr.set(u32(height),4);ihdr.set([8,6,0,0,0],8);yield* smallChunk('IHDR',ihdr);
 const rowBytes=width*4+1,scanBytes=rowBytes*height,blocks=Math.ceil(scanBytes/65535);
 yield u32(2+scanBytes+blocks*5+4);
 const type=enc.encode('IDAT');yield type;let crc=crcUpdate(0xffffffff,type);
 const zlib=Uint8Array.of(0x78,0x01);crc=crcUpdate(crc,zlib);yield zlib;
 const scan=new Uint8Array(Math.min(65535,scanBytes));let position=0,row=0,column=0,adlerA=1,adlerB=0;
 while(position<scanBytes){
  const n=Math.min(scan.length,scanBytes-position);let written=0;
  while(written<n){
   if(column===0){scan[written++]=0;column=1;}
   const count=Math.min(n-written,rowBytes-column);
   if(count){scan.set(rgba.subarray(row*width*4+column-1,row*width*4+column-1+count),written);written+=count;column+=count;}
   if(column===rowBytes){column=0;row++;}
  }
  const header=Uint8Array.of(position+n===scanBytes?1:0,n&255,n>>>8,(~n)&255,((~n)>>>8)&255);
  crc=crcUpdate(crc,header);yield header;
  const data=scan.subarray(0,n);
  // At most 65535 additions between modulo operations; JS integers stay exact.
  for(let i=0;i<n;i++){adlerA+=data[i];adlerB+=adlerA;}
  adlerA%=65521;adlerB%=65521;
  crc=crcUpdate(crc,data);yield data;position+=n;
 }
 const adler=u32(((adlerB<<16)|adlerA)>>>0);crc=crcUpdate(crc,adler);yield adler;yield u32((crc^0xffffffff)>>>0);
 yield* smallChunk('IEND',new Uint8Array());
}

class LegacyDigest{
 constructor(){this.hash=createHash('sha256').update('"');this.carry=new Uint8Array(0);}
 update(bytes){
  let offset=0;
  if(this.carry.length){const n=Math.min(3-this.carry.length,bytes.length),prefix=new Uint8Array(this.carry.length+n);prefix.set(this.carry);prefix.set(bytes.subarray(0,n),this.carry.length);offset=n;if(prefix.length<3){this.carry=prefix;return;}this.hash.update(Buffer.from(prefix.buffer).toString('base64'));this.carry=new Uint8Array(0);}
  const length=bytes.length-offset,complete=length-length%3;
  if(complete)this.hash.update(Buffer.from(bytes.buffer,bytes.byteOffset+offset,complete).toString('base64'));
  this.carry=bytes.slice(offset+complete);
 }
 digest(){if(this.carry.length)this.hash.update(Buffer.from(this.carry).toString('base64'));return this.hash.update('"').digest('hex');}
}
export function legacyDigestParts(parts){const h=new LegacyDigest();for(const part of parts)h.update(part);return h.digest();}
function* byteParts(bytes){for(let i=0;i<bytes.length;i+=65535)yield bytes.subarray(i,i+65535);}
export function proofDigests(original,pixels){
 const pngHash=createHash('sha256'),legacy=new LegacyDigest();let pngBytes=0;
 for(const part of canonicalPngParts(pixels)){pngHash.update(part);legacy.update(part);pngBytes+=part.length;}
 return {pixelSha256:createHash('sha256').update(pixels.rgba).digest('hex'),canonicalPngSha256:pngHash.digest('hex'),canonicalPngBytes:pngBytes,originalLegacyDigest:legacyDigestParts(byteParts(original)),restoredLegacyDigest:legacy.digest()};
}
