'use strict';
// Explicit existing-data repair. Uses the teacher's encrypted local login and
// the already configured AI provider. No credentials are written to the report.
const {app,safeStorage}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');app.setPath('userData',path.join(root,'data/desktop'));
app.whenReady().then(async()=>{let bank,bridge;try{
 const {SharedBankAuth}=require('../app/shared-bank-auth.cjs'),{SharedBankStorage}=require('../app/shared-bank-storage.cjs'),{ProjectStore}=require('../app/store.cjs'),{QuestionBank}=require('../app/question-bank.cjs'),{BankAnalysis}=require('../app/bank-analysis.cjs'),{ArchiveStorage}=require('../app/bank-transfer.cjs');
 const auth=new SharedBankAuth({directory:path.join(root,'data/deployment/bjxxqdbftefughjkcrqj/teacher-auth'),safeStorage,openExternal:async()=>{throw Error('등록 계정의 재로그인이 필요합니다.');}}),storage=new SharedBankStorage({auth});
 const member=await auth.membership();if(member.email!=='realspy1234@gmail.com')throw Error('기존 문항 등록 계정이 아닙니다.');
 const work=path.join(root,'data/repair/source-20260930'),sourceReport=JSON.parse(fs.readFileSync(path.join(work,'report.json'))),archive=new ArchiveStorage(JSON.parse(fs.readFileSync(path.join(root,'data/backups/integrated-bank-remote-result.json'))).directory),store=new ProjectStore(path.join(work,'projects'));
 const reportPath=path.join(work,'analysis-report.json'),report=fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath)):{startedAt:new Date().toISOString(),success:[],failed:[]};let sourceRecord;const archiveByQuestion=new Map();for(const record of archive.archive.records){const f=record.catalog.files.find(f=>f.role==='data');if(f){const native=JSON.parse(await archive.download(f.id));archiveByQuestion.set(native.native.targetQuestionId,record);}}
 bank=new QuestionBank({directory:path.join(work,'bank'),store,auth,storage,appVersion:require('../package.json').version,buildDocx:async(i,out)=>fs.writeFileSync(out,await archive.download(archiveByQuestion.get(i.questionId).catalog.files.find(f=>f.role==='docx').id)),preview:async(i,out)=>{const input=JSON.parse(fs.readFileSync(path.join(path.dirname(i),'local-input.json'))),f=archiveByQuestion.get(input.questionId).catalog.files.find(f=>f.role==='preview');if(!f)throw Error('기존 미리보기 없음');fs.writeFileSync(out,await archive.download(f.id));}});bank.wake=()=>{};
 if(!fs.existsSync(path.join(work,'bank-before-analysis.json')))fs.copyFileSync(bank.file,path.join(work,'bank-before-analysis.json'));
 bridge=new(require('../app/codex.cjs').CodexBridge)({cwd:store.projectsDir});
 const settingsFile=path.join(root,'data/ai-settings.json'),saved=fs.existsSync(settingsFile)?JSON.parse(fs.readFileSync(settingsFile)):{};
 const analyzer=new BankAnalysis({store,getBridge:()=>bridge,getSettings:()=>({model:saved.model||'gpt-6-astra',effort:saved.effort||'medium'})});
 const limit=Number(process.argv.find(x=>x.startsWith('--limit='))?.split('=')[1]||1);let attempted=0;
 for(const repaired of sourceReport.success){if(attempted>=limit)break;const only=process.argv.find(x=>x.startsWith('--question='))?.split('=')[1];if(only&&repaired.questionId!==only)continue;const fileRepair=process.argv.includes('--repair-files');if(fileRepair&&!report.success.some(x=>x.questionId===repaired.questionId&&!x.docxUnchanged))continue;if(!only&&!fileRepair&&report.success.some(x=>x.questionId===repaired.questionId))continue;
  const item=bank.state.items[repaired.questionId];if(!item)continue;sourceRecord=archive.archive.records.find(r=>r.catalog.question_id===item.id);if(!sourceRecord)continue;attempted++;
  try{
   const current=await storage.commits(auth.config().spaceId,item.id),headIds=current.files.map(f=>f.appProperties.revisionId),revisionIds=new Set(current.files.map(f=>f.appProperties.parentRevisionId).filter(Boolean));
   if(!headIds.includes(item.baseRevisionId||item.latestRevisionId))throw Error('현재 버전 연결을 확인하세요.');
   const previousRevision=item.baseRevisionId||item.latestRevisionId;if(fileRepair){item.metadata.fileRepair={reason:'archive DOCX and preview integrity correction',at:new Date().toISOString()};await bank.enqueue(item.projectId,[item.questionId]);await bank.pump();clearTimeout(bank.timer);}else if(process.argv.includes('--resume-only')){await bank.pump();clearTimeout(bank.timer);}else{const before=JSON.stringify(store.get(item.projectId).problems[0].original),result=await analyzer.run(bank,{projectId:item.projectId,questionIds:[item.questionId]});if(result.errors.length)throw Error(result.errors[0].message);
   if(before!==JSON.stringify(store.get(item.projectId).problems[0].original))throw Error('분석 중 원문 내용이 변경됐습니다.');
   await bank.enqueue(item.projectId,[item.questionId]);await bank.pump();clearTimeout(bank.timer);}const job=bank.state.jobs.filter(j=>j.questionId===item.id).at(-1);if(job.status!=='complete')throw Error(job.error||job.status);
   const catalog=(await storage.rows('bank_catalog','revision_id=eq.'+job.id))[0];if(catalog.metadata.analysis.status!=='complete')throw Error('추천값 서버 확인 실패');
   report.success=report.success.filter(x=>x.questionId!==item.id);report.success.push({questionId:item.id,previousRevision,revisionId:job.id,originalNumber:catalog.metadata.source.originalNumber,primaryUnit:catalog.metadata.classification.primaryUnit,aiScore:catalog.metadata.difficulty.aiScore,analysis:catalog.metadata.analysis,docxUnchanged:catalog.files.find(f=>f.role==='docx').sha256===sourceRecord.catalog.files.find(f=>f.role==='docx').sha256});
   console.log(JSON.stringify({completed:report.success.length,questionId:item.id,unit:catalog.metadata.classification.primaryUnit?.name,score:catalog.metadata.difficulty.aiScore}));
  }catch(e){report.failed.push({questionId:item.id,error:e.message});console.log(JSON.stringify({failed:item.id,error:e.message}));if(!process.argv.includes('--resume-only')&&/로그인|한도|quota|network|인증|연결|queued/i.test(e.message))break;}
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
 }
 report.failed=report.failed.filter(f=>!report.success.some(s=>s.questionId===f.questionId));report.finishedAt=new Date().toISOString();fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify({report:reportPath,success:report.success.length,failed:report.failed.length}));
}catch(e){console.error(e.message);process.exitCode=1;}finally{bank?.close();bridge?.close();app.quit();}});
