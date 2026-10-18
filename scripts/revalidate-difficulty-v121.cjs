'use strict';
// Local-only recovery after a validator defect. Never invokes a model or writes
// production data. Original intents/results remain immutable audit evidence.
const fs=require('node:fs'),path=require('node:path');
const I=require('../app/difficulty-v12/input.cjs'),P=require('../app/difficulty-v121/profile.cjs'),V=require('../app/difficulty-v121/schema.cjs');
const Sub=require('../app/difficulty-v12/subscription.cjs'),Run=require('../app/difficulty-v121/run.cjs'),Policy=require('../app/difficulty-v121/policy.cjs');
const root=path.resolve(process.argv[2]||'artifacts/difficulty-v121');
const repairReason='Equivalent curriculum labels with learned prerequisites, explicit choice sets/values, LaTeX math notation, sentence punctuation, numbered subanswers and identical explicit triangle conclusions with matching criteria; unchanged prompt, schema, scorer, models, targets and call limits.';
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),write=(f,v)=>fs.writeFileSync(path.join(root,f),JSON.stringify(v,null,2),{flag:'wx'});
if(fs.existsSync(path.join(root,'runner.lock')))throw Error('Stop at the next item boundary before local revalidation');
const priorApproval=read('execution-approval.json');
if(priorApproval.promptHash!==P.promptHash||priorApproval.schemaHash!==P.schemaHash||priorApproval.profileVersion===P.version)throw Error('Expected unchanged approved prompt/schema and changed local validator');
const archive='validation-history';fs.mkdirSync(path.join(root,archive),{recursive:true});
write(archive+'/approval-'+priorApproval.profileVersion+'.json',priorApproval);
const grouped=new Map();
for(const folder of fs.readdirSync(path.join(root,'calls'))){
 const file='calls/'+folder+'/result.json';if(!fs.existsSync(path.join(root,file)))throw Error('Unknown call outcome retained; do not replay');
 const old=read(file);if(old.revalidatedFrom)continue;
 if(old.scoringProfile!==P.id||old.promptHash!==P.promptHash)throw Error('Cannot reuse different prompt result');
 const entry=read('entries/'+old.id+'.json');if(entry.input.inputVersion!==old.inputVersion)throw Error('Input changed');
 const selected=Sub.profile(P.id,old.executionProfile),key=I.hash({inputVersion:entry.input.inputVersion,evaluationVersion:selected.evaluationVersion,identity:P.inputIdentity(entry)});
 // Unknown outcomes occupy the new cache too, preventing a duplicate call. They
 // can only be bypassed when an earlier confirmed stage is now independently valid.
 const evaluated=old.evidence?.completed&&old.raw?V.evaluate(old.raw,entry.validationContext):{raw:old.raw,validation:{valid:false,solution_validated:false,reason:'subscription_outcome_unconfirmed'},computed:old.computed};
 const revalidated={...old,...evaluated,key,evaluationVersion:selected.evaluationVersion,revalidatedFrom:folder,revalidatedAt:new Date().toISOString(),status:evaluated.validation.valid?'complete':'failed'};
 fs.mkdirSync(path.join(root,'calls',key));write('calls/'+key+'/intent.json',{...read('calls/'+folder+'/intent.json'),key,evaluationVersion:selected.evaluationVersion,revalidatedFrom:folder});write('calls/'+key+'/result.json',revalidated);
 if(!grouped.has(old.id))grouped.set(old.id,[]);grouped.get(old.id).push(revalidated);
}
for(const [id,stages]of grouped){
 stages.sort((a,b)=>Policy.stages.findIndex(s=>s.id===a.executionProfile)-Policy.stages.findIndex(s=>s.id===b.executionProfile));
 const selected=[];for(const stage of stages){selected.push(stage);if(!Policy.decide(selected.length,stage).next)break;}
 const e=read('entries/'+id+'.json'),file='results/'+id+'.json';if(fs.existsSync(path.join(root,file)))fs.renameSync(path.join(root,file),path.join(root,archive,id+'-'+priorApproval.profileVersion+'.json'));
 if(selected.every(s=>s.evidence?.completed)&&!Policy.decide(selected.length,selected.at(-1)).next)write(file,{...Run.finalRecord(e,selected),evaluation_run_id:read('job.json').id,profile_version:P.version,input_identity:P.inputIdentity(e),completed_at:new Date().toISOString(),validation_repair:{reason:repairReason,originalProfile:priorApproval.profileVersion,preservedCalls:stages.map(s=>s.revalidatedFrom)}});
}
const approval={...priorApproval,profileVersion:P.version,preparedProfileVersions:[...(priorApproval.preparedProfileVersions||[]),priorApproval.profileVersion],validationRepair:{at:new Date().toISOString(),reason:repairReason}};
fs.writeFileSync(path.join(root,'execution-approval.json'),JSON.stringify(approval,null,2));
console.log(JSON.stringify({revalidatedItems:grouped.size,modelCalls:0,profileVersion:P.version}));
