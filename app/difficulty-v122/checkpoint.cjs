'use strict';
// Local staging only. Immutable call records and atomic replaceable progress.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),C=require('./canonical.cjs');
function atomic(file,value,{replace=false,rename=fs.renameSync}={}){
 const bytes=C.json(value)+'\n';
 if(!replace&&fs.existsSync(file)){
  if(fs.readFileSync(file,'utf8')!==bytes)throw Error('immutable_checkpoint_conflict');
  return;
 }
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const tmp=file+'.'+crypto.randomUUID()+'.tmp',fd=fs.openSync(tmp,'wx');
 try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 rename(tmp,file);
}
function open(root,{clock=Date.now,alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}},rename=fs.renameSync}={}){
 fs.mkdirSync(root,{recursive:true});
 const read=name=>{const f=path.join(root,name);return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):null;};
 const write=(name,v,replace=false)=>atomic(path.join(root,name),v,{replace,rename});
 let token=null;
 return {root,read,write,
  acquire(){
   const file=path.join(root,'runner.lock'),old=read('runner.lock');
   if(old){
    if(old.expires_at>clock()||alive(old.pid))throw Error('batch_lease_active');
    // Verify progress is readable before retiring a dead, expired lease.
    read('checkpoint.json');
    rename(file,path.join(root,'retired-lease-'+old.token+'.json'));
   }
   token=crypto.randomUUID();
   fs.writeFileSync(file,C.json({token,pid:process.pid,expires_at:clock()+30*60*1000}),{flag:'wx'});
  },
  heartbeat(){
   if(!token||read('runner.lock')?.token!==token)throw Error('batch_lease_lost');
   write('runner.lock',{token,pid:process.pid,expires_at:clock()+30*60*1000},true);
  },
  release(){
   if(token&&read('runner.lock')?.token===token)fs.unlinkSync(path.join(root,'runner.lock'));
   token=null;
  }
 };
}
module.exports={atomic,open};
