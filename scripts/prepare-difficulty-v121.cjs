'use strict';
// Read-only bank preparation. No model dispatch, uploads, score writes or queue access.
const fs=require('node:fs'),path=require('node:path');
const {app,safeStorage}=require('electron');
const repo=path.resolve(__dirname,'..'),root=path.resolve(process.argv[2]||path.join(repo,'artifacts/difficulty-v121'));
const profile=process.argv[3]||'C:/Users/reals/Desktop/문제생성기/data/r2-current';
// Match the established read-only preparation helper. Chromium's OS-protected
// key belongs to the existing session; no window, queue or credential copy.
app.setPath('userData',path.join(profile,'desktop'));app.setPath('sessionData',path.join(profile,'desktop/session'));
const I=require('../app/difficulty-v12/input.cjs'),B=require('../app/difficulty-v12/bundle-input.cjs');
const P=require('../app/difficulty-v121/profile.cjs'),C=require('../app/difficulty-v121/policy.cjs'),R=require('../app/difficulty-v121/run.cjs');
function write(file,value){const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value));fs.renameSync(temp,file);}
function log(value){try{process.stdout.write(JSON.stringify(value)+'\n');}catch{}}
for(const stream of [process.stdout,process.stderr])stream.on('error',()=>{});
app.whenReady().then(async()=>{try{
 const auth=new(require('../app/shared-bank-auth.cjs').SharedBankAuth)({directory:path.join(profile,'shared-bank-auth'),safeStorage});
 const storage=new(require('../app/shared-bank-storage.cjs').SharedBankStorage)({auth});
 const targets=JSON.parse(fs.readFileSync(path.join(root,'targets.json'),'utf8')).rows;
 if(targets.length!==1266||new Set(targets.map(t=>t.question_id)).size!==1266)throw Error('approved_target_set_mismatch');
 const ordered=C.ordered(targets.map(t=>({...t,questionId:t.question_id})));
 for(const dir of ['snapshot','entries','files'])fs.mkdirSync(path.join(root,dir),{recursive:true});
 const snapshotFile=path.join(root,'snapshot-manifest.json');let snapshot;
 if(fs.existsSync(snapshotFile)){
  snapshot=JSON.parse(fs.readFileSync(snapshotFile));
  if(snapshot.targetHash!==I.hash(targets))throw Error('snapshot_target_mismatch');
  for(const row of snapshot.rows)if(I.hash(JSON.parse(fs.readFileSync(path.join(root,row.file))))!==row.hash)throw Error('snapshot_integrity_mismatch');
 }else{
  const rows=[];
  for(let start=0;start<ordered.length;start+=40){
   const batch=ordered.slice(start,start+40),ids=batch.map(t=>t.revision_id).join(',');
   const catalogs=await storage.rows('bank_catalog','revision_id=in.('+ids+')');
   const revisions=await storage.rows('bank_revisions','id=in.('+ids+')&select=id,question_id,review_version,committed');
   const children=await storage.rows('bank_revisions','parent_id=in.('+ids+')&committed=eq.true&select=id,parent_id');
   const questions=await storage.rows('bank_questions','id=in.('+batch.map(t=>t.question_id).join(',')+')&select=id,archived');
   for(const t of batch){
    const c=catalogs.find(c=>c.revision_id===t.revision_id),r=revisions.find(r=>r.id===t.revision_id),q=questions.find(q=>q.id===t.question_id);
    if(!c||c.question_id!==t.question_id||!r?.committed||q?.archived!==false||children.some(n=>n.parent_id===r.id))throw Error('approved_revision_changed:'+t.question_id);
    const record={target:t,catalog:c,revision:r},file='snapshot/'+t.question_id+'.json';
    write(path.join(root,file),record);rows.push({questionId:t.question_id,revisionId:r.id,file,hash:I.hash(record)});
   }
   log({phase:'recovery_snapshot',complete:rows.length,total:targets.length});
  }
  snapshot={createdAt:new Date().toISOString(),targetHash:I.hash(targets),rows,hash:I.hash(rows)};write(snapshotFile,snapshot);
 }
 const cacheDirs=[path.join(root,'files'),...['files','shingu-2026-2-midterm/files','shindong-2026-2-midterm/files'].map(d=>path.join(repo,'artifacts/difficulty-v12',d))];
 const read=async f=>{
  for(const dir of cacheDirs){const file=path.join(dir,f.id);if(fs.existsSync(file)){const b=fs.readFileSync(file);if(b.length===f.size&&B.digest(b)===f.sha256)return b;}}
  const bytes=await storage.download(f.id,f);if(bytes.length!==f.size||B.digest(bytes)!==f.sha256)throw Error('source_integrity_mismatch');
  const file=path.join(root,'files',f.id);fs.writeFileSync(file+'.tmp',bytes);fs.renameSync(file+'.tmp',file);return bytes;
 };
 const headers=[],errors=[];
 for(const t of ordered){
  try{
   const c=JSON.parse(fs.readFileSync(path.join(root,'snapshot',t.question_id+'.json'))).catalog;
   const file=path.join(root,'entries',t.question_id+'.json');let entry;
   if(fs.existsSync(file)){entry=JSON.parse(fs.readFileSync(file));if(entry.revisionId!==t.revision_id||entry.catalogHash!==I.hash(c)||entry.profileVersion!==P.version)throw Error('prepared_input_changed');}
   else{
    const nativeFile=c.files.find(f=>f.role==='data');if(!nativeFile)throw Error('native_bundle_missing');
    const bundle=JSON.parse(await read(nativeFile)),input=await B.fromNative(c,bundle,read);
    require('../app/difficulty-v12/subscription.cjs').verifyInput(input,{allowTextOnly:true});
    entry={id:t.question_id,questionId:t.question_id,revisionId:t.revision_id,source:t.source,catalogHash:I.hash(c),profileVersion:P.version,input,
     validationContext:{scope:input.payload.curriculum_scope,storedAnswer:c.content.answer,choices:c.content.choices||[],requiresImage:input.images.length>0,imageCount:input.images.length}};
    write(file,entry);
   }
   headers.push({...entry,input:{...entry.input,images:entry.input.images.map(({dataUrl,...image})=>image)}});
   log({phase:'prepare_input',complete:headers.length,total:targets.length,questionId:t.question_id,images:entry.input.images.length});
  }catch(e){errors.push({questionId:t.question_id,error:String(e.message).replace(/https?:\/\/\S+/g,'[URL]')});log({phase:'prepare_input',questionId:t.question_id,error:errors.at(-1).error});if(['auth','forbidden','network'].includes(e.code))throw e;}
 }
 write(path.join(root,'preparation-errors.json'),errors);
 if(errors.length)throw Error('input_preparation_failed:'+errors.length);
 write(path.join(root,'input-manifest.json'),{createdAt:new Date().toISOString(),profileVersion:P.version,manifestHash:R.manifest(headers),snapshotHash:snapshot.hash,entries:headers});
 write(path.join(root,'preparation-status.json'),{status:'complete',count:headers.length,manifestHash:R.manifest(headers),snapshotHash:snapshot.hash,at:new Date().toISOString()});
 log({phase:'ready',count:headers.length,manifestHash:R.manifest(headers),modelCalls:0,bankWrites:0});
}catch(e){write(path.join(root,'preparation-status.json'),{status:'blocked',message:String(e.message).replace(/https?:\/\/\S+/g,'[URL]'),at:new Date().toISOString()});log({phase:'blocked',code:e.code||null,message:String(e.message).replace(/https?:\/\/\S+/g,'[URL]')});process.exitCode=1;}finally{app.exit(process.exitCode||0);}});
