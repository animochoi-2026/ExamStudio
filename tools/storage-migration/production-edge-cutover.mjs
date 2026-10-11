// Conditional production deployment. Full durable verification and actual freeze required.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {unseal} from './core.mjs';
import {assertFrozen} from './references.mjs';
const project='bjxxqdbftefughjkcrqj',job=process.env.MIGRATION_JOB;
const token=process.env.SUPABASE_DEPLOY_TOKEN_REPLACEMENT,digest=v=>createHash('sha256').update(v).digest('hex');
async function api(route,options={}){const r=await fetch(`https://api.supabase.com/v1/projects/${project}${route}`,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('PRODUCTION_API_'+r.status);const text=await r.text();return text?JSON.parse(text):null;}
try{
 if(job!=='cutover-20261011-b'||!token)throw Error('REVIEWED_JOB_REQUIRED');
 // This reviewed job finished successfully, then Supabase writes resumed.
 // Its historical verification must never authorize a later cutover.
 if(job==='cutover-20261011-a')throw Error('RETIRED_JOB_AFTER_SOURCE_RESUME');
 const state=unseal(fs.readFileSync(path.join('tools/storage-migration/.private',job,'state.enc')),process.env.MIGRATION_STATE_KEY);
 if(!state.complete||!state.verified||state.failures?.length)throw Error('FULL_VERIFICATION_REQUIRED');
 await assertFrozen({url:`https://${project}.supabase.co`,key:process.env.SUPABASE_READ_KEY,provider:'supabase'});
 const before={functions:await api('/functions'),secrets:await api('/secrets')};
 const desired={BANK_STORAGE_PROVIDER:'r2',BANK_FILE_ORIGINS:'https://examstudio-shared-bank.pages.dev,http://localhost:4173,http://127.0.0.1:4173',R2_ENDPOINT:'https://7b3f670b94ea81a6649c3529b108ee8b.r2.cloudflarestorage.com',R2_BUCKET:'examstudio-files-prep',R2_ACCESS_KEY_ID:process.env.R2_RUNTIME_ACCESS_KEY_ID,R2_SECRET_ACCESS_KEY:process.env.R2_RUNTIME_SECRET_ACCESS_KEY};
 if(Object.values(desired).some(v=>!v))throw Error('RUNTIME_CONFIGURATION_MISSING');
 const additions=[];for(const[name,value]of Object.entries(desired)){const existing=before.secrets.find(s=>s.name===name);if(existing&&existing.value!==digest(value))throw Error('EXISTING_PRODUCTION_SECRET_CONFLICT');if(!existing)additions.push({name,value});}
 const reportPath='tests/artifacts/r2-freeze/production-edge-cutover-b.json';
 fs.writeFileSync(reportPath,JSON.stringify({phase:'before',at:new Date().toISOString(),job,before,addedSecretNames:additions.map(x=>x.name)},null,2),{flag:'wx'});
 if(additions.length)await api('/secrets',{method:'POST',body:JSON.stringify(additions)});
 const after=await api('/secrets');if(Object.entries(desired).some(([name,value])=>after.find(s=>s.name===name)?.value!==digest(value)))throw Error('PRODUCTION_SECRET_READBACK_FAILED');
 const functions=['bank-storage','bank-verify','bank-delete-question','bank-image-transition'];
 const work='/mnt/'+process.cwd()[0].toLowerCase()+process.cwd().slice(2).replaceAll('\\','/');
 const child=spawn('wsl',['-d','podman-lossless-trial-20261007','-u','root','--','/tmp/examstudio-r2-cli/supabase','functions','deploy',...functions,'--project-ref',project,'--workdir',work,'--use-api','--no-verify-jwt'],{env:{...process.env,SUPABASE_ACCESS_TOKEN:token,WSLENV:'SUPABASE_ACCESS_TOKEN'},windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.resume();child.stderr.resume();const exit=await new Promise((ok,bad)=>{child.on('error',bad);child.on('close',ok);});if(exit!==0)throw Error('PRODUCTION_DEPLOY_FAILED');
 const deployed=await api('/functions');if(functions.some(name=>!deployed.some(f=>f.slug===name&&f.status==='ACTIVE'&&f.verify_jwt===false)))throw Error('PRODUCTION_DEPLOY_READBACK_FAILED');
 const result={at:new Date().toISOString(),job,phase:'deployed',before,addedSecretNames:additions.map(x=>x.name),runtimeKeyUsed:true,functions:deployed.filter(f=>functions.includes(f.slug)).map(({slug,version,status,verify_jwt})=>({slug,version,status,verify_jwt}))};
 fs.writeFileSync(reportPath,JSON.stringify(result,null,2));console.log(JSON.stringify({phase:result.phase,functions:result.functions,runtimeKeyUsed:true}));
}catch(e){console.error(JSON.stringify({error:/^[A-Z_0-9]+$/.test(e.message)?e.message:'PRODUCTION_DEPLOY_FAILED'}));process.exitCode=1;}
