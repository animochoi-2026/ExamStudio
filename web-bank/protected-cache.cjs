'use strict';
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
function createCache({ttl=60000,now=Date.now,max=60}={}){let scope='',epoch=0;const entries=new Map();return{
 setScope(next){const value=JSON.stringify(stable(next));if(value!==scope){scope=value;epoch++;entries.clear();}},
 clear(){epoch++;entries.clear();},
 async get(key,load){const k=scope+JSON.stringify(stable(key)),old=entries.get(k);if(old&&old.until>now())return structuredClone(await old.value);
 const generation=epoch,promise=Promise.resolve().then(load);entries.set(k,{until:now()+ttl,value:promise});while(entries.size>max)entries.delete(entries.keys().next().value);
 try{const result=await promise;if(generation!==epoch)throw Object.assign(Error('계정 또는 조회 정보가 변경되었습니다. 다시 조회하세요.'),{code:'stale_cache'});return structuredClone(result);}catch(e){if(entries.get(k)?.value===promise)entries.delete(k);throw e;}
 }
};}
module.exports={createCache};
