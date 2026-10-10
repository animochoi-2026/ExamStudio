// Artificial data only, hard-coded isolated hosted project. Never production.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fixtures} from './synthetic.mjs';
import {AwsClient} from './node_modules/aws4fetch/dist/aws4fetch.esm.mjs';
const require=createRequire(import.meta.url),{SharedBankStorage}=require('../../app/shared-bank-storage.cjs');
const api='https://vljeuedwutkihqqtyrpb.supabase.co';
const config=JSON.parse(fs.readFileSync('tests/artifacts/r2-freeze/staging-public-config.json','utf8'));
assert.equal(config.url,api);
const service=process.env.SUPABASE_STAGING_KEY,anon=config.publishableKey;
assert.ok(service&&anon,'STAGING_CREDENTIAL_REQUIRED');
const signer=new AwsClient({accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto'});
const base='https://7b3f670b94ea81a6649c3529b108ee8b.r2.cloudflarestorage.com/examstudio-files-prep/';
const directory=path.resolve('tests/artifacts/r2-freeze/hosted-'+randomUUID());fs.mkdirSync(directory,{recursive:true});
const report={project:'vljeuedwutkihqqtyrpb',at:new Date().toISOString(),checks:[],hostedEdge:true,googleGUI:false,electronGUI:false,productionChanged:false};
let stage='credentials';const created=[];
async function request(route,{method='GET',body,token=service}={}){
 const r=await fetch(api+route,{method,headers:{apikey:token===service?service:anon,Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok)throw Object.assign(Error('HOSTED_HTTP_'+r.status),{status:r.status});
 const text=await r.text();return text?JSON.parse(text):null;
}
const sha=b=>createHash('sha256').update(b).digest('hex');
try{
 stage='real hosted Auth';const accounts=[],password=randomBytes(32).toString('base64url');
 for(const role of ['owner','other']){
  const email=`r2-${role}-${randomUUID()}@example.test`;
  const user=await request('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true}});
  const login=await request('/auth/v1/token?grant_type=password',{method:'POST',token:anon,body:{email,password}});
  accounts.push({email,id:user.id,token:login.access_token});
 }
 const [owner,other]=accounts,space=randomUUID(),id=randomUUID(),object=`${space}/${id}/000`;
 report.artificialSpace=space;report.artificialUsers=accounts.map(a=>a.id);
 stage='artificial staging rows';
 await request('/rest/v1/bank_spaces',{method:'POST',body:{id:space,name:'R2 hosted artificial integration'}});
 await request('/rest/v1/bank_entries',{method:'POST',body:{id:space,space_id:space,name:'test',kind:'folder'}});
 await request('/rest/v1/bank_members',{method:'POST',body:accounts.map(a=>({space_id:space,email:a.email,user_id:a.id,role:a===owner?'owner':'teacher'}))});
 const auth=a=>({config:()=>({...config,spaceId:space,storageGateway:true}),token:async()=>a.token,request:(route,options={})=>request(route,{...options,token:options.token||a.token})});
 const a=auth(owner),b=auth(other),storage=new SharedBankStorage({auth:a});
 const fixture=fixtures('hosted-auth')[0],file=path.join(directory,'tiny.pdf');fs.writeFileSync(file,fixture.body);
 assert.equal((await fetch(await signer.sign(base+object,{method:'HEAD'}))).status,404);
 // Persist exact cleanup candidate before upload; UUID key proven absent above.
 created.push(object);fs.writeFileSync(path.join(directory,'created-keys.json'),JSON.stringify(created));
 stage='hosted upload and verify';
 const meta=await storage.put({file,id,name:'tiny.pdf',parent:space,properties:{role:'source',rootId:space,sourceKey:sha(fixture.body)}});
 assert.equal(meta.verified,true);report.checks.push('real hosted password Auth','Edge upload + bank-verify + registration');
 assert.deepEqual(await storage.download(id),fixture.body);report.checks.push('desktop module restore/download SHA256');
 stage='file ACL';
 await assert.rejects(b.request('/functions/v1/bank-storage',{method:'POST',body:{operation:'read',key:object}}),e=>e.status===403);
 await assert.rejects(request('/functions/v1/bank-storage',{method:'POST',token:anon,body:{operation:'read',key:object}}),e=>e.status===401||e.status===403);
 report.checks.push('other authenticated teacher denied','anonymous denied');
 const access=()=>a.request('/functions/v1/bank-storage',{method:'POST',body:{operation:'read',key:object}});
 const first=await access();assert.equal(first.expiresIn,60);assert.equal((await fetch(first.url)).status,200);
 const origin='https://r2-staging.examstudio-shared-bank.pages.dev';
 const cors=await fetch(first.url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'Range'}});
 assert.equal(cors.headers.get('access-control-allow-origin'),origin);assert.ok(cors.ok);report.checks.push('R2 hosted origin GET/Range preflight');
 const {downloadChunk}=await import('../../web-bank/file-storage.js');
 const client={functions:{invoke:async(_,{body})=>({data:await a.request('/functions/v1/bank-storage',{method:'POST',body})})}};
 const web=await downloadChunk(client,{storageGateway:true},object);assert.ok(!web.error);assert.deepEqual(Buffer.from(await web.data.arrayBuffer()),fixture.body);report.checks.push('web module hosted download SHA256');
 stage='expiry';console.log(JSON.stringify({stage:'Waiting for actual 60 second URL expiry',passed:report.checks}));
 await new Promise(r=>setTimeout(r,62000));assert.equal((await fetch(first.url)).status,403);assert.equal((await fetch((await access()).url)).status,200);report.checks.push('expired URL denied and reauthorized URL succeeds');
 stage='revoked authorization';
 await request('/rest/v1/bank_members?space_id=eq.'+space+'&user_id=eq.'+owner.id,{method:'PATCH',body:{enabled:false}});
 await assert.rejects(access(),e=>e.status===403);report.checks.push('revoked membership blocks URL reissue');report.success=true;
}catch(e){report.success=false;report.failureStage=stage;report.error=e.status?'HTTP_'+e.status:e.code||e.name;process.exitCode=1;}
finally{
 let absent=0;
 for(const key of created){const r=await fetch(await signer.sign(base+key,{method:'DELETE'}));if(r.ok&&(await fetch(await signer.sign(base+key,{method:'HEAD'}))).status===404)absent++;}
 report.cleanup={exactKeys:created.length,absent,complete:absent===created.length};
 if(absent!==created.length){report.success=false;process.exitCode=1;}
 fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
