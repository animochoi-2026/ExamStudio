'use strict';
// Exclusive immutable intents are retained forever, including unknown outcomes.
// This store is local/staging only. No database client is loaded.
const fs=require('node:fs'),path=require('node:path'),C=require('./canonical.cjs'),K=require('./contracts.cjs');
function fileStore(root){
 fs.mkdirSync(root,{recursive:true});
 const file=(key,suffix)=>{if(!/^[0-9a-f]{64}$/.test(key))throw Error('unsafe ledger key');return path.join(root,key+suffix+'.json');};
 const read=(key,suffix)=>{const f=file(key,suffix);return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):null;};
 const put=(key,suffix,value)=>fs.writeFileSync(file(key,suffix),C.json(value)+'\n',{flag:'wx'});
 return {
  root,
  openBatch:key=>require('./checkpoint.cjs').open(path.join(root,'batches',key)),
  getIntent:key=>read(key,'.intent'),
  get:key=>{const v=read(key,'.final');if(v)K.verifyEnvelope(v);return v;},
  claim:(key,intent)=>{try{put(key,'.intent',intent);return true;}catch(e){if(e.code==='EEXIST')return false;throw e;}},
  getStage:key=>{const v=read(key,'.stage');if(v)K.verifyEnvelope(v);return v;},
  stage:(key,value)=>{K.verifyEnvelope(value);require('./checkpoint.cjs').atomic(file(key,'.stage'),value);},
  finish:(key,value)=>{K.verifyEnvelope(value);require('./checkpoint.cjs').atomic(file(key,'.final'),value);},
  audit:(key,value)=>put(key,'.audit',value)
 };
}
module.exports={fileStore};
