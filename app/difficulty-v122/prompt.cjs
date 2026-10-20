'use strict';
const {instructions}=require('./prompt.json'),C=require('./canonical.cjs');
function render(prepared){
 const input=JSON.parse(JSON.stringify(prepared.payload));delete input.source_manifest_hash;delete input.source_registry.source_manifest_hash;
 const wire={instructions,input};
 const forbidden=new Set(['previous_score','previous_tier','expected_score','expected_tier','expected_promotions','teacher_override','teacher_override_score','other_model_response','acceptance_criteria']);
 function walk(v){if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){if(forbidden.has(k)||/token|cookie|api.?key|authorization/i.test(k))throw Error('forbidden rendered payload field '+k);walk(x);}}
 walk(wire.input);
 return {text:instructions+'\n\n평가 대상 원문 및 확정 풀이 JSON:\n'+C.json(input),rendered_payload_hash:C.hash(wire)};
}
module.exports={instructions,render};
