'use strict';
// Import a completely evaluated, verified job into PRIVATE staging. Activation
// is a separate service-side transaction after acceptance checks; never here.
const fs=require('node:fs'),path=require('node:path');
const {app,safeStorage}=require('electron');
const root=path.resolve(process.argv[2]||'artifacts/difficulty-v121'),data=process.argv[3]||'C:/Users/reals/Desktop/문제생성기/data/r2-current';
app.setPath('userData',path.join(data,'desktop'));app.setPath('sessionData',path.join(data,'desktop/session'));
const I=require('../app/difficulty-v12/input.cjs'),P=require('../app/difficulty-v121/profile.cjs'),S=require('../app/difficulty-v121/staging.cjs');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
for(const stream of [process.stdout,process.stderr])stream.on('error',()=>{});
app.whenReady().then(async()=>{try{
 if(fs.existsSync(path.join(root,'runner.lock')))throw Error('Evaluation is still running');
 const status=read('run-status.json'),approval=read('execution-approval.json'),targets=read('targets.json').rows,manifest=read('snapshot-manifest.json'),job=read('job.json');
 if(status.status!=='staging_complete'||status.completed+status.failed!==targets.length||approval.granted!==true||approval.profileVersion!==P.version||approval.targetHash!==I.hash(targets)||manifest.hash!==I.hash(manifest.rows)||job.snapshotHash!==manifest.hash)throw Error('Complete frozen evaluation required');
 const policy={profileVersion:P.version,promptHash:P.promptHash,schemaHash:P.schemaHash,scorerCodeHash:P.scorerCodeHash,targetHash:approval.targetHash,snapshotHash:manifest.hash};
 // Validate the entire result set before the first network write.
 const packets=targets.map(t=>{
  const file='snapshot/'+t.question_id+'.json',snapshot=read(file),record=manifest.rows.find(r=>r.questionId===t.question_id);
  if(!record||record.file!==file||record.hash!==I.hash(snapshot))throw Error('Snapshot integrity mismatch');
  return S.packet(read('entries/'+t.question_id+'.json'),snapshot,read('results/'+t.question_id+'.json'));
 });
 const auth=new(require('../app/shared-bank-auth.cjs').SharedBankAuth)({directory:path.join(data,'shared-bank-auth'),safeStorage});
 const storage=new(require('../app/shared-bank-storage.cjs').SharedBankStorage)({auth});let imported=0;
 for(let i=0;i<packets.length;i+=10){
  const batch=packets.slice(i,i+10),result=await storage.rpc('bank_v121_import',{s:auth.config().spaceId,j:job.id,p:policy,expected:targets.length,items:batch});
  if(result.imported!==batch.length||result.liveScoresChanged!==false)throw Error('Unexpected staging response');
  imported+=batch.length;
  fs.writeFileSync(path.join(root,'import-status.json'),JSON.stringify({status:imported===targets.length?'complete':'importing',jobId:job.id,imported,total:targets.length,profileVersion:P.version,liveScoresChanged:false,at:new Date().toISOString()}));
  process.stdout.write(JSON.stringify({imported,total:targets.length,liveScoresChanged:false})+'\n');
 }
}catch(e){process.stderr.write(String(e.message).replace(/https?:\/\/\S+/g,'[URL]')+'\n');process.exitCode=1;}finally{app.exit(process.exitCode||0);}});
