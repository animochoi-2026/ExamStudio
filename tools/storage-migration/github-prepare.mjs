// Uses Git Credential Manager's official protocol; credentials never reach logs.
import {spawnSync} from 'node:child_process';
import sodium from 'libsodium-wrappers';
const root='/repos/animochoi-2026/ExamStudio',envName='storage-migration',envPath=`${root}/environments/${envName}`;
async function main(){
 const result=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'},windowsHide:true});
 if(result.status!==0)throw Error('GITHUB_AUTH_UNAVAILABLE');
 const credential=Object.fromEntries(result.stdout.trim().split('\n').map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
 async function api(path,method='GET',body,optional=false){
   const r=await fetch('https://api.github.com'+path,{method,headers:{Authorization:'Bearer '+credential.password,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{})});
   if(optional&&r.status===404)return null;if(!r.ok)throw Error('GITHUB_API_FAILED');return r.status===204?{}:r.json();
 }
 const repo=await api(root);if(!repo.permissions?.admin||repo.default_branch!=='main')throw Error('REPOSITORY_SCOPE_MISMATCH');
 const reviewer=repo.owner.id;
 let environment=await api(envPath,'GET',undefined,true);
 if(!environment){
   environment=await api(envPath,'PUT',{wait_timer:0,prevent_self_review:false,can_admins_bypass:false,reviewers:[{type:'User',id:reviewer}],deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}});
   await api(envPath+'/deployment-branch-policies','POST',{name:'main',type:'branch'});
 }
 environment=await api(envPath);
 const policy=environment.deployment_branch_policy;
 const approval=environment.protection_rules?.find(r=>r.type==='required_reviewers');
 const branches=(await api(envPath+'/deployment-branch-policies')).branch_policies;
 if(!policy?.custom_branch_policies||policy.protected_branches||!approval?.reviewers?.some(r=>r.reviewer?.id===reviewer)||branches?.length!==1||branches[0].name!=='main'||branches[0].type!=='branch')throw Error('EXISTING_ENVIRONMENT_REVIEW_REQUIRED');
 await sodium.ready;
 const pub=await api(envPath+'/secrets/public-key'),added=[],preserved=[];
 for(const name of ['MIGRATION_STATE_KEY','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','SUPABASE_READ_KEY','SOURCE_S3_ACCESS_KEY_ID','SOURCE_S3_SECRET_ACCESS_KEY']){
   if(!process.env[name])continue;
   if(await api(envPath+'/secrets/'+name,'GET',undefined,true)){preserved.push(name);continue;}
   const encrypted_value=sodium.to_base64(sodium.crypto_box_seal(sodium.from_string(process.env[name]),sodium.from_base64(pub.key,sodium.base64_variants.ORIGINAL)),sodium.base64_variants.ORIGINAL);
   await api(envPath+'/secrets/'+name,'PUT',{encrypted_value,key_id:pub.key_id});
   if(!(await api(envPath+'/secrets/'+name)))throw Error('SECRET_READBACK_FAILED');added.push(name);
 }
 const variables={SOURCE_MODE:process.env.SOURCE_MODE||'rest',SUPABASE_URL:'https://bjxxqdbftefughjkcrqj.supabase.co',R2_ENDPOINT:process.env.R2_ENDPOINT,R2_BUCKET:process.env.R2_BUCKET,SOURCE_S3_ENDPOINT:process.env.SOURCE_S3_ENDPOINT,SOURCE_S3_REGION:process.env.SOURCE_S3_REGION};
 for(const [name,value] of Object.entries(variables)){
   if(!value)continue;const old=await api(envPath+'/variables/'+name,'GET',undefined,true);
   if(old){if(old.value!==value)throw Error('EXISTING_VARIABLE_CONFLICT');continue;}
   await api(envPath+'/variables','POST',{name,value});if((await api(envPath+'/variables/'+name)).value!==value)throw Error('VARIABLE_READBACK_FAILED');
 }
 console.log(JSON.stringify({environment:envName,mainOnly:true,requiredReviewer:repo.owner.login,addedSecrets:added,preservedSecrets:preserved,variables:Object.keys(variables).filter(n=>variables[n]),productionChanged:false}));
}
main().catch(e=>{console.error(JSON.stringify({ok:false,code:/^[A-Z_]+$/.test(e.message)?e.message:'PREPARATION_FAILED'}));process.exitCode=1;});
