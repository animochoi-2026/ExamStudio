'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/selection-folder-20261009/folder-test'),code=path.resolve(process.env.EXAM_TEST_APP_ROOT||root);
if(process.versions.electron){
 const {app,dialog}=require('electron');global.pickerCalls=[];global.pickerReply={canceled:true,filePaths:[]};
 dialog.showOpenDialog=async(_w,options)=>{global.pickerCalls.push(options);return global.pickerReply;};
 class Offline{async getAccount(){return {available:false,models:[],rateLimits:{}};}async run(){throw Error('AI disabled');}close(){}}
 require(path.join(code,'app/codex.cjs')).CodexBridge=Offline;require(path.join(code,'app/antigravity.cjs')).AntigravityBridge=Offline;
 app.on('browser-window-created',(_e,w)=>w.setSkipTaskbar(true));require(path.join(code,'app/main.cjs'));
}else (async()=>{
 const {_electron}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 fs.mkdirSync(out,{recursive:true});const a=path.join(out,'A'),b=path.join(out,'B');for(const d of [a,b])fs.mkdirSync(d,{recursive:true});
 for(const [i,file]of [path.join(a,'a.png'),path.join(a,'aa.png'),path.join(b,'b.png')].entries())await require('sharp')({create:{width:10,height:10,channels:3,background:{r:100+i*20,g:50,b:0}}}).png().toFile(file);
 const env={...process.env,EXAM_DATA_DIR:path.join(out,'data')};delete env.ELECTRON_RUN_AS_NODE;delete env.EXAM_TEST_SOURCE;
 const results=[];
 for(let run=0;run<2;run++){
  const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env}),page=await app.firstWindow();
  try{
   await page.waitForFunction(()=>!!document.querySelector('#chatForm[data-workflow-ready]'));
   const choose=async(files,expected,count)=>{
    await app.evaluate((_e,files)=>global.pickerReply={canceled:files===null,filePaths:files||[]},files);
    await page.getByRole('button',{name:'＋ 대기열 추가',exact:true}).click();
    await page.waitForFunction(async n=>(await window.exam.examQueueStatus()).items.length===n,count);
    const call=await app.evaluate(()=>global.pickerCalls.at(-1));assert.equal(call.defaultPath,expected);assert.deepEqual(call.properties,['openFile','multiSelections']);
    const saved=JSON.parse(fs.readFileSync(path.join(out,'data/exam-queue.json')));assert.equal(saved.items.length,count);assert(saved.items.every(x=>Object.keys(x.steps).length===0));results.push({run,selected:files,openedAt:call.defaultPath||null,queueCount:count});
   };
   if(run===0){await choose([path.join(a,'a.png'),path.join(a,'aa.png')],undefined,2);await choose(null,a,2);await choose([path.join(b,'b.png')],a,3);await choose(null,b,3);}
   else await choose(null,b,3);
  }finally{await app.close();}
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({results,aiCalls:0,operatingWrites:0,nativeDialog:'mocked selection response; actual queue button, IPC, persisted state and restart'},null,2));console.log('PASS queue button A/B/cancel/restart; multi-selection preserved, no processing started');
})().catch(e=>{console.error(e);process.exitCode=1;});
