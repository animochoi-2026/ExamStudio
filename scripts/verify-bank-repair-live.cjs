'use strict';
const {app,safeStorage}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');app.setPath('userData',path.join(root,'data/desktop'));
app.whenReady().then(async()=>{try{
 const {SharedBankAuth}=require('../app/shared-bank-auth.cjs'),{SharedBankStorage}=require('../app/shared-bank-storage.cjs'),{ArchiveStorage}=require('../app/bank-transfer.cjs');
 const auth=new SharedBankAuth({directory:path.join(root,'data/deployment/bjxxqdbftefughjkcrqj/teacher-auth'),safeStorage,openExternal:async()=>{throw Error('재로그인 필요');}}),storage=new SharedBankStorage({auth});
 const work=path.join(root,'data/repair/source-20260930'),report=JSON.parse(fs.readFileSync(path.join(work,'analysis-report.json'))),archive=new ArchiveStorage(JSON.parse(fs.readFileSync(path.join(root,'data/backups/integrated-bank-remote-result.json'))).directory),checks=[];
 for(const item of report.success){const old=archive.archive.records.find(r=>r.catalog.question_id===item.questionId).catalog,current=(await storage.rows('bank_catalog','revision_id=eq.'+item.revisionId))[0];assert.ok(current);const result={questionId:item.questionId,revisionId:item.revisionId,roles:[]};
  for(const role of ['docx','preview']){const a=old.files.find(f=>f.role===role),b=current.files.find(f=>f.role===role);if(!a)continue;assert.ok(b);const actual=await storage.download(b.id,b),expected=await archive.download(a.id);assert.ok(actual.equals(expected),role+' bytes changed: '+item.questionId);result.roles.push(role);}
  const a=old.files.find(f=>f.role==='data'),b=current.files.find(f=>f.role==='data'),nativeBefore=JSON.parse(await archive.download(a.id)),nativeAfter=JSON.parse(await storage.download(b.id,b));
  const target=x=>x.native.project.problems.flatMap(p=>[p.original,...(p.variants||[])]).find(q=>q?.id===x.native.targetQuestionId);
  assert.deepEqual(target(nativeAfter),target(nativeBefore));result.nativeQuestionUnchanged=true;checks.push(result);
 }
 fs.writeFileSync(path.join(work,'verified-files.json'),JSON.stringify({at:new Date().toISOString(),kind:'Actual Supabase downloads compared byte-for-byte to pre-change private archive',checks},null,2));console.log(JSON.stringify({verified:checks.length,docxPreviewAndNative:true}));
}catch(e){console.error(e.stack);process.exitCode=1;}finally{app.quit();}});
