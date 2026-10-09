'use strict';
let pending;
module.exports=()=>pending??=(async()=>{const fs=require('node:fs/promises'),path=require('node:path');const {createWasmCodec}=await import('./lossless-runtime/lossless-wasm-codec.mjs');return createWasmCodec(()=>fs.readFile(path.join(__dirname,'lossless-runtime/vendor/magick-wasm-0.0.44/dist/x86/magick.wasm')));})();
