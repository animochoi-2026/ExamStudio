import {UPLOAD_ENABLED} from './lossless-upload-config.mjs';
const id='magick-wasm-0.0.44-x86-b7d6710436b150dc5bd1ca04d80b6b7614c54854d7470f888f7e69a2a41b00e4-rgba8-v1';
let instance;
// Legacy PNG/commit requests never import the vendor decoder or read WASM.
// A failed decode cannot cause a fallback to client-supplied pixel evidence.
export const codec=Object.freeze({id,supported:UPLOAD_ENABLED,async decode(bytes){
 if(!UPLOAD_ENABLED)throw Object.assign(Error('LOSSLESS_DISABLED'),{status:501});
 if(!instance){const {createWasmCodec}=await import('./lossless-wasm-codec.mjs');instance=createWasmCodec(async()=>{if(typeof Deno==='undefined'||typeof Deno.readFile!=='function')throw Object.assign(Error('LOSSLESS_CODEC_UNSUPPORTED'),{status:501});return Deno.readFile(new URL('./vendor/magick-wasm-0.0.44/dist/x86/magick.wasm',import.meta.url));});}
 return instance.decode(bytes);
}});
