'use strict';
// One process owns the runner lock. Each worker owns one item through all stages.
async function runPool(items,{concurrency=1,shouldStop=()=>false},work){
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>3)throw Error('concurrency_approval_required');
 let cursor=0,fatal=null;
 async function worker(){
  while(!fatal){
   if(shouldStop()){fatal=Error('operator_stop_requested');return;}
   const index=cursor++;if(index>=items.length)return;
   try{await work(items[index],index);}catch(error){fatal=fatal||error;return;}
  }
 }
 // Drain every existing call before releasing the lock or reporting fatal stop.
 await Promise.all(Array.from({length:concurrency},worker));
 if(fatal)throw fatal;
}
module.exports={runPool};
