'use strict';
// Explicitly in-memory Google substitute. No real account/network operations.
const fs=require('node:fs');
const {digest,APP,FOLDER}=require('../app/bank-drive.cjs');
const {BankError,EXPECTED_EMAIL}=require('../app/bank-auth.cjs');
class FakeAuth {
 constructor(){this.connected=true;this.safeStorage={encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};}
 status(){return {configured:true,connected:this.connected,account:this.connected?{email:EXPECTED_EMAIL}:null,expectedEmail:EXPECTED_EMAIL};}
 async token(){if(!this.connected)throw new BankError('mock reconnect required','auth');return 'mock-token';}
 async connect(){this.connected=true;} cancel(){} disconnect(){this.connected=false;}
}
class MemoryDrive {
 constructor(){this.files=new Map();this.counter=0;this.putCalls=[];this.failRole=null;this.loseRole=null;}
 async generateId(){return 'mock_'+String(++this.counter).padStart(7,'0');}
 async get(id){const f=this.files.get(id);if(!f)throw new BankError('mock not found','not_found');return structuredClone(f.meta);}
 async download(id,expected){const f=this.files.get(id);if(!f)throw new BankError('mock not found','not_found');const bytes=Buffer.from(f.bytes);if(expected&&(expected.size!==bytes.length||expected.sha256!==digest(bytes)))throw new BankError('mock integrity failure','conflict');return bytes;}
 async checkRoot(id){const f=await this.get(id);if(f.mimeType!==FOLDER)throw Error('not folder');return f;}
 async find(key,parent){return [...this.files.values()].map(f=>f.meta).filter(f=>f.mimeType===FOLDER&&f.appProperties.bankKey===key&&(!parent||f.parents.includes(parent)));}
 async list(query){const values=[...this.files.values()].map(f=>f.meta),key=query.match(/key='sourceKey' and value='([^']+)'/)?.[1];return {files:key?values.filter(f=>f.appProperties?.sourceKey===key):values.filter(f=>f.name==='문제은행')};}
 async folder({key,name,parent,registry,save}){const k=digest(Buffer.from(key)),found=await this.find(k,parent);if(found.length)return found[0].id;const entry=registry[k]||(registry[k]={id:await this.generateId()});save();if(!this.files.has(entry.id))this.files.set(entry.id,{meta:{id:entry.id,name,parents:parent?[parent]:[],mimeType:FOLDER,appProperties:{bankKey:k}},bytes:Buffer.alloc(0)});return entry.id;}
 async put({file,id,name,parent,properties}){const bytes=fs.readFileSync(file),known=this.files.get(id);this.putCalls.push({id,name,role:properties.role});if(known){if(!bytes.equals(known.bytes)||!known.meta.parents.includes(parent))throw new BankError('mock external change','conflict');return known.meta;}if(properties.role===this.failRole)throw new BankError('mock offline','network',true);const meta={id,name,parents:[parent],mimeType:'application/octet-stream',size:String(bytes.length),md5Checksum:digest(bytes,'md5'),appProperties:{app:APP,...properties}};this.files.set(id,{bytes:Buffer.from(bytes),meta});if(properties.role===this.loseRole){this.loseRole=null;throw new BankError('mock response lost','network',true);}return meta;}
 async commits(rootId,questionId){return {files:[...this.files.values()].map(f=>f.meta).filter(f=>f.appProperties.role==='commit'&&f.appProperties.rootId===rootId&&(!questionId||f.appProperties.questionId===questionId))};}
}
module.exports={FakeAuth,MemoryDrive};
