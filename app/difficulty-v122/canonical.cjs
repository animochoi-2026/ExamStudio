'use strict';
const crypto=require('node:crypto');
function canonical(v){
 if(Array.isArray(v))return v.map(canonical);
 if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,canonical(v[k])]));
 if(typeof v==='number'&&!Number.isFinite(v))throw Error('non-finite canonical number');
 return v;
}
const json=v=>JSON.stringify(canonical(v));
const bytesHash=b=>crypto.createHash('sha256').update(b).digest('hex');
const hash=v=>bytesHash(json(v));
const text=s=>String(s??'').normalize('NFC').replace(/\r\n?/g,'\n').replace(/[ \t\u00a0]+/g,' ').trim();
module.exports={canonical,json,bytesHash,hash,text,version:'difficulty-canonical-nfc-r1'};
