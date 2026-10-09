'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
// Open a normal installed browser profile, never an embedded/automated webview.
// No debugging flags, cookie inspection, user-agent overrides or credentials.
function browserPaths(name,env=process.env){
 const suffix=name==='chrome'?['Google','Chrome','Application','chrome.exe']:['Microsoft','Edge','Application','msedge.exe'];
 return [env.PROGRAMFILES,env['PROGRAMFILES(X86)'],env.LOCALAPPDATA].filter(Boolean).map(p=>path.join(p,...suffix));
}
async function openBankLogin(url,{browser='auto'}={},deps={}){
 const u=new URL(url);
 if(u.protocol!=='https:'||!/^[-a-z0-9]+\.supabase\.co$/.test(u.hostname)||u.pathname!=='/auth/v1/authorize'||u.username||u.password)throw Error('공동 문제은행의 공식 로그인 주소가 아닙니다.');
 if(!['auto','chrome','edge','default'].includes(browser))throw Error('로그인할 브라우저를 확인하세요.');
 const platform=deps.platform||process.platform,exists=deps.exists||fs.existsSync,launch=deps.spawn||spawn;
 if(platform==='win32'&&browser!=='default'){
  for(const name of browser==='auto'?['chrome','edge']:[browser]){
   const exe=browserPaths(name,deps.env).find(exists);if(!exe)continue;
   await new Promise((resolve,reject)=>{const child=launch(exe,[u.href],{shell:false,detached:true,stdio:'ignore',windowsHide:false});child.once('error',()=>reject(Error('브라우저를 열지 못했습니다. 다른 브라우저를 선택해 다시 로그인하세요.')));child.once('spawn',()=>{child.unref();resolve();});});
   return name;
  }
  if(browser!=='auto')throw Error((browser==='chrome'?'Chrome':'Edge')+'이 설치되어 있지 않습니다. 다른 브라우저를 선택하세요.');
 }
 await deps.shell.openExternal(u.href);return 'default';
}
module.exports={openBankLogin,browserPaths};
