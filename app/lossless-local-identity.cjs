'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const registry=new Map();
// These aliases are populated only after an authenticated server proof and the
// restored PNG bytes have both been verified. File integrity still hashes bytes.
function register(file,identity){registry.set(path.resolve(file),{...identity});}
function digest(file,kind,actual){const e=registry.get(path.resolve(file));if(!e)return actual;
 const sha=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 if(sha!==e.canonicalPngSha256)return actual;
 return kind==='legacy'?e.originalLegacyDigest:e.originalSha256;
}
module.exports={register,digest,clear:()=>registry.clear()};
