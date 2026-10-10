// Real local GoTrue + PostgREST + PostgreSQL/RLS and R2. No production DB access.
// The exact gateway/verifier modules run in a local Node HTTP host, not hosted Edge.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {gateway} from '../../supabase/functions/_shared/file-gateway.mjs';
import {fileStore} from '../../supabase/functions/_shared/file-store-runtime.mjs';
import {fixtures} from './synthetic.mjs';
import {AwsClient} from './node_modules/aws4fetch/dist/aws4fetch.esm.mjs';
const require=createRequire(import.meta.url),{SharedBankStorage}=require('../../app/shared-bank-storage.cjs');
const machine='podman-lossless-trial-20261007',container='supabase_db_examstudio-r2-isolated';
const wsl=args=>execFileSync('wsl',['-d',machine,'-u','root','--',...args],{encoding:'utf8',stdio:['pipe','pipe','pipe']});
function sql(query){return execFileSync('wsl',['-d',machine,'-u','root','--','podman','exec','-i',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']});}
const report={kind:'real local Auth/PostgREST/RLS + R2; Node-hosted production handlers',checks:[],hostedEdge:false,electronGUI:false};
let stage='local status',server;const created=[];
const state=JSON.parse(wsl(['/tmp/examstudio-r2-cli/supabase','status','--workdir','/tmp/examstudio-r2-local','-o','json']));
const api=state.API_URL,anon=state.ANON_KEY,service=state.SERVICE_ROLE_KEY;
if(api!=='http://127.0.0.1:55321'||!anon||!service)throw Error('ISOLATED_STACK_REQUIRED');
const dir=path.resolve('tests/artifacts/r2/integration');fs.mkdirSync(dir,{recursive:true});
const space=randomUUID(),id=randomUUID(),object=`${space}/${id}/000`;
const envMap={...process.env,SUPABASE_URL:api,SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,BANK_STORAGE_PROVIDER:'r2',BANK_FILE_ORIGINS:'http://localhost:4173'};
const env=k=>envMap[k],signer=new AwsClient({accessKeyId:env('R2_ACCESS_KEY_ID'),secretAccessKey:env('R2_SECRET_ACCESS_KEY'),service:'s3',region:'auto'});
const target=key=>`${env('R2_ENDPOINT')}/${env('R2_BUCKET')}/${key}`;
try{
 stage='isolated schema';
 if(sql("select to_regclass('public.bank_entries') is null").trim()==='t'){
  const history='tests/fixtures/deployed-db-history';
  const migrations=[...fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')&&n<'20261004').map(n=>({name:n,file:'supabase/migrations/'+n})),...fs.readdirSync(history).filter(n=>n.endsWith('.sql')).map(n=>({name:n,file:history+'/'+n}))].sort((a,b)=>a.name.localeCompare(b.name));
  for(const m of migrations)sql(fs.readFileSync(m.file,'utf8'));
 }
 if(sql("select to_regnamespace('bank_storage_private') is null").trim()==='t')sql(fs.readFileSync('docs/r2/schema-proposal.sql','utf8'));
 sql("update bank_storage_private.settings set provider='r2',frozen=false");
 stage='real local Auth';
 const password=randomBytes(24).toString('base64url');const accounts=[];
 for(const role of ['owner','other','backup']){
  const email=`${role}-${randomUUID()}@example.test`;
  const r=await fetch(api+'/auth/v1/admin/users',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});assert.equal(r.status,200);
  const user=await r.json();
  const login=await fetch(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,200);const session=await login.json();accounts.push({email,id:user.id,token:session.access_token});
 }
 const [owner,other,backup]=accounts;
 sql(`insert into public.bank_spaces values('${space}','R2 artificial integration');insert into public.bank_entries(id,space_id,name,kind) values('${space}','${space}','test','folder');insert into public.bank_members(space_id,email,user_id,role) values('${space}','${owner.email}','${owner.id}','owner'),('${space}','${other.email}','${other.id}','teacher'),('${space}','${backup.email}','${backup.id}','owner');notify pgrst,'reload schema';`);
 const store=fileStore(fetch,env),put=store.put;store.put=async(key,bytes,jwt)=>{const r=await put(key,bytes,jwt);if(r.ok)created.push(key);return r;};const handler=gateway({env,store});let verifier;
 await require('../../tests/edge-verifier-fixture.cjs').loadVerifier({Deno:{env:{get:env},serve:fn=>verifier=fn},fetch});
 server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);let response;const headers=new Headers(req.headers);headers.delete('host');if(req.url==='/functions/v1/bank-storage'||req.url==='/functions/v1/bank-verify')response=await(req.url.endsWith('bank-storage')?handler:verifier)(new Request('http://localhost:4173'+req.url,{method:req.method,headers,body:body.length?body:undefined}));else response=await fetch(api+req.url,{method:req.method,headers,body:body.length?body:undefined});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('Local integration failure');}});
 await new Promise(r=>server.listen(4173,'127.0.0.1',r));
 const auth=account=>({config:()=>({url:'http://127.0.0.1:4173',spaceId:space,publishableKey:anon,storageGateway:true}),token:async()=>account.token,async request(route,{method='GET',body,token=account.token}={}){const r=await fetch('http://127.0.0.1:4173'+route,{method,headers:{apikey:anon,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const value=await r.json();if(!r.ok)throw Error('LOCAL_REQUEST_'+r.status);return value;}});
 const a=auth(owner),b=auth(other),storage=new SharedBankStorage({auth:a});
 stage='upload and real verification';
 const fixture=fixtures('actual-auth')[0],file=path.join(dir,'tiny.pdf');fs.writeFileSync(file,fixture.body);
 const before=await fetch(await signer.sign(target(object),{method:'HEAD'}));assert.equal(before.status,404);
 const meta=await storage.put({file,id,name:'tiny.pdf',parent:space,properties:{role:'source',rootId:space,sourceKey:createHash('sha256').update(fixture.body).digest('hex')}});assert.equal(meta.verified,true);report.checks.push('real password login','gateway upload','bank-verify + bank_finish registration');
 assert.deepEqual(await storage.download(id),fixture.body);report.checks.push('desktop storage restore/download SHA256');
 await assert.rejects(b.request('/functions/v1/bank-storage',{method:'POST',body:{operation:'read',key:object}}));report.checks.push('other authenticated member denied');
 const access=()=>a.request('/functions/v1/bank-storage',{method:'POST',body:{operation:'read',key:object}});
 const first=await access();assert.equal(first.expiresIn,60);assert.equal((await fetch(first.url)).status,200);report.checks.push('60 second authorized URL');
 const exe=process.env.R2_PROBE_ELECTRON;if(exe){
 const packed=path.join(path.dirname(exe),'resources/app/app/shared-bank-storage.cjs');assert.equal(fs.readFileSync(packed,'utf8').replace(/\r\n/g,'\n'),fs.readFileSync('app/shared-bank-storage.cjs','utf8').replace(/\r\n/g,'\n'));
 const code=`const {SharedBankStorage}=require(require('path').join(process.resourcesPath,'app/app/shared-bank-storage.cjs'));(async()=>{const a={config:()=>({url:'http://127.0.0.1:4173',publishableKey:process.env.TEST_ANON,storageGateway:true}),token:async()=>process.env.TEST_JWT,request:async(route,{method='GET',body}={})=>{const r=await fetch('http://127.0.0.1:4173'+route,{method,headers:{apikey:process.env.TEST_ANON,Authorization:'Bearer '+process.env.TEST_JWT,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error('denied');return r.json();}};const bytes=await new SharedBankStorage({auth:a}).download(process.env.TEST_FILE);if(require('crypto').createHash('sha256').update(bytes).digest('hex')!==process.env.TEST_SHA)throw Error('hash');console.log('PACKAGED_AUTH_READ_OK');})().catch(()=>{process.exitCode=1});`;
 const childEnv={...process.env,ELECTRON_RUN_AS_NODE:'1',TEST_ANON:anon,TEST_JWT:owner.token,TEST_FILE:id,TEST_SHA:createHash('sha256').update(fixture.body).digest('hex')};for(const k of Object.keys(childEnv))if(/^(R2_|SUPABASE_|MIGRATION_|SOURCE_)/.test(k))delete childEnv[k];
 const {spawn}=await import('node:child_process');await new Promise((ok,bad)=>{const child=spawn(exe,['-e',code],{env:childEnv,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.resume();child.on('error',bad);child.on('close',n=>n===0&&output.includes('PACKAGED_AUTH_READ_OK')?ok():bad(Error('PACKAGED_READ_FAILED')));});report.checks.push('new packaged Electron runtime real Auth/RLS read, module matches candidate');
 }
 const {downloadChunk}=await import('../../web-bank/file-storage.js');
 const client={functions:{invoke:async(_,{body})=>{try{return{data:await a.request('/functions/v1/bank-storage',{method:'POST',body})}}catch{return{error:Error('denied')}}}}};
 const web=await downloadChunk(client,{storageGateway:true},object);assert.ok(!web.error);assert.deepEqual(Buffer.from(await web.data.arrayBuffer()),fixture.body);report.checks.push('web storage module real Auth/RLS download');
 console.log(JSON.stringify({stage:'waiting for real 60 second expiry',passed:report.checks}));
 await new Promise(r=>setTimeout(r,62000));assert.equal((await fetch(first.url)).status,403);assert.equal((await fetch((await access()).url)).status,200);report.checks.push('expired URL rejected and freshly authorized URL works');
 stage='membership revocation';sql(`update public.bank_members set enabled=false where space_id='${space}' and user_id='${owner.id}'`);await assert.rejects(access());report.checks.push('membership revocation blocks URL reissue');
 stage='real write freeze';sql(`update bank_storage_private.settings set frozen=true`);assert.throws(()=>sql(`update public.bank_entries set name=name where id='${id}'`));report.checks.push('real SQL statement trigger blocks frozen writes');
 report.success=true;
}catch(e){report.success=false;report.failureStage=stage;report.error=e.code||e.name;console.error(JSON.stringify({integrationFailed:stage,type:report.error}));process.exitCode=1;}
finally{
 for(const key of created){const r=await fetch(await signer.sign(target(key),{method:'DELETE'}));assert.ok(r.ok);assert.equal((await fetch(await signer.sign(target(key),{method:'HEAD'}))).status,404);}
 report.cleanup={exactCreatedObjects:created.length,verifiedAbsent:true};if(server)await new Promise(r=>server.close(r));fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
