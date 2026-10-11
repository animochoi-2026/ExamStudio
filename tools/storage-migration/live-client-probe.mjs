// Local, artificial-file transport probe. No production DB/Auth or source files.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {s3Store} from './adapters.mjs';
import {fixtures} from './synthetic.mjs';
import {sha} from './core.mjs';
import {withLock} from './cli.mjs';
const origin='http://localhost:4173',run=randomUUID(),nonce=randomUUID(),created=[];
const target=s3Store({endpoint:process.env.R2_ENDPOINT,region:'auto',bucket:process.env.R2_BUCKET,accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY});
const samples=fixtures(run).map(f=>({...f,key:`__migration-test/${run}/${f.name}`,sha256:sha(f.body)}));
let timer,finish,desktopResult=null;
const finished=new Promise(r=>{finish=r;});
const html=`<!doctype html><meta charset="utf-8"><title>R2 artificial-file browser test</title><h1>R2 artificial-file browser test</h1><p>Real R2 transport; synthetic signing service. Production DB/Auth untouched.</p><button id="run">Run browser read test</button><pre id="status">Ready</pre><div id="preview"></div><button id="finish">Finish and remove this run's files</button><script type="module">
import {downloadChunk} from '/file-storage.js';
const nonce=${JSON.stringify(nonce)};
const status=document.querySelector('#status'),preview=document.querySelector('#preview');
document.querySelector('#run').onclick=async()=>{try{
 const items=await(await fetch('/samples')).json(),result=[];
 const client={functions:{invoke:async(_,{body})=>({data:await(await fetch('/sign?name='+encodeURIComponent(body.key))).json()})}};
 for(const item of items){const {data,error}=await downloadChunk(client,{storageGateway:true},item.name);if(error)throw error;
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await data.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(hash!==item.sha256||data.size!==item.bytes||data.type!==item.type)throw Error('HASH_TYPE_OR_SIZE_MISMATCH');
 const url=URL.createObjectURL(data),view=document.createElement(item.type==='image/svg+xml'?'img':'embed');view.src=url;view.type=item.type;view.width=600;view.height=item.type==='application/pdf'?250:60;preview.append(view);
 const a=document.createElement('a');a.href=url;a.download=item.name;a.textContent='Download '+item.name;preview.append(a,document.createElement('br'));
 result.push({name:item.name,bytes:data.size,verified:true});}
 status.textContent=JSON.stringify({browser:'passed',files:result,productionAuth:'not tested'},null,2);
 await fetch('/result',{method:'POST',headers:{'Content-Type':'application/json','X-Probe':nonce},body:JSON.stringify({browser:'passed',files:result})});
 }catch{status.textContent='FAILED';}};
document.querySelector('#finish').onclick=async()=>{const r=await fetch('/finish',{method:'POST',headers:{'X-Probe':nonce}});status.textContent=r.ok?'Cleanup requested; see terminal verification.':'Cleanup request failed';};
</script>`;
const server=createServer(async(req,res)=>{try{
 if(!['localhost:4173','127.0.0.1:4173'].includes(req.headers.host)){res.writeHead(403).end();return;}
 const u=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 if(req.method==='POST'){
  if(req.headers.origin!==origin||req.headers['x-probe']!==nonce){res.writeHead(403).end();return;}
  if(u.pathname==='/result'){req.resume();console.log(JSON.stringify({browserRead:'passed',fixtureCount:2,auth:'synthetic signer only'}));res.end('{}');return;}
  if(u.pathname==='/finish'){res.end('{}');finish();return;}
 }
 if(req.method!=='GET'){res.writeHead(405).end();return;}
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 if(u.pathname==='/file-storage.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('../../web-bank/file-storage.js',import.meta.url)));return;}
 if(u.pathname==='/samples'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(samples.map(f=>({name:f.name,bytes:f.body.length,type:f.type,sha256:f.sha256}))));return;}
 if(u.pathname==='/sign'){const f=samples.find(f=>f.name===u.searchParams.get('name'));if(!f){res.writeHead(404).end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({provider:'r2',url:await target.signedRead(f.key)}));return;}
 res.writeHead(404).end();
 }catch{res.writeHead(500).end('PROBE_REQUEST_FAILED');}});
async function desktopProbe(){
 const exe=resolve(process.env.R2_PROBE_ELECTRON||'');if(!process.env.R2_PROBE_ELECTRON)throw Error('PACKAGED_ELECTRON_REQUIRED');
 const code=`const {SharedBankStorage}=require(require('path').join(process.resourcesPath,'app/app/shared-bank-storage.cjs'));const crypto=require('crypto');(async()=>{const items=await(await fetch('${origin}/samples')).json();const storage=new SharedBankStorage({auth:{config:()=>({storageGateway:true}),token:async()=> 'synthetic-no-auth',request:async(_,{body})=>await(await fetch('${origin}/sign?name='+encodeURIComponent(body.key.split('/')[1]))).json()}});for(const f of items){const r=await storage.object({space_id:'synthetic',id:f.name},0);if(!r.ok)throw Error();const b=Buffer.from(await r.arrayBuffer());if(crypto.createHash('sha256').update(b).digest('hex')!==f.sha256)throw Error();}console.log(JSON.stringify({packagedElectronRead:'passed',files:items.length,auth:'synthetic signer only'}));})().catch(()=>{console.error('ELECTRON_PROBE_FAILED');process.exitCode=1;});`;
 const env={...process.env,ELECTRON_RUN_AS_NODE:'1'};for(const k of Object.keys(env))if(/^(R2_|MIGRATION_|SUPABASE_|SOURCE_S3_)/.test(k))delete env[k];
 await new Promise((ok,bad)=>{const child=spawn(exe,['-e',code],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',b=>{out+=b;});child.stderr.resume();child.on('error',()=>bad(Error('ELECTRON_PROBE_FAILED')));child.on('close',exit=>{if(exit!==0)return bad(Error('ELECTRON_PROBE_FAILED'));try{desktopResult=JSON.parse(out);console.log(JSON.stringify(desktopResult));ok();}catch{bad(Error('ELECTRON_PROBE_FAILED'));}});});
}
async function main(){
 await new Promise((ok,bad)=>{server.once('error',bad);server.listen(4173,'127.0.0.1',ok);});
 try{await withLock(target,'artificial-client-probe',async()=>{
  try{for(const f of samples){
   try{await target.put(f.key,f.body,{ContentType:f.type},{absent:true});created.push(f);}
   catch(error){
    // A lost acknowledgement is reconciled only for this run's unique bytes.
    // Never claim or clean up a conflicting pre-existing key.
    if(![409,412].includes(error.status)){const possible=await target.get(f.key,{missing:true});if(possible&&sha(possible.body)===f.sha256)created.push(f);}
    throw error;
   }
  }
   await desktopProbe();console.log(JSON.stringify({browserProbe:origin,ready:true}));
   timer=setTimeout(finish,10*60*1000);await finished;
  }finally{clearTimeout(timer);for(const f of created){await target.remove(f.key);if(await target.get(f.key,{missing:true}))throw Error('PROBE_CLEANUP_FAILED');}console.log(JSON.stringify({cleanup:'verified absent',artificialFiles:created.length}));}
 });}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
main().catch(()=>{console.error('CLIENT_PROBE_FAILED');process.exitCode=1;});
