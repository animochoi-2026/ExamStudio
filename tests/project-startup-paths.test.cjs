'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
for(const base of ['','dist/ExamStudio-win32-x64/resources/app/']){
 test(base+'startup migrates only after exclusive instance lock; project retention has no runtime hook',async()=>{
  const main=fs.readFileSync(base+'app/main.cjs','utf8'),tail=main.slice(main.lastIndexOf('if(!app.requestSingleInstanceLock())'));
  for(const f of ['app/main.cjs','app/preload.cjs','app/renderer.js'])assert(!/reviewProjectRetention|scheduleStartupRetentionReview|startup-retention|projectRetention/.test(fs.readFileSync(base+f,'utf8')));
  for(const locked of [false,true]){const calls=[],app={requestSingleInstanceLock:()=>locked,quit:()=>calls.push('quit'),on:()=>{},whenReady:()=>Promise.resolve(),isPackaged:false};vm.runInNewContext(tail,{app,store:{migrateProjectFolders:()=>calls.push('migrate')},registerHandlers:()=>calls.push('handlers'),createWindow:async()=>calls.push('window'),window:null,dialog:{showErrorBox:()=>calls.push('error')},console});await new Promise(r=>setImmediate(r));assert.deepEqual(calls,locked?['migrate','handlers','window']:['quit']);}
 });
}
