'use strict';
// Admin-only, resumable existing-question analysis. Requires migration 011.
// Usage: electron scripts/backfill-bank-difficulty.cjs --status|--plan|--sample=<job-id>|--run=<job-id>|--restore-sources=<completed-job-id>
const {app,safeStorage}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
app.setPath('userData',path.join(root,'data/desktop'));
const arg=process.argv.find(x=>/^--(?:status|plan|sample=|run=|restore-sources=|finalize=)/.test(x))||'';
if(!arg){console.error('Use --status, --plan, --sample=<job-id>, --run=<job-id>, --restore-sources=<completed-job-id>, or --finalize=<completed-job-id>');app.quit();process.exitCode=2;}
else app.whenReady().then(async()=>{let bank,maintenance,bridge;try{
 const {SharedBankAuth}=require('../app/shared-bank-auth.cjs'),{SharedBankStorage}=require('../app/shared-bank-storage.cjs');
 const {ProjectStore}=require('../app/store.cjs'),{QuestionBank}=require('../app/question-bank.cjs');
 const {BankMaintenance}=require('../app/bank-maintenance.cjs'),{ArchiveStorage}=require('../app/bank-transfer.cjs');
 const directory=path.join(root,'data/maintenance-analysis-v3');
 const auth=new SharedBankAuth({directory:path.join(root,'data/shared-bank-auth'),safeStorage,openExternal:async()=>{throw Error('관리자 재로그인이 필요합니다.');}});
 const member=await auth.membership();if(member.role!=='owner')throw Error('관리자 계정만 기존 문항을 일괄 업데이트할 수 있습니다.');
 const storage=new SharedBankStorage({auth}),store=new ProjectStore(path.join(directory,'workspace'));
 bank=new QuestionBank({directory,store,storage,auth,appVersion:require('../package.json').version,buildDocx:async()=>{throw Error('난이도 분석은 기존 DOCX를 재사용합니다.');}});
 bank.wake=()=>{};bank.state.auto=false;await bank.root();
 const saved=fs.existsSync(path.join(root,'data/ai-settings.json'))?JSON.parse(fs.readFileSync(path.join(root,'data/ai-settings.json'),'utf8')):{};
 const getBridge=()=>bridge||(bridge=new(require('../app/codex.cjs').CodexBridge)({cwd:store.projectsDir}));
 maintenance=new BankMaintenance({bank,getBridge,getSettings:()=>({model:saved.model||'gpt-6-astra',effort:saved.effort||'medium'})});
 const brief=j=>({id:j.id,status:j.status,total:j.items.length,estimate:j.estimate,counts:maintenance.counts(j),failures:j.items.filter(i=>['failed','conflict'].includes(i.status)).map(i=>({questionId:i.questionId,error:i.error})),message:j.message});
 if(arg==='--status')console.log(JSON.stringify({rules:(await maintenance.status()).rules.map(r=>({id:r.id,version:r.version})),jobs:maintenance.jobs.map(brief)}));
 else if(arg==='--plan'){
  const backupResult=JSON.parse(fs.readFileSync(path.join(root,'data/backups/integrated-bank-remote-result.json'),'utf8'));
  const archive=new ArchiveStorage(backupResult.directory),savedIds=new Set(archive.archive.records.map(r=>r.catalog.revision_id));
  const current=[];for(let start=0;;start+=50){const page=await storage.rpc('bank_search_current',{s:auth.config().spaceId,filters:{},start_at:start});current.push(...page);if(page.length<50)break;}
  if(current.some(c=>!savedIds.has(c.revision_id)))throw Error('백업 이후 새 문항 버전이 있습니다. 새 백업을 만든 뒤 계획하세요.');
  for(const f of archive.archive.files)await archive.download(f.id,f);
  const job=await maintenance.plan({rules:['analysis'],provider:'codex'});
  console.log(JSON.stringify({backup:{versions:archive.archive.records.length,files:archive.archive.files.length},current:current.length,plan:brief(job)}));
 }else if(arg.startsWith('--restore-sources=')){const job=await maintenance.planSourceRestore(arg.slice(18));console.log(JSON.stringify(brief(job)));}
 else if(arg.startsWith('--finalize=')){const job=maintenance.job(arg.slice(11));if(job.status!=='complete'||job.items.some(i=>i.status!=='complete'))throw Error('모든 문항이 완료된 작업만 종료 기록을 갱신할 수 있습니다.');job.message='선택한 문항의 처리와 서버 등록을 완료했습니다.';await maintenance.sync(job);if(job.syncError)throw Error(job.syncError);console.log(JSON.stringify(brief(job)));}
 else if(arg.startsWith('--sample=')){const job=await maintenance.sample(arg.slice(9));console.log(JSON.stringify(brief(job)));}
 else if(arg.startsWith('--run=')){const job=await maintenance.start(arg.slice(6));await maintenance.promise;console.log(JSON.stringify(brief(job)));}
}catch(e){console.error(e.message);process.exitCode=1;}finally{maintenance?.close();bank?.close();bridge?.close();app.quit();}});
