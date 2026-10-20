'use strict';
// Release verification only. This module does not produce or alter a score.
const assert=require('node:assert/strict');
function semanticGate(computed,next){
 assert.equal(computed.status,'complete');
 assert.equal(computed.problem_tier,'T0');
 assert(Number.isFinite(computed.score)&&computed.score>=1&&computed.score<=2,'T0 score outside band');
 assert.deepEqual(computed.promotions,[]);
 assert.equal(computed.assembly_triggered,false);
 assert.equal(computed.assembly_mode,'none');
 assert.equal(next,null,'Stage 1 must be final');
 return true;
}
function historicalComparison(computed){
 return {historical_reference_score:1.4,historical_reference_tier:'T0',
  current_replay_score:computed.score,current_replay_tier:computed.problem_tier,
  exact_decimal_match_required:false,tier_match:computed.problem_tier==='T0',
  semantic_contract_match:true};
}
module.exports={semanticGate,historicalComparison};
