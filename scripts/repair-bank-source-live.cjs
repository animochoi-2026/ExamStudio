'use strict';
// Grounded, resumable repair: source metadata only, new revisions, prior bytes retained.
const {app,safeStorage}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');app.setPath('userData',path.join(root,'data/desktop'));
app.whenReady().then(async()=>{let bank;try{
 const result=JSON.parse(fs.readFileSync(path.join(root,'data/backups/integrated-bank-remote-result.json'),'utf8'));
 const archive=JSON.parse(fs.readFileSync(path.join(result.directory,'backup.json'),'utf8'));
 const {ArchiveStorage}=require('../app/bank-transfer.cjs');const backup=new ArchiveStorage(result.directory);
 // Verify every file before any mutation.
 for(const f of archive.files)await backup.download(f.id);
 const {SharedBankAuth}=require('../app/shared-bank-auth.cjs'),{SharedBankStorage}=require('../app/shared-bank-storage.cjs'),{ProjectStore}=require('../app/store.cjs'),{QuestionBank}=require('../app/question-bank.cjs');
 const auth=new SharedBankAuth({directory:path.join(root,'data/deployment/bjxxqdbftefughjkcrqj/teacher-auth'),safeStorage,openExternal:async()=>{throw Error('등록 계정으로 재로그인 필요');}}),storage=new SharedBankStorage({auth});
 const member=await auth.membership();if(member.email!=='realspy1234@gmail.com')throw Error('백업 문항의 실제 작성 계정과 다릅니다.');
 const oldPath=path.join(root,'dist/ExamStudio-win32-x64/data/shared-banks/ca4db84fb8ca8e3025b32b3f/question-bank/state.json'),local=JSON.parse(fs.readFileSync(oldPath,'utf8'));
 const work=path.join(root,'data/repair/source-20260930');fs.mkdirSync(work,{recursive:true});const reportPath=path.join(work,'report.json'),report=fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath,'utf8')):{backup:result.directory,success:[],failed:[]};
 fs.copyFileSync(oldPath,path.join(work,'local-state-before.json'));let sourceRecord;
 const store=new ProjectStore(path.join(work,'projects'));
 bank=new QuestionBank({directory:path.join(work,'bank'),store,auth,storage,appVersion:require('../package.json').version,buildDocx:async(input,out)=>fs.writeFileSync(out,await backup.download(sourceRecord.catalog.files.find(f=>f.role==='docx').id)),preview:async(input,out)=>{const f=sourceRecord.catalog.files.find(f=>f.role==='preview');if(!f)throw Error('기존 미리보기 없음');fs.writeFileSync(out,await backup.download(f.id));}});bank.wake=()=>{};await bank.root();
 const limit=Number(process.argv.find(x=>x.startsWith('--limit='))?.split('=')[1]||1);let processed=0;
 for(const item of Object.values(local.items)){
  if(processed>=limit)break;if(report.success.some(x=>x.questionId===item.id)||report.failed.some(x=>x.questionId===item.id&&x.error.includes('갈라진')))continue;
  sourceRecord=archive.records.find(x=>x.catalog.question_id===item.id&&x.catalog.revision_id===(item.baseRevisionId||item.latestRevisionId));
  if(!sourceRecord||sourceRecord.question.owner_id!==member.userId||!item.metadata?.source?.school)continue;
  try{
   const heads=await storage.commits(auth.config().spaceId,item.id);const ownJobs=bank.state.jobs.filter(j=>j.questionId===item.id&&j.committed);if(heads.files.some(f=>f.appProperties.revisionId!==sourceRecord.catalog.revision_id&&!ownJobs.some(j=>j.id===f.appProperties.revisionId)))throw Error('백업 이후 새 버전이 존재합니다. 자동 복구를 중지합니다.');
   bank.state.cache[sourceRecord.catalog.revision_id]={commitId:sourceRecord.commitId};const restored=await bank.restore(ownJobs.at(-1)?.id||sourceRecord.catalog.revision_id),project=restored.project;
   bank.editSource(project.id,'primary',item.metadata.source);
   bank.edit([item.id],{source:item.metadata.source});
   await bank.enqueue(project.id,[project.problems[0].original.id]);await bank.pump();const job=bank.state.jobs.at(-1);if(job.status!=='complete')throw Error(job.error||job.status);
   const c=(await storage.rows('bank_catalog','revision_id=eq.'+job.id))[0];if(c.metadata.source.school!==item.metadata.source.school||c.metadata.source.academicYear!==item.metadata.source.academicYear)throw Error('복구 후 실제 조회값이 다릅니다.');
   const doc=c.files.find(f=>f.role==='docx'),prior=sourceRecord.catalog.files.find(f=>f.role==='docx');if(doc.sha256!==prior.sha256)throw Error('DOCX 원본 바이트가 달라졌습니다.');
   report.success.push({questionId:item.id,previousRevision:sourceRecord.catalog.revision_id,revisionId:job.id,source:c.metadata.source,docxUnchanged:true});processed++;
  }catch(e){report.failed.push({questionId:item.id,error:e.message});break;}
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
 }
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify({repaired:report.success.length,failed:report.failed,report:reportPath}));
}catch(e){console.error(e.message);}finally{bank?.close();app.quit();}});
