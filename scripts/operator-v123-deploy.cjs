'use strict';
// No UI, AI provider, queue or scorer is loaded. Existing desktop auth only.
const fs=require('fs'),path=require('path'),{app,safeStorage}=require('electron'),assert=require('assert/strict');
const D=process.argv[2],mode=process.argv[3]||'import',read=f=>JSON.parse(fs.readFileSync(f));
const log=x=>fs.appendFileSync(D+'/operator-events.jsonl',JSON.stringify({at:new Date().toISOString(),mode,...x})+'\n');
app.setPath('userData','C:/Users/reals/Desktop/문제생성기/data/r2-current/desktop');
app.setPath('sessionData','C:/Users/reals/Desktop/문제생성기/data/r2-current/desktop/session');
app.whenReady().then(async()=>{
 try{
  const directory='C:/Users/reals/Desktop/문제생성기/data/r2-current/shared-bank-auth';
  const auth=new(require('../app/shared-bank-auth.cjs').SharedBankAuth)({directory,safeStorage}),storage=new(require('../app/shared-bank-storage.cjs').SharedBankStorage)({auth});
  const spaceId=auth.config().spaceId;assert.equal(spaceId,'57fcd460-b526-487f-9075-5503e4d07145');
  if(mode==='import'){
   const input=read(D+'/activation-input.json'),plan=read(D+'/import-plan.json');let count=0;
   for(let i=0;i<input.rows.length;i+=10){
    const items=input.rows.slice(i,i+10),r=await storage.rpc('bank_v123_frozen_import',{s:spaceId,b:plan.batch_id,items});
    assert.equal(r.staged,items.length);assert.equal(r.live_scores_changed,false);count+=items.length;log({staged:count,total:1266});
   }
   fs.writeFileSync(D+'/import-complete.json',JSON.stringify({count,live_scores_changed:false,ai_calls:0}),{flag:'wx'});
  }else if(mode==='policy'){
   const p=await storage.rpc('bank_v123_policy',{s:spaceId});assert.equal(p.evaluation_manifest_hash,require('../app/difficulty-v123/deployment.cjs').manifest_hash);
   fs.writeFileSync(D+'/api-policy-readback.json',JSON.stringify(p),{flag:'wx'});
  }else if(mode==='edge'){
   const body={action:'policy',spaceId,model_policy_version:require('../app/difficulty-v122/policy.cjs').model_policy_version};
   const p=await auth.request('/functions/v1/bank-difficulty-v12',{method:'POST',body,token:await auth.token()});
   assert.equal(p.policy.evaluation_manifest_hash,require('../app/difficulty-v123/deployment.cjs').manifest_hash);
   assert.equal(p.policy.application_output_cap,'none');
   fs.writeFileSync(D+'/edge-policy-readback.json',JSON.stringify(p),{flag:'wx'});
  }else throw Error('Unknown mode');
  log({status:'complete'});
 }catch(e){log({status:'failed',error:String(e.message).replace(/https?:\/\/\S+/g,'[URL]')});process.exitCode=1;}
 finally{app.exit(process.exitCode||0);}
});

