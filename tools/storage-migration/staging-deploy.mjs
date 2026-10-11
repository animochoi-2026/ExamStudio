// Hard-coded empty staging project only. Never accepts a production target.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const project='vljeuedwutkihqqtyrpb',token=process.env.SUPABASE_DEPLOY_TOKEN_REPLACEMENT;
const directory=path.resolve('tests/artifacts/r2-freeze');
const digest=v=>createHash('sha256').update(v).digest('hex');
async function api(route,options={}){
 const r=await fetch(`https://api.supabase.com/v1/projects/${project}${route}`,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(120000)});
 if(!r.ok)throw Error('STAGING_API_'+r.status);
 const text=await r.text();return text?JSON.parse(text):null;
}
try{
 if(!token)throw Error('DEPLOY_TOKEN_REQUIRED');
 const desired={BANK_STORAGE_PROVIDER:'r2',BANK_FILE_ORIGINS:'https://r2-staging.examstudio-shared-bank.pages.dev,http://localhost:4173,http://127.0.0.1:4173',R2_ENDPOINT:'https://7b3f670b94ea81a6649c3529b108ee8b.r2.cloudflarestorage.com',R2_BUCKET:'examstudio-files-prep',R2_ACCESS_KEY_ID:process.env.R2_ACCESS_KEY_ID,R2_SECRET_ACCESS_KEY:process.env.R2_SECRET_ACCESS_KEY};
 if(Object.values(desired).some(x=>!x))throw Error('STAGING_CONFIG_MISSING');
 const before=await api('/secrets'),newValues=[];
 for(const [name,value] of Object.entries(desired)){
  const existing=before.find(x=>x.name===name);
  if(existing&&existing.value!==digest(value))throw Error('EXISTING_STAGING_SECRET_PRESERVED_'+name);
  if(!existing)newValues.push({name,value});
 }
 if(newValues.length)await api('/secrets',{method:'POST',body:JSON.stringify(newValues)});
 const after=await api('/secrets');
 if(Object.entries(desired).some(([name,value])=>after.find(x=>x.name===name)?.value!==digest(value)))throw Error('STAGING_SECRET_READBACK_MISMATCH');
 const functions=['bank-storage','bank-verify','bank-delete-question','bank-image-transition'];
 const work='/mnt/'+process.cwd()[0].toLowerCase()+process.cwd().slice(2).replaceAll('\\','/');
 const env={...process.env,SUPABASE_ACCESS_TOKEN:token,WSLENV:'SUPABASE_ACCESS_TOKEN'};
 const child=spawn('wsl',['-d','podman-lossless-trial-20261007','-u','root','--','/tmp/examstudio-r2-cli/supabase','functions','deploy',...functions,'--project-ref',project,'--workdir',work,'--use-api'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const exit=await new Promise((ok,bad)=>{child.on('error',bad);child.on('close',ok);});
 if(exit!==0)throw Error('STAGING_DEPLOY_FAILED_'+exit);
 const deployed=await api('/functions');
 if(functions.some(name=>!deployed.some(f=>f.slug===name&&f.status==='ACTIVE')))throw Error('STAGING_DEPLOY_READBACK_FAILED');
 const report={project,at:new Date().toISOString(),secretNames:Object.keys(desired),secretReadback:true,functions:deployed.filter(f=>functions.includes(f.slug)).map(({slug,version,status,verify_jwt})=>({slug,version,status,verify_jwt})),productionChanged:false};
 fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'staging-deployment.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){console.error(String(e.message).match(/^(STAGING|DEPLOY_TOKEN|EXISTING_STAGING)[A-Z_0-9]+$/)?.[0]||'STAGING_SETUP_FAILED');process.exitCode=1;}
