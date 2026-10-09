'use strict';
// Existing authorized desktop login + existing owner maintenance APIs only.
// No recognition, solution generation, difficulty analysis or AI bridge exists here.
// --data-dir and --session-dir must name the actual connected app's local paths.
const {app,safeStorage}=require('electron'),fs=require('node:fs'),path=require('node:path');
const opt=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const dataDir=opt('data-dir'),sessionDir=opt('session-dir'),mode=process.argv.find(a=>/^--(?:plan|status|sample=|run=)$/.test(a)||/^--(?:sample|run)=/.test(a));
if(!dataDir||!sessionDir||!mode){console.error('Use --data-dir=<connected app data> --session-dir=<its desktop/session> --plan|--status|--sample=<job>|--run=<job>; --ids=<comma-separated question IDs> limits a new plan.');app.quit();process.exitCode=2;}
else {app.setPath('userData',path.join(path.resolve(dataDir),'desktop'));app.setPath('sessionData',path.resolve(sessionDir));app.whenReady().then(async()=>{let bank,m;try{
 const auth=new(require('../app/shared-bank-auth.cjs').SharedBankAuth)({directory:path.join(path.resolve(dataDir),'shared-bank-auth'),safeStorage,openExternal:async()=>{throw Error('연결된 앱에서 기존 계정 로그인을 확인하세요.');}});
 const directory=path.join(path.resolve(dataDir),'type-backfill-jobs'),store=new(require('../app/store.cjs').ProjectStore)(path.join(directory,'workspace'));
 bank=new(require('../app/question-bank.cjs').QuestionBank)({directory,store,auth,storage:new(require('../app/shared-bank-storage.cjs').SharedBankStorage)({auth}),appVersion:require('../package.json').version,buildDocx:async()=>{throw Error('출제유형 보완은 기존 DOCX를 재사용합니다.');}});bank.wake=()=>{};bank.autonomous=false;bank.state.auto=false;
 m=new(require('../app/bank-maintenance.cjs').BankMaintenance)({bank});const brief=j=>({id:j.id,status:j.status,estimate:j.estimate,items:j.items.map(i=>({questionId:i.questionId,baseId:i.baseId,resultId:i.resultId,status:i.status,types:i.typePlan?.types,error:i.error,backupComplete:i.backupComplete})),syncError:j.syncError,aiCalls:0});
 if(mode==='--status')console.log(JSON.stringify({jobs:(await m.status()).jobs.map(brief)}));
 else {await bank.root();if(mode==='--plan'){const ids=opt('ids')?.split(',').filter(Boolean);const j=await m.plan({rules:['types'],filters:ids?{ids}:{}});console.log(JSON.stringify(brief(j)));}else if(mode.startsWith('--sample='))console.log(JSON.stringify(brief(await m.sample(mode.slice(9)))));else {const j=await m.start(mode.slice(6));await m.promise;console.log(JSON.stringify(brief(j)));if(j.status!=='complete')process.exitCode=1;}}
 }catch(e){console.error(e.message);process.exitCode=1;}finally{m?.close();bank?.close();app.quit();}});}
