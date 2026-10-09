'use strict';
const fail=m=>{throw Error(m||'난이도 평가 근거 형식 오류');};
module.exports={ok:(v,m)=>{if(!v)fail(m);},equal:(a,b,m)=>{if(a!==b)fail(m);},deepEqual:(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))fail(m);}};
