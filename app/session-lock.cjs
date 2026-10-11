'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
function acquire(file){
 const lock=file+'.lock';fs.mkdirSync(path.dirname(file),{recursive:true});
 const owner=JSON.stringify({pid:process.pid,id:crypto.randomUUID()});
 try{fs.writeFileSync(lock,owner,{flag:'wx'});}catch(e){
  if(e.code!=='EEXIST')throw e;
  let old;try{old=fs.readFileSync(lock,'utf8');const {pid}=JSON.parse(old);try{process.kill(pid,0);return null;}catch(x){if(x.code!=='ESRCH')return null;}}catch{return null;}
  if(fs.readFileSync(lock,'utf8')===old)fs.unlinkSync(lock);return null;
 }
 return {file,release(){if(fs.existsSync(lock)&&fs.readFileSync(lock,'utf8')===owner)fs.unlinkSync(lock);}};
}
async function withLock(file,fn){const deadline=Date.now()+50000;let lease;while(!(lease=acquire(file))){if(Date.now()>deadline)throw Object.assign(Error('공동 문제은행 인증 갱신을 기다리고 있습니다. 잠시 후 이어가세요.'),{code:'network',service:'supabase',dispatched:false});await new Promise(r=>setTimeout(r,40));}try{return await fn(lease);}finally{lease.release();}}
module.exports={acquire,withLock};
