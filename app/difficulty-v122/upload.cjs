'use strict';
const fs=require('node:fs'),path=require('node:path'),Adapter=require('./adapters.cjs'),C=require('./canonical.cjs'),Policy=require('./policy.cjs');
async function capture({bank,store,projectId,questionId}){
 const project=store.get(projectId),p=project.problems.find(p=>[p.original,...p.variants||[]].some(q=>q?.id===questionId));
 const q=[p?.original,...p?.variants||[]].find(q=>q?.id===questionId);
 if(!q)throw Error('평가 대상 문항이 없습니다.');
 const prepared=await require('../difficulty-v12/upload.cjs').prepared(q,p,project.scope),item=bank.ensure(project,p,q);
 const confirmed=require('../bank-analysis.cjs').solutionState(q,p,project.scope).final;
 return Adapter.fromConfirmed({questionId:item.id,revisionId:item.baseRevisionId||'local:'+prepared.contentHash,
  question:{...q,solution:require('../solution-display.js').solutionText(q)},scope:project.scope,images:prepared.images,confirmation:confirmed});
}
async function evaluate(options){
 const source=await capture(options),runtime=options.difficultyRuntime||require('./runtime.cjs').createRuntime(options.bank.dir);
 // An older installed runtime must never silently evaluate with another policy.
 if(!runtime||runtime.policyVersion!==Policy.model_policy_version)return {status:'evaluation_pending',reason:'difficulty_policy_upgrade_required',reused:false};
 if(runtime.outputPolicyVersion!==require('../difficulty-output-policy.cjs').version)return {status:'evaluation_pending',reason:'difficulty_output_policy_upgrade_required',reused:false};
 const result=await Adapter.desktop(source,{...runtime,savedOnly:!!options.savedOnly,
  readCurrent:async()=>require('./input.cjs').prepare(await capture(options))});
 // RC writes only a separate local staging record; no bank metadata mutation.
 if(result.result){
  const dir=path.join(options.bank.dir,'difficulty-v122','staging');fs.mkdirSync(dir,{recursive:true});
  const f=path.join(dir,result.result.evaluation_key+'.json');
  if(!fs.existsSync(f))fs.writeFileSync(f,C.json(result.result)+'\n',{flag:'wx'});
 }
 return result;
}
async function afterAnalysis(options){
 const out={analyzed:0,reused:0,errors:[],waiting:false};
 for(const questionId of options.questionIds){
  try{
   const result=await evaluate({...options,questionId});
   if(result.status==='evaluation_pending'){out.waiting=true;out.errors.push({questionId,code:result.reason});break;}
   out[result.reused?'reused':'analyzed']++;
  }catch(e){out.errors.push({questionId,code:e.code||'difficulty_v122',message:e.message});}
 }
 return out;
}
async function savedResult(options){
 const source=await capture(options),runtime=options.difficultyRuntime||require('./runtime.cjs').createRuntime(options.bank.dir);
 const result=await Adapter.desktop(source,{...runtime,savedOnly:true});
 return result.reused?result.result:null;
}
module.exports={capture,evaluate,afterAnalysis,savedResult};
