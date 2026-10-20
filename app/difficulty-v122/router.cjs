'use strict';
const V=require('./validate.cjs'),C=require('./canonical.cjs');
function next(stage,result,{smoke=false}={}){
 const n=V.nextStage(stage,result);
 return smoke&&n===3?null:n;
}
function circuit(){
 const seen=new Map();let stopped=false;
 return {observe(question,result){
  if(result.systemicFailure)stopped=true;
  if(!result.validation?.valid&&result.validation?.reason==='difficulty_structure_invalid'){
   const key=C.hash({reason:result.validation.reason,detail:result.validation.detail});
   const questions=seen.get(key)||new Set();questions.add(question);seen.set(key,questions);
   if(questions.size>=2)stopped=true;
  }
  return stopped;
 },get stopped(){return stopped;}};
}
module.exports={next,circuit};
