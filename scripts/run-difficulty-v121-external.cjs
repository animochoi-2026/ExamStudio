'use strict';
const fs=require('node:fs'),path=require('node:path');
const I=require('../app/difficulty-v12/input.cjs'),P=require('../app/difficulty-v121/profile.cjs'),Policy=require('../app/difficulty-v121/policy.cjs'),Run=require('../app/difficulty-v121/run.cjs'),Sub=require('../app/difficulty-v12/subscription.cjs');
const root=path.resolve('artifacts/difficulty-v121/external'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
for(const stream of [process.stdout,process.stderr])stream.on('error',()=>{});
function log(v){const line=JSON.stringify({at:new Date().toISOString(),...v})+'\n';fs.appendFileSync(path.join(root,'progress.jsonl'),line);process.stdout.write(line);}
(async()=>{let lock;try{
 const approval=JSON.parse(fs.readFileSync(path.join(root,'../execution-approval.json'))),manifest=read('manifest.json');
 if(approval.granted!==true||approval.externalMaximumCalls!==24||approval.promptHash!==P.promptHash||approval.schemaHash!==P.schemaHash||approval.profileVersion!==P.version||I.hash(approval.stages)!==I.hash(Policy.stages)||approval.automaticRetries!==0||manifest.hash!==I.hash(manifest.entries)||manifest.profileVersion!==P.version||manifest.entries.length!==8)throw Error('External approval/input mismatch');
 lock=fs.openSync(path.join(root,'runner.lock'),'wx');fs.writeFileSync(lock,JSON.stringify({pid:process.pid}));
 for(const name of ['calls','results'])fs.mkdirSync(path.join(root,name),{recursive:true});
 const executable=require('../app/codex.cjs').findCodex();Sub.assertSubscription(executable);
 for(const item of manifest.entries){
  const e=read('entries/'+item.id+'.json');if(item.identity!==P.inputIdentity(e))throw Error('External source changed');
  const resultFile=path.join(root,'results',item.id+'.json');if(fs.existsSync(resultFile))continue;
  const result=await Run.evaluateEntry(e,{runStage:async(entry,n,stage)=>{
   const selected=Sub.profile(P.id,stage.id),key=I.hash({inputVersion:e.input.inputVersion,evaluationVersion:selected.evaluationVersion,identity:P.inputIdentity(e)});
   if(!fs.existsSync(path.join(root,'calls',key,'result.json'))&&fs.readdirSync(path.join(root,'calls')).length>=24)throw Error('External call limit');
   log({id:item.id,stage:n,model:stage.model,effort:stage.effort,phase:'started'});
   return Sub.runOne(entry,{executable,outputRoot:path.join(root,'calls'),scoringProfile:P.id,executionProfile:stage.id});
  },saveStage:async(entry,n,r)=>log({id:item.id,stage:n,status:r.status,reason:r.validation?.reason||r.computed?.reason})});
  fs.writeFileSync(resultFile,JSON.stringify({...result,profile_version:P.version,input_identity:P.inputIdentity(e)}),{flag:'wx'});
  log({id:item.id,phase:'saved',status:result.final_status,score:result.final_score,tier:result.final_tier});
 }
 log({phase:'complete',modelCalls:fs.readdirSync(path.join(root,'calls')).length});
}catch(e){log({phase:'blocked',reason:String(e.message).replace(/https?:\/\/\S+/g,'[URL]')});process.exitCode=1;}finally{if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(path.join(root,'runner.lock'));}}})();
