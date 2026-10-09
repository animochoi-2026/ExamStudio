'use strict';
const fs=require('node:fs'),{createHash}=require('node:crypto');
// Bounded process cache; metadata is rechecked on every use, including response guards.
class FileDigests {
 constructor(limit=128){this.limit=limit;this.entries=new Map();}
 get(file){
  let stat;try{stat=fs.statSync(file,{bigint:true});}catch(error){if(error.code==='ENOENT'){this.entries.delete(file);return file;}throw error;}
  const key=[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
  let entry=this.entries.get(file);
  if(!entry||entry.key!==key)entry={key,digest:createHash('sha256').update(JSON.stringify(fs.readFileSync(file).toString('base64'))).digest('hex')};
  this.entries.delete(file);this.entries.set(file,entry);
  while(this.entries.size>this.limit)this.entries.delete(this.entries.keys().next().value);
  return entry.digest;
 }
}
module.exports={FileDigests};
