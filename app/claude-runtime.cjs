'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
// Official installer: https://claude.ai/install.ps1 (checked 2026-09-29).
const RELEASE=Object.freeze({version:'2.1.284',url:'https://downloads.claude.ai/claude-code-releases/2.1.284/win32-x64/claude.exe',sha256:'0416631e846f743110da5282409776fa1313e65f33a588aae066eaf8db0fda7d',size:246480032});
const pending=new Map();
async function ensureRuntime({directory,env=process.env,fetchImpl=fetch,onProgress=()=>{},release=RELEASE}){
 if(env.EXAM_CLAUDE_PATH){const exe=env.EXAM_CLAUDE_PATH;if(!path.isAbsolute(exe)||!exe.endsWith('.exe')||!fs.statSync(exe).isFile())throw Error('EXAM_CLAUDE_PATH의 Claude 실행 파일을 확인하세요.');return exe;}
 const root=path.resolve(directory),target=path.join(root,`claude-${release.version}.exe`);
 if(fs.existsSync(target))return target;
 if(pending.has(root))return pending.get(root);
 const work=(async()=>{
  const url=new URL(release.url);
  if(url.origin!=='https://downloads.claude.ai'||url.pathname!==`/claude-code-releases/${release.version}/win32-x64/claude.exe`||url.search||url.hash||!/^\d+\.\d+\.\d+$/.test(release.version)||!/^[a-f0-9]{64}$/.test(release.sha256)||!Number.isSafeInteger(release.size)||release.size<=0)throw Error('공식 Claude 배포 정보를 확인할 수 없습니다.');
  fs.mkdirSync(root,{recursive:true});const temp=path.join(root,crypto.randomUUID()+'.download');let fd;
  try{
   onProgress('Claude 연결 파일을 처음 준비하고 있습니다. 잠시 기다려 주세요…');
   const r=await fetchImpl(release.url,{signal:AbortSignal.timeout(300000),redirect:'error'});if(!r.ok||!r.body)throw Error('Claude 다운로드에 실패했습니다. 인터넷 연결을 확인하세요.');
   fd=fs.openSync(temp,'wx');let size=0;const hash=crypto.createHash('sha256');
   for await(const chunk of r.body){size+=chunk.length;if(size>release.size)throw Error('Claude 파일 크기 검증 실패');hash.update(chunk);fs.writeSync(fd,chunk);}
   fs.closeSync(fd);fd=undefined;if(size!==release.size||hash.digest('hex')!==release.sha256)throw Error('Claude 파일 무결성 검증 실패');
   fs.renameSync(temp,target);onProgress('Claude 연결 파일 준비 완료');return target;
  }finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(temp);}catch{}}
 })();pending.set(root,work);try{return await work;}finally{pending.delete(root);}
}
module.exports={RELEASE,ensureRuntime};
