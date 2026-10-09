'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..'),build=process.argv[2]&&path.resolve(process.argv[2]);
const folder=fs.mkdtempSync(path.join(base,'data/validation/bundled-codex-'));
process.env.CODEX_HOME=path.join(folder,'codex-home');fs.mkdirSync(process.env.CODEX_HOME);
process.env.USERPROFILE=folder;process.env.HOME=folder;process.env.LOCALAPPDATA=path.join(folder,'local');process.env.APPDATA=path.join(folder,'roaming');process.env.PATH=path.join(process.env.SystemRoot,'System32');
for(const key of ['EXAM_CODEX_PATH','OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN'])delete process.env[key];
const {CodexBridge,findCodex}=require(build?path.join(build,'resources/app/app/codex.cjs'):'../app/codex.cjs');
(async()=>{const exe=findCodex();assert.ok(exe.startsWith(build||path.join(base,'vendor')));const bridge=new CodexBridge({cwd:folder,requestTimeoutMs:20000});
 try{await bridge.start();const account=await bridge._request('account/read',{refreshToken:false});assert.equal(account.account,null);const login=await bridge.login();const url=new URL(login.authUrl);assert.equal(url.protocol,'https:');assert.ok(url.hostname.endsWith('openai.com')||url.hostname.endsWith('chatgpt.com'));await bridge.logout();console.log('PASS real bundled Codex: no external install, fresh account, actual official browser-login URL obtained and cancelled; no user credentials or AI inference');}
 finally{bridge.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
