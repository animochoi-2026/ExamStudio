'use strict';
// Run only after separately reviewed SQL proposal installation, through the
// existing desktop owner's login. Default mode is read-only dry-run.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{app,safeStorage}=require('electron');
const root=path.resolve(__dirname,'..'),data=path.join(root,'dist/ExamStudio-win32-x64/data'),out=path.join(root,'tmp/approved-history-cleanup-20261003/implementation');
const args=process.argv.slice(2),mode=args.includes('--execute')?'execute':'plan';
app.setPath('userData',path.join(data,'desktop'));app.setPath('sessionData',path.join(data,'desktop/session'));app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 try{
  const {SharedBankAuth}=require('../app/shared-bank-auth.cjs'),{SharedBankStorage}=require('../app/shared-bank-storage.cjs'),P=require('../app/revision-payload-prune.cjs');
  const auth=new SharedBankAuth({directory:path.join(data,'shared-bank-auth'),safeStorage,openExternal:async()=>{throw Error('Existing owner login required; no new login performed');}}),storage=new SharedBankStorage({auth});
  const manifest=P.approvedEnvelope(path.join(root,'tmp/approved-history-cleanup-20261003/approved-manifest.json'),'a3af55dfa6044574a3e6e9df26efd420b91aac8891927ad8982aaecfb82f4955');
  fs.mkdirSync(out,{recursive:true});const planFile=path.join(out,'operator-plan.json'),checkpoint=path.join(out,'operator-checkpoint.json');
  const write=(file,value)=>{const temp=file+'.pending';fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,file);};
  if(mode==='plan'){
   if(fs.existsSync(checkpoint)&&JSON.parse(fs.readFileSync(checkpoint)).phase!=='complete'){
    const old=JSON.parse(fs.readFileSync(checkpoint));
    const status=await storage.rpc('bank_revision_prune_status',{s:manifest.spaceId,j:old.jobId});
    if(status.exists)throw Error('Pending claimed job exists; resume it, do not replace the plan');
    // A refused CAS/permission claim may have created no job. Only fresh
    // authoritative owner status can permit a replacement dry-run.
    fs.renameSync(checkpoint,checkpoint+'.unclaimed-'+Date.now());
   }
   const plan=await P.dryRun(storage,manifest);write(planFile,{at:new Date().toISOString(),jobId:crypto.randomUUID(),manifestHash:manifest.approvalHash,plan});
   console.log(JSON.stringify({readOnly:true,files:plan.files.length,bytes:plan.bytes,revisions:plan.revisions.length,excluded:plan.excluded,planFile,executed:false}));
  }else{
   if(!args.includes('--use-reviewed-plan'))throw Error('Explicit --execute --use-reviewed-plan required');
   const saved=JSON.parse(fs.readFileSync(planFile));if(saved.manifestHash!==manifest.approvalHash)throw Error('Approved manifest changed');
   if(fs.existsSync(checkpoint)){const old=JSON.parse(fs.readFileSync(checkpoint));if(old.jobId!==saved.jobId||old.expectedToken!==saved.plan.token)throw Error('Checkpoint identity changed');}
   const result=await P.execute(storage,{manifest,jobId:saved.jobId,expectedToken:saved.plan.token,saveCheckpoint:async value=>write(checkpoint,value)});
   console.log(JSON.stringify({jobId:saved.jobId,...result}));
  }
 }catch(e){console.error(JSON.stringify({complete:false,mode,error:e.message}));process.exitCode=1;}finally{app.quit();}
});
