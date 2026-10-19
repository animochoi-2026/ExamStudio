'use strict';
// Existing desktop session, no AI/model adapter or upload queue execution.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{app,safeStorage}=require('electron');
const I=require('../app/difficulty-v12/input.cjs'),root=path.resolve(__dirname,'../artifacts/difficulty-v121/production-20261019');
const data='C:/Users/reals/Desktop/문제생성기/data/r2-current',mode=process.argv[2]||'snapshot';
for(const stream of [process.stdout,process.stderr])stream.on('error',()=>{});
const report=value=>fs.appendFileSync(path.join(root,'operator-progress.jsonl'),JSON.stringify({at:new Date().toISOString(),mode,...value})+'\n');
report({phase:'starting',pid:process.pid});
app.setPath('userData',path.join(data,'desktop'));app.setPath('sessionData',path.join(data,'desktop/session'));
app.whenReady().then(async()=>{try{
 report({phase:'ready'});
 const prepared=JSON.parse(fs.readFileSync(path.join(root,'prepared.json'))),auth=new(require('../app/shared-bank-auth.cjs').SharedBankAuth)({directory:path.join(data,'shared-bank-auth'),safeStorage}),storage=new(require('../app/shared-bank-storage.cjs').SharedBankStorage)({auth});
 const file=path.join(root,'current-snapshot.json');let current;
 if(mode==='snapshot'){
  if(fs.existsSync(file))throw Error('Recovery snapshot already exists; verify and reuse it, never overwrite.');
  const items=[];
  for(let i=0;i<prepared.items.length;i+=40){
   const batch=prepared.items.slice(i,i+40),ids=batch.map(x=>x.revisionId).join(',');
   const [catalogs,revisions,children,questions]=await Promise.all([
    storage.rows('bank_catalog','revision_id=in.('+ids+')'),storage.rows('bank_revisions','id=in.('+ids+')&select=id,question_id,committed,review_version'),
    storage.rows('bank_revisions','parent_id=in.('+ids+')&committed=eq.true&select=id,parent_id'),storage.rows('bank_questions','id=in.('+batch.map(x=>x.questionId).join(',')+')&select=id,archived')]);
   for(const old of batch){const c=catalogs.find(x=>x.revision_id===old.revisionId),r=revisions.find(x=>x.id===old.revisionId),q=questions.find(x=>x.id===old.questionId);
    assert(c&&r?.committed&&q?.archived===false&&!children.some(x=>x.parent_id===r.id),'Current revision unavailable: '+old.questionId);
    assert.equal(c.question_id,old.questionId);assert.equal(I.hash(c.content),old.result.source_content_hash,'Source content changed: '+old.questionId);
    assert.equal(I.hash(c.files),old.result.source_image_asset_hash,'Source files changed: '+old.questionId);
    assert.equal(I.hash(c.metadata.difficulty?.scope??null),I.hash(old.snapshot.metadata.difficulty?.scope??null),'Scope changed: '+old.questionId);
    items.push({...old,snapshot:c,reviewVersion:r.review_version});
   }
   report({phase:'readonly_current_snapshot',checked:items.length,total:1266});
  }
  current={batchId:prepared.batchId,preparedHash:I.hash(prepared),at:new Date().toISOString(),spaceId:auth.config().spaceId,items};
  fs.writeFileSync(file,JSON.stringify(current),{flag:'wx'});
  fs.writeFileSync(path.join(root,'snapshot-integrity.json'),JSON.stringify({file:'current-snapshot.json',hash:I.hash(current),count:items.length,at:current.at}),{flag:'wx'});
 }else if(mode==='stage'){
  current=JSON.parse(fs.readFileSync(file));const integrity=JSON.parse(fs.readFileSync(path.join(root,'snapshot-integrity.json')));
  assert.equal(I.hash(current),integrity.hash);assert.equal(current.preparedHash,I.hash(prepared));assert.equal(current.spaceId,auth.config().spaceId);
  for(let i=0;i<current.items.length;i+=10){const batch=current.items.slice(i,i+10),r=await storage.rpc('bank_v121_review_import',{s:current.spaceId,b:current.batchId,p:prepared.policy,items:batch});assert.equal(r.staged,batch.length);assert.equal(r.liveScoresChanged,false);
   fs.writeFileSync(path.join(root,'staging-status.json'),JSON.stringify({batchId:current.batchId,staged:i+batch.length,total:1266,at:new Date().toISOString(),liveScoresChanged:false}));console.log(JSON.stringify({staged:i+batch.length,total:1266}));}
 }else throw Error('Use snapshot or stage');
 }catch(e){const error=String(e.message).replace(/https?:\/\/\S+/g,'[URL]');report({phase:'failed',error});console.error(error);process.exitCode=1;}finally{report({phase:'exit',code:process.exitCode||0});app.exit(process.exitCode||0);}});
