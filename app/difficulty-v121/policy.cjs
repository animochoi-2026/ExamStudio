'use strict';
const policy=Object.freeze({version:'difficulty-three-stage-v1.2.1-1',specVersion:'1.2',specRevision:'1.2.1',minimumConfidence:.7,strictCalibration:false,automaticRetries:0,maximumStages:3});
const stages=Object.freeze([
 Object.freeze({id:'luna-medium',model:'gpt-6-luna',effort:'medium'}),
 Object.freeze({id:'sol-medium',model:'gpt-6.1-sol',effort:'medium'}),
 Object.freeze({id:'sol-high',model:'gpt-6.1-sol',effort:'high'})]);
function decide(stage,result){
 if(!Number.isInteger(stage)||stage<1||stage>3)throw Error('invalid stage');
 const c=result?.computed,valid=result?.validation?.valid===true&&result.validation.solution_validated===true&&c?.status==='complete'&&/^T[0-5]$/.test(c.problem_tier)&&Number.isFinite(c.score);
 if(!valid)return {next:stage<3?stage+1:null,status:stage<3?'pending':'failed',reason:result?.validation?.reason||c?.reason||'invalid_result'};
 if(stage===1&&Number(c.problem_tier.slice(1))>=3)return {next:2,status:'pending',reason:'luna_T3_or_higher'};
 return {next:null,status:'complete',reason:'validated'};
}
const priority=source=>{
 const semester=String(source?.semester||''),exam=String(source?.exam||'');
 if(!/^[12](학기)?$/.test(semester)||!['중간고사','기말고사'].includes(exam))throw Error('시험 순서 메타데이터 확인 필요');
 return (semester.startsWith('2')?0:2)+(exam==='기말고사'?0:1);
};
function ordered(entries){return [...entries].sort((a,b)=>priority(a.source)-priority(b.source)||String(a.source.documentId).localeCompare(String(b.source.documentId))||a.questionId.localeCompare(b.questionId));}
module.exports={policy,stages,decide,priority,ordered};
