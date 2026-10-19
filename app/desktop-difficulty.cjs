'use strict';
// Preserve the established final-number policy; expose AI raw score separately.
// Existing provider rubric labels/provenance stay intact in storage.
const D=require('./difficulty-assessment.cjs');
function score(value){try{const n=D.score(value);return n===null?null:Number(n);}catch{return null;}}
function band(value){const n=score(value);return n===null?null:D.compositionLabels[require('./difficulty-policy.cjs').composition(n)];}
function effective(item){const final=D.effective(item),raw=score(D.currentAI(item)?.score);return {number:final.number,band:band(final.number),source:final.numberSource,rawAI:raw};}
module.exports={score,band,effective};
