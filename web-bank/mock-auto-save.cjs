'use strict';
// Retry only a definite duplicate rejection (transaction rolled back). Network
// failures or optimistic document-version conflicts never trigger regeneration.
function conflicts(error){if(error.code!=='PT409')return null;try{const rows=JSON.parse(error.details);return Array.isArray(rows)&&rows.length&&rows.every(x=>x.originalId&&x.questionId)?rows:null;}catch{return null;}}
async function saveWithRepair(document,{save,repair,onRepair=()=>{}}){
 let doc=structuredClone(document),changes=false;
 for(let attempt=0;attempt<4;attempt++)try{return {response:await save(doc),document:doc,repaired:changes};}catch(e){const rows=conflicts(e);if(!rows||attempt===3)throw e;
  const affected=doc.variants.filter(v=>v.paper?.items.some(i=>rows.some(r=>r.questionId===i.questionId||r.originalId===require('./mock-auto-fill.cjs').identity(i))));
  if(!affected.length||affected.some(v=>!v.paper.autoComposition))throw e;
  onRepair(attempt);doc=await repair(doc,affected.map(v=>v.id),rows,{dropOnly:attempt===2});changes=true;
 }
}
module.exports={saveWithRepair,conflicts};
