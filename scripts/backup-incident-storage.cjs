'use strict';
// Read-only remote object backup; uses only this Windows user's existing secure logins.
const {app,safeStorage}=require('electron'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'data/diagnostics/db-20261001-hotfix');
app.setPath('userData',path.join(root,'data/desktop'));
app.whenReady().then(async()=>{try{
 const db=JSON.parse(fs.readFileSync(path.join(dir,'database-backup.json'))),old=path.join(root,'data/backups/integrated-bank-remote-2026-09-30T15-04-31-757Z');
 const {SharedBankAuth}=require('../app/shared-bank-auth.cjs');
 const auths=['data/shared-bank-auth','data/deployment/bjxxqdbftefughjkcrqj/teacher-auth'].map(p=>new SharedBankAuth({directory:path.join(root,p),safeStorage}));
 const byUser=new Map(auths.map(a=>[a.read().account?.id,a]));
 const manifest=[];fs.mkdirSync(path.join(dir,'storage-files'),{recursive:true});let fetched=0;
 for(const e of db.tables.bank_entries.filter(e=>e.kind==='file')){
  const objects=db.storage_objects.filter(o=>o.name.startsWith(e.space_id+'/'+e.id+'/'));
  if(!objects.length)continue;
  if(objects.length!==e.chunks)throw Error('Incomplete object set: '+e.id);
  let bytes;const prior=path.join(old,'files',e.id);
  if(fs.existsSync(prior))bytes=fs.readFileSync(prior);
  if(!bytes||bytes.length!==e.size||crypto.createHash('sha256').update(bytes).digest('hex')!==e.sha256){
   const a=byUser.get(e.owner_id);if(!a)throw Error('Owning user login unavailable: '+e.id);
   // Refresh is an auth action only. Never call membership/finish or alter bank records.
   const saved=a.read();let token=saved.tokens?.access_token;
   if(saved.tokens?.expiresAt<Date.now()+60000){const t=await a.request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:saved.tokens.refresh_token}});a.write({...saved,tokens:{...t,expiresAt:Date.now()+t.expires_in*1000}});token=t.access_token;}
   const c=a.config(),parts=[];
   for(const o of objects.sort((x,y)=>x.name.localeCompare(y.name))){const r=await fetch(c.url+'/storage/v1/object/authenticated/'+o.bucket_id+'/'+o.name,{headers:{apikey:c.publishableKey,Authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('Object download HTTP '+r.status);parts.push(Buffer.from(await r.arrayBuffer()));}
   bytes=Buffer.concat(parts);fetched+=objects.length;
  }
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');if(bytes.length!==e.size||sha256!==e.sha256||crypto.createHash('md5').update(bytes).digest('hex')!==e.md5)throw Error('Integrity mismatch: '+e.id);
  fs.writeFileSync(path.join(dir,'storage-files',e.id),bytes);
  manifest.push({fileId:e.id,size:e.size,sha256,objects:objects.map(o=>({id:o.id,name:o.name,size:Number(o.metadata.size),etag:o.metadata.eTag||null})),reusedVerifiedBackup:fs.existsSync(prior)});
 }
 const count=manifest.reduce((n,e)=>n+e.objects.length,0);if(count!==db.storage_objects.length)throw Error('Unmapped storage objects');
 const result={at:new Date().toISOString(),files:manifest.length,objects:count,bytes:manifest.reduce((n,e)=>n+e.size,0),fetched,manifest};fs.writeFileSync(path.join(dir,'storage-backup.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,manifest:undefined}));
 }catch(e){console.error(e.message);process.exitCode=1;}finally{app.quit();}});
