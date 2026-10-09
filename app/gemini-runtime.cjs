'use strict';
// Official Windows x64 release manifest, checked against Google's installer.
// Download for this installation instead of redistributing a user's installation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const RELEASE=Object.freeze({version:'1.2.7',url:'https://storage.googleapis.com/antigravity-public/antigravity-cli/1.2.7-6731160148115456/windows-x64/cli_windows_x64.exe',sha512:'3b2008ed40276e125e5960ae30c1a376d33bd8637fa941742f287aa244a3d609f11d1bb2694947db170ed7452561ba0b721be3f6fa03a955e2737bed043377bd'});
const pending=new Map();
function defaultDirectory(){return ['문제공방.exe','ExamStudio.exe'].some(name=>fs.existsSync(path.resolve(__dirname,'../../..',name)))?path.resolve(__dirname,'../../../runtime/gemini'):path.resolve(__dirname,'../runtime/gemini');}
function findRuntime({directory=defaultDirectory(),env=process.env}={}){
 const candidates=env.EXAM_ANTIGRAVITY_PATH?[env.EXAM_ANTIGRAVITY_PATH]:[path.join(directory,'agy.exe'),path.join(env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'agy','bin','agy.exe')];
 for(const file of candidates){try{if(path.isAbsolute(file)&&/\.exe$/i.test(file)&&fs.statSync(file).isFile())return file;}catch{}}
 throw Error(env.EXAM_ANTIGRAVITY_PATH?'설정한 Gemini 실행 파일을 찾지 못했습니다. EXAM_ANTIGRAVITY_PATH를 확인하세요.':'Gemini 연결 파일을 준비해야 합니다. Gemini 로그인 또는 연결 확인을 누르면 자동으로 준비합니다.');
}
async function ensureRuntime({directory=defaultDirectory(),env=process.env,fetchImpl=fetch,onProgress=()=>{},release=RELEASE}={}){
 try{return findRuntime({directory,env});}catch(error){if(env.EXAM_ANTIGRAVITY_PATH)throw error;}
 const key=path.resolve(directory);
 if(pending.has(key))return pending.get(key);
 const work=(async()=>{
  const url=new URL(release.url);
  if(url.protocol!=='https:'||url.hostname!=='storage.googleapis.com'||!url.pathname.startsWith('/antigravity-public/antigravity-cli/')||url.username||url.password||!/^[a-f0-9]{128}$/i.test(release.sha512))throw Error('공식 Gemini 배포 정보를 확인할 수 없습니다.');
  fs.mkdirSync(key,{recursive:true});
  const temp=path.join(key,`agy-${crypto.randomUUID()}.download`),target=path.join(key,'agy.exe');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);
  let fd;
  try{
   onProgress('Gemini 연결 파일을 처음 준비하고 있습니다. 인터넷 속도에 따라 몇 분 걸릴 수 있습니다…');
   const response=await fetchImpl(release.url,{signal:controller.signal,redirect:'error'});
   if(!response.ok||!response.body)throw Error(`다운로드 응답 ${response.status}`);
   fd=fs.openSync(temp,'wx');const hash=crypto.createHash('sha512');let bytes=0;
   for await(const chunk of response.body){bytes+=chunk.length;if(bytes>400*1024*1024)throw Error('다운로드 크기를 확인할 수 없습니다.');hash.update(chunk);fs.writeSync(fd,chunk);}
   fs.closeSync(fd);fd=undefined;
   if(hash.digest('hex')!==release.sha512)throw Error('다운로드 파일의 무결성 검증에 실패했습니다.');
   fs.renameSync(temp,target);
   fs.writeFileSync(path.join(key,'PROVENANCE.json'),JSON.stringify({...release,source:'https://antigravity.google/cli/install.ps1'},null,2));
   onProgress('Gemini 연결 파일 준비 완료. Google 계정 연결을 확인하고 있습니다…');
   return target;
  }catch(error){throw Error('Gemini 연결 파일 준비 실패: '+(error.name==='AbortError'?'다운로드 시간이 초과되었습니다.':error.message)+' 인터넷 연결을 확인하고 로그인 또는 연결 확인으로 다시 시도하세요.');}
  finally{clearTimeout(timer);if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(temp);}catch{}}
 })();
 pending.set(key,work);try{return await work;}finally{pending.delete(key);}
}
module.exports={RELEASE,defaultDirectory,findRuntime,ensureRuntime};
