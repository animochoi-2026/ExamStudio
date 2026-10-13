'use strict';
// Shared release entry point. No AI calls, database writes or desktop installation.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function git(root,args){return cp.execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).trim();}
function json(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function common(root){return git(root,['rev-parse','--path-format=absolute','--git-common-dir']);}
function authority(root){const file=path.join(common(root),'examstudio-current.json');return fs.existsSync(file)?json(file):null;}
function ancestor(root,base,head){try{git(root,['merge-base','--is-ancestor',base,head]);return true;}catch{return false;}}
function assertDeployedAncestor(root,commit,head){if(!commit||!ancestor(root,commit,head))throw Error('직전 운영 배포의 변경이 누락되었습니다. 직전 배포 커밋을 통합한 뒤 다시 검증하세요.');}
function policy(root){const a=authority(root);return a?JSON.parse(git(root,['show',`${a.commit}:release/canonical.json`])):json(path.join(root,'release/canonical.json'));}
function assertBaseline(root=ROOT,{clean=false,revision='HEAD'}={}){
 const a=authority(root),m=policy(root),head=git(root,['rev-parse',revision]);
 for(const base of [...m.requiredAncestors,...(a?[a.commit]:[])])if(!ancestor(root,base,head))throw Error(`최신 공식 기준 누락: ${base}. 기존 작업을 보존하고 ${a?.checkout||'공식 기준 브랜치'}의 변경을 merge하세요.`);
 const pins=a?JSON.parse(git(root,['show',`${a.commit}:release/contracts.json`])):json(path.join(root,'release/contracts.json'));
 for(const [file,hash]of Object.entries(pins.protectedFiles)){
  const bytes=revision==='HEAD'?fs.readFileSync(path.join(root,file)):cp.execFileSync('git',['show',`${head}:${file}`],{cwd:root,windowsHide:true});
  // Git-normalized LF: avoid treating checkout CRLF conversion as a contract change.
  if(digest(bytes.toString('utf8').replace(/\r\n/g,'\n'))!==hash)throw Error(`보존 계약 변경: ${file}. 기대값 완화 대신 별도 계약 검토와 기준 갱신이 필요합니다.`);
 }
 if(clean&&git(root,['status','--porcelain','--untracked-files=normal']))throw Error('배포는 변경사항이 커밋된 깨끗한 작업 트리에서만 가능합니다.');
 return {head,authority:a,manifest:m,contracts:pins};
}
function run(root,command,args,options={}){
 const r=cp.spawnSync(command,args,{cwd:root,stdio:'inherit',windowsHide:true,...options});
 if(r.error||r.status!==0)throw Error(`${path.basename(command)} 검사/명령 실패 (${r.status}): ${r.error?.message||args[0]}`);
}
function verify(root=ROOT){
 const info=assertBaseline(root),p=info.contracts;
 run(root,process.execPath,['--test',...p.nodeTests]);
 run(root,process.execPath,['scripts/run-export-checks.cjs']);
 return info;
}
function acquireLock(file){
 let fd;try{fd=fs.openSync(file,'wx');}catch(e){if(e.code==='EEXIST')throw Error('다른 운영 배포가 진행 중이거나 이전 배포 결과가 미확인입니다. 잠금을 자동 삭제하지 마세요: '+file);throw e;}
 fs.writeFileSync(fd,JSON.stringify({pid:process.pid,at:new Date().toISOString(),host:require('node:os').hostname()}));fs.closeSync(fd);
 return ()=>fs.unlinkSync(file);
}
async function checkAssets(base,assets){
 const entries=Object.entries(assets);let next=0;
 await Promise.all(Array.from({length:4},async()=>{while(next<entries.length){const [file,hash]=entries[next++];const url=new URL(file,base.endsWith('/')?base:base+'/');url.searchParams.set('baselineCheck',Date.now());const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(30000)});if(!r.ok||digest(Buffer.from(await r.arrayBuffer()))!==hash)throw Error('운영 자산 변경 또는 조회 실패: '+file);}}));return entries.length;
}
function filesAt(root){let result={};for(const entry of fs.readdirSync(root,{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('배포 폴더의 링크는 허용되지 않습니다.');const full=path.join(root,entry.name);if(entry.isDirectory())for(const [key,value]of Object.entries(filesAt(full)))result[entry.name+'/'+key]=value;else result[entry.name]=digest(fs.readFileSync(full));}return result;}
function publicAssets(files){return Object.fromEntries(Object.entries(files).filter(([name])=>!['_headers','_redirects','_routes.json','_worker.js'].includes(name)&&!name.startsWith('_worker.js/')));}
async function deploy(configFile,output,root=ROOT){
 if(!configFile||!output)throw Error('deploy <공개 설정 JSON> <새 출력 폴더>');
 const info=assertBaseline(root,{clean:true});
 const release=acquireLock(path.join(common(root),'examstudio-production.lock'));
 let dispatched=false,verified=false;
 try{
  verify(root);
  const stateFile=path.join(common(root),'examstudio-production.json');
  const current=fs.existsSync(stateFile)?json(stateFile):info.manifest.web;
  assertDeployedAncestor(root,current.sourceCommit,info.head);
  await checkAssets(current.url,current.assets);
  const out=path.resolve(root,output);if(fs.existsSync(out))throw Error('출력은 존재하지 않는 새 폴더를 지정하세요.');
  run(root,process.execPath,['scripts/build-bank-web.cjs',path.resolve(root,configFile),out]);
  // Recheck after tests/build: another session must not advance the baseline or edit source meanwhile.
  const latest=assertBaseline(root,{clean:true});if(latest.head!==info.head||latest.authority?.commit!==info.authority?.commit)throw Error('검사 중 기준 커밋이 변경되었습니다.');
  const built=publicAssets(filesAt(out));
  dispatched=true;
  // No shell interpolation of paths. Windows .cmd launch uses a fixed PowerShell script and argv via environment.
  if(process.platform==='win32')run(root,'powershell.exe',['-NoProfile','-NonInteractive','-Command',"& npx.cmd --yes wrangler@4.149.0 pages deploy $env:EXAM_DEPLOY_OUT --project-name=examstudio-shared-bank --branch=main ('--commit-hash='+$env:EXAM_DEPLOY_COMMIT) --commit-dirty=false; exit $LASTEXITCODE"],{env:{...process.env,EXAM_DEPLOY_OUT:out,EXAM_DEPLOY_COMMIT:info.head}});
  else run(root,'npx',['--yes','wrangler@4.149.0','pages','deploy',out,'--project-name=examstudio-shared-bank','--branch=main','--commit-hash='+info.head,'--commit-dirty=false']);
  await checkAssets(current.url,built);
  const state={url:current.url,sourceCommit:info.head,assets:built,verifiedAt:new Date().toISOString()};
  fs.writeFileSync(stateFile+'.tmp',JSON.stringify(state,null,2)+'\n');fs.renameSync(stateFile+'.tmp',stateFile);
  verified=true;console.log('운영 자산 검증 완료. release/canonical.json과 공통 기준 갱신 후 다음 배포를 진행하세요.');
 }finally{if(!dispatched||verified)release();else console.error('배포 결과 미확인: 잠금을 유지합니다. 운영 자산을 확인하기 전 재배포하지 마세요.');}
}
function prePush(root,input){
 for(const line of input.trim().split('\n')){const fields=line.trim().split(/\s+/);if(fields.length!==4)continue;
  const [,sha,remote]=fields;if(!/^refs\/heads\/(main|codex\/canonical-current-20261013)$/.test(remote))continue;
  if(/^0+$/.test(sha))throw Error('공식 기준 브랜치를 삭제할 수 없습니다.');assertBaseline(root,{revision:sha});
 }
}
async function main(args=process.argv.slice(2)){
 const mode=args[0]||'status',root=process.cwd();
 if(mode==='status'){const a=authority(root),m=policy(root);console.log(JSON.stringify({checkout:root,head:git(root,['rev-parse','HEAD']),authority:a,includesCanonical:a?ancestor(root,a.commit,'HEAD'):null,integratedSource:m.integratedSource,web:{source:m.web.sourceCommit,deployment:m.web.deployment,assets:Object.keys(m.web.assets).length},desktop:{source:m.desktop.sourceCommit,files:Object.keys(m.desktop.assets).length,sourceDifferences:m.desktop.sourceDifferences}},null,2));}
 else if(mode==='verify'){verify(root);console.log('공통 기준 및 회귀 검사 통과');}
 else if(mode==='check'){assertBaseline(root,{clean:args.includes('--clean')});console.log('공통 기준 검사 통과');}
 else if(mode==='pre-push')prePush(root,fs.readFileSync(0,'utf8'));
 else if(mode==='deploy')await deploy(args[1],args[2],root);
 else if(mode==='verify-production'){const m=policy(root),file=path.join(common(root),'examstudio-production.json'),web=fs.existsSync(file)?json(file):m.web;console.log('운영 자산 확인:',await checkAssets(web.url,web.assets));}
 else throw Error('Unknown command: '+mode);
}
module.exports={assertBaseline,assertDeployedAncestor,ancestor,acquireLock,checkAssets,prePush,verify,filesAt,publicAssets,main};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
