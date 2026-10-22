'use strict';
const V=require('./validate.cjs'),Codec=require('./explicit.cjs'),B=require('./response-contract.cjs');
function evaluateResponse(raw,context,binding,requestId){
 try{B.verify(binding,context,requestId);const normalized=Codec.decode(raw,context);return {...V.evaluate(normalized,context),system_fields:binding,system_evidence_relations:{raw:normalized,manifest_hash:context.evidence_relations.evidence_manifest_hash},contract_profile:'explicit-relations'};}
 catch(e){return {validation:{valid:false,reason:'difficulty_structure_invalid',detail:e.message},computed:{status:'failed',score:null,problem_tier:null,reason:'difficulty_structure_invalid',detail:e.message}};}
}
module.exports={evaluateResponse};
