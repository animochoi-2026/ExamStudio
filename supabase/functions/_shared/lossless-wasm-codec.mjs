import {ImageMagick,initializeImageMagick,MagickFormat,ColorSpace,MagickReadSettings,ResourceLimits} from './vendor/magick-wasm-0.0.44/dist/index.js';
import {sha,pngSafe,hold} from './lossless-core.mjs';
export const WASM_SHA256='b7d6710436b150dc5bd1ca04d80b6b7614c54854d7470f888f7e69a2a41b00e4';
export const CODEC_ID='magick-wasm-0.0.44-x86-'+WASM_SHA256+'-rgba8-v1';
export const LIMITS=Object.freeze({inputBytes:6291456,pixels:6100000,dimension:10000,memoryBytes:100663296,maxRequestBytes:67108864,decodeMilliseconds:1500});
let ready;
export function inspect(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length>LIMITS.inputBytes||bytes.length<25)hold('LOSSLESS_INPUT_LIMIT');
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width,height,format;
 if(pngSafe(bytes)){width=d.getUint32(16);height=d.getUint32(20);format='png';}
 else{const ascii=(a,b)=>new TextDecoder().decode(bytes.subarray(a,b));
  // Deliberately accept only a single VP8L image. No animation, profiles,
  // EXIF, ancillary chunks or lossy VP8 input enters the decoder.
  if(ascii(0,4)!=='RIFF'||d.getUint32(4,true)!==bytes.length-8||ascii(8,12)!=='WEBP'||ascii(12,16)!=='VP8L')hold('LOSSLESS_FORMAT_OR_METADATA_UNSUPPORTED');
  const length=d.getUint32(16,true);if(length<5||20+length+(length&1)!==bytes.length||bytes[20]!==0x2f)hold('LOSSLESS_WEBP_CONTAINER');
  const bits=d.getUint32(21,true);if(bits>>>29)hold('LOSSLESS_WEBP_VERSION');width=(bits&16383)+1;height=((bits>>>14)&16383)+1;format='webp';
 }
 if(!width||!height||width>LIMITS.dimension||height>LIMITS.dimension||width*height>LIMITS.pixels)hold('LOSSLESS_PIXEL_LIMIT');return{width,height,format};
}
export function createWasmCodec(loadWasm){
 return Object.freeze({id:CODEC_ID,supported:true,limits:LIMITS,async decode(bytes){
  const expected=inspect(bytes);
  // Bytes are loaded from the pinned local artifact, never a request URL.
  ready??=(async()=>{const wasm=await loadWasm();if(await sha(wasm)!==WASM_SHA256)hold('LOSSLESS_WASM_INTEGRITY',501);await initializeImageMagick(wasm);
   ResourceLimits.memory=BigInt(LIMITS.memoryBytes);ResourceLimits.maxMemoryRequest=BigInt(LIMITS.maxRequestBytes);ResourceLimits.disk=0n;ResourceLimits.listLength=2n;ResourceLimits.width=BigInt(LIMITS.dimension);ResourceLimits.height=BigInt(LIMITS.dimension);ResourceLimits.area=BigInt(LIMITS.pixels);ResourceLimits.maxProfileSize=65536n;
  })();
  try{await ready;}catch(e){ready=undefined;throw e;}
  const settings=new MagickReadSettings({format:expected.format==='png'?MagickFormat.Png:MagickFormat.WebP});settings.syncImageWithExifProfile=false;settings.syncImageWithTiffProperties=false;
  const start=performance.now();
  // Pinned 0.0.44 toByteArray uses HEAPU8.slice: already an owned JS copy.
  // Returning that copy survives collection disposal without a second RGBA copy.
  const result=ImageMagick.readCollection(bytes,settings,images=>{if(images.length!==1)hold('LOSSLESS_MULTIFRAME');const im=images[0];if(im.width!==expected.width||im.height!==expected.height||im.colorSpace!==ColorSpace.sRGB||im.profileNames.length)hold('LOSSLESS_COLOR_OR_METADATA_UNSUPPORTED');const rgba=im.getPixels(p=>p.toByteArray(0,0,im.width,im.height,'RGBA'));if(!(rgba instanceof Uint8Array)||rgba.length!==im.width*im.height*4)hold('LOSSLESS_RGBA_CONTRACT');return{...expected,rgba};});
  const elapsed=performance.now()-start;if(elapsed>LIMITS.decodeMilliseconds)hold('LOSSLESS_DECODE_BUDGET_EXCEEDED',503);
  return result;
 }});
}
