'use strict';
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const path=require('node:path');

// Existing retention policy, read only. Keep file scanning/hashing off the UI thread.
function readPlan(directory){return new Promise((resolve,reject)=>{
 const worker=new Worker(__filename,{workerData:{task:'startup-retention-plan',directory:path.resolve(directory)}});worker.unref();let settled=false;
 worker.once('message',message=>{settled=true;message.error?reject(Error(message.error)):resolve(message.plan);});
 worker.once('error',error=>{settled=true;reject(error);});
 worker.once('exit',code=>{if(!settled)reject(Error('정리 대상 확인 작업이 끝나지 않았습니다. 종료 코드 '+code));});
});}

function active(owner){return !owner.isDestroyed()&&owner.isVisible()&&!owner.isMinimized()&&owner.isFocused();}
function waitForActive(owner){if(owner.isDestroyed())return Promise.resolve(false);if(active(owner))return Promise.resolve(true);
 return new Promise(resolve=>{const finish=value=>{for(const event of['show','focus','restore'])owner.removeListener(event,check);owner.removeListener('closed',closed);resolve(value);};
 const check=()=>{if(active(owner))finish(true);};const closed=()=>finish(false);
 for(const event of['show','focus','restore'])owner.on(event,check);owner.once('closed',closed);check();
 });
}
async function whileWindowOpen(owner,operation){let closed;const closing=new Promise(resolve=>{closed=()=>resolve({closed:true});owner.once('closed',closed);});
 try{return await Promise.race([operation(),closing]);}finally{owner.removeListener('closed',closed);}
}
class StartupRetentionReview{
 constructor({getWindow,plan,apply,isBusy,showDialog}){Object.assign(this,{getWindow,plan,apply,isBusy,showDialog});this.pending=null;this.handled=null;}
 review(){if(this.handled)return Promise.resolve(this.handled);if(this.pending)return this.pending;
  this.pending=this.run().then(result=>{if(result.status!=='deferred')this.handled=result;return result;}).finally(()=>{this.pending=null;});return this.pending;
 }
 async run(){const owner=this.getWindow();if(!owner||owner.isDestroyed())return{status:'closed'};
  let plan;
  // A background/minimized window must not create a hidden cleanup confirmation.
  do{if(!await waitForActive(owner))return{status:'closed'};if(this.isBusy())return{status:'deferred'};plan=await whileWindowOpen(owner,()=>this.plan());if(plan.closed)return{status:'closed'};}while(!owner.isDestroyed()&&!active(owner));
  if(owner.isDestroyed())return{status:'closed'};if(this.isBusy())return{status:'deferred'};
  if(!plan.candidates.length)return{status:'none'};
  const result=await whileWindowOpen(owner,()=>this.showDialog(owner,{
   type:'question',title:'이전 작업 정리 확인',message:plan.policy,
   detail:'정리 대상:\n'+plan.candidates.map(p=>p.title+' · '+p.updatedAt).join('\n')+'\n\n위 프로젝트와 전용 파일을 영구 삭제할까요? (되돌릴 수 없습니다)',
   buttons:['취소','확인 후 영구 삭제'],defaultId:0,cancelId:0,noLink:true
  }));
  if(result.closed||owner.isDestroyed())return{status:'closed'};
  if(result.response!==1)return{status:'cancelled'};
  if(this.isBusy())return{status:'deferred'};
  // apply() still recomputes the policy and checks token/files before deletion.
  return{status:'completed',...await this.apply({token:plan.token,confirmed:true})};
 }
}

if(!isMainThread&&workerData?.task==='startup-retention-plan'){try{
 const dataDir=workerData.directory,store={dataDir,projectsDir:path.join(dataDir,'projects'),indexFile:path.join(dataDir,'index.json'),projectDir:id=>{
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw Error('올바르지 않은 프로젝트 번호입니다.');return path.join(dataDir,'projects',id);
 }};
 const plan=require('./project-retention.cjs').plan(store);
 parentPort.postMessage({plan:{token:plan.token,policy:plan.policy,keep:plan.keep,excluded:plan.excluded,candidates:plan.candidates.map(({id,title,updatedAt,bytes})=>({id,title,updatedAt,bytes}))}});
}catch(error){parentPort.postMessage({error:error.message});}}
module.exports={StartupRetentionReview,readPlan};
