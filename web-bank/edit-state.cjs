'use strict';
// Rendering enriches these fields but is not an edit. Order and all editable
// settings remain significant; returning to the saved value clears dirty.
const derived=new Set(['version','status','layout','catalogSnapshot','scoreSnapshot','originalPoints','questionSet','questionSetRegistry','scopeAllocation','sharing']);
function fingerprint(value){
 const clean=x=>Array.isArray(x)?x.map(clean):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().filter(k=>!derived.has(k)).map(k=>[k,clean(x[k])])):x;
 return JSON.stringify(clean(value));
}
module.exports={fingerprint};
