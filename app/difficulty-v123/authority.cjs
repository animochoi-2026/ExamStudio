'use strict';
const V=require('../difficulty-v122/validate.cjs'),O=require('../difficulty-output-policy.cjs'),C=require('../difficulty-v122/canonical.cjs');
function next(stage,r,{smoke=false}={}){if(O.outputLimit(r)||r.status==='unresolved'||r.systemicFailure)return null;if(stage===2&&r.status==='complete')return null;const n=V.nextStage(stage,r);return smoke&&n===3?null:n;}
function circuit(){let stopped=false,last=null,consecutive=0,count=0;const seen=new Map();return {observe(q,r){count++;if(r.systemicFailure)stopped=true;const key=r.validation?.reason==='difficulty_structure_invalid'?C.hash({reason:r.validation.reason,detail:r.validation.detail}):null;if(key){consecutive=key===last?consecutive+1:1;const xs=seen.get(key)||new Set();xs.add(q);seen.set(key,xs);if(consecutive>=3||count<=10&&xs.size>=3)stopped=true;}else consecutive=0;last=key;return stopped;},get stopped(){return stopped;}};}
module.exports={next,circuit};
