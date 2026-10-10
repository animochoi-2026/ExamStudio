// Read-only credential rotation verification. Never prints token values or responses.
import fs from 'node:fs';
const next=process.env.SUPABASE_DEPLOY_TOKEN_REPLACEMENT,old=process.env.SUPABASE_DEPLOY_TOKEN;
if(!next||!old||next===old)throw Error('DISTINCT_REPLACEMENT_REQUIRED');
const report={at:new Date().toISOString(),readOnly:true,projects:[]};
for(const project of ['bjxxqdbftefughjkcrqj','vljeuedwutkihqqtyrpb']){
 const status=async(token,route)=>{const r=await fetch(`https://api.supabase.com/v1/projects/${project}/${route}`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});await r.body?.cancel();return r.status;};
 report.projects.push({project,newFunctions:await status(next,'functions'),newSecrets:await status(next,'secrets'),revokedFunctions:await status(old,'functions')});
}
report.success=report.projects.every(x=>x.newFunctions===200&&x.newSecrets===200&&[401,403].includes(x.revokedFunctions));
fs.writeFileSync('tests/artifacts/r2-freeze/deployment-token-rotation-check.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));if(!report.success)process.exitCode=1;
