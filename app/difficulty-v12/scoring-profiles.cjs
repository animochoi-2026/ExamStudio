'use strict';
// Explicit pilot policy; historic default and its prompt stay reproducible.
const I=require('./input.cjs'),S=require('./schema.cjs'),C=require('./scorer.cjs');
const literacyOneId='literacy-plus-one-20261018';
function get(id='legacy'){
 if(id==='legacy')return {id,instructions:I.instructions,promptHash:I.promptHash,scorerVersion:C.version,evaluate:S.evaluate};
 if(id!==literacyOneId)throw Error('Unknown difficulty scoring profile: '+id);
 const instructions=I.instructions.replace('문해력+2','문해력+1').replace('문해력 +2','문해력 +1');
 if(instructions===I.instructions||/문해력\s*\+2/.test(instructions))throw Error('Literacy prompt policy mismatch');
 const scorer={version:'insight-v1.2-scorer-2-literacy1',scoreProblem:(routes,literacy)=>C.scoreProblem(routes,literacy,1)};
 return {id,instructions,promptHash:I.hash(instructions),scorerVersion:scorer.version,evaluate:value=>S.evaluate(value,scorer)};
}
module.exports={get,literacyOneId};
