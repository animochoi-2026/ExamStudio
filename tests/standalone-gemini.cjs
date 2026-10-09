'use strict';
// Real official download and executable launch. No login or model request.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync,spawnSync}=require('node:child_process');
const appRoot=process.argv[2]?path.join(path.resolve(process.argv[2]),'resources/app'):path.resolve(__dirname,'..');
const {ensureRuntime,RELEASE}=require(path.join(appRoot,'app/gemini-runtime.cjs'));
const root=fs.mkdtempSync(path.resolve(__dirname,'../data/validation/gemini-standalone-'));
const env={...process.env,PATH:path.join(process.env.SystemRoot,'System32'),HOME:root,USERPROFILE:root,APPDATA:path.join(root,'Roaming'),LOCALAPPDATA:path.join(root,'Local'),AGY_CLI_DISABLE_AUTO_UPDATE:'true'};
for(const key of ['EXAM_ANTIGRAVITY_PATH','GEMINI_API_KEY','GOOGLE_API_KEY','GOOGLE_GEMINI_BASE_URL'])delete env[key];
(async()=>{
 const started=Date.now(),directory=path.join(root,'문제공방/runtime/gemini'),messages=[];
 const exe=await ensureRuntime({directory,env,onProgress:text=>{messages.push(text);console.log(text);}});
 const options={env,cwd:root,windowsHide:true,encoding:'utf8',timeout:20000};
 const version=execFileSync(exe,['--version'],options).trim();assert.match(version,new RegExp(RELEASE.version.replaceAll('.','\\.')));
 const helpResult=spawnSync(exe,['--help'],options);assert.equal(helpResult.status,0);const help=helpResult.stdout+helpResult.stderr;for(const flag of ['--json-schema','--output-format','--prompt-interactive','--mode','--print-timeout','--model'])assert.ok(help.includes(flag),flag);
 assert.equal(await ensureRuntime({directory,env,fetchImpl:()=>assert.fail('Must reuse downloaded runtime')}),exe);
 const report={version,source:RELEASE.url,externalInstallation:false,downloadAndChecksum:true,realExecutableStarted:true,requiredFlags:true,reuse:true,loginCompleted:false,aiInference:false,durationMs:Date.now()-started};
 fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({root,...report}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
