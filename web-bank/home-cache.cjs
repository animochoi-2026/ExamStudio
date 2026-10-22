'use strict';
// Memory only. Never share values across user/role/grade contexts.
function createHomeCache({now=Date.now,ttl=Infinity}={}){
 let scope='',generation=0,value=null,at=0,pending=null;
 const clear=()=>{generation++;value=null;at=0;pending=null;};
 return {clear,setScope(next){const key=JSON.stringify(next);if(key!==scope){scope=key;clear();}},peek(){return value?structuredClone(value):null;},fresh(){return value!==null&&now()-at<ttl;},
 async get(load,{force=false}={}){if(!force&&value!==null&&now()-at<ttl)return structuredClone(value);if(pending)return structuredClone(await pending);
 const epoch=generation,job=Promise.resolve().then(load).then(next=>{if(epoch!==generation)throw Object.assign(Error('조회 범위가 변경되었습니다.'),{code:'stale_cache'});value=structuredClone(next);at=now();return next;});pending=job;
 try{return structuredClone(await job);}finally{if(pending===job)pending=null;}}
 };
}
module.exports={createHomeCache};
