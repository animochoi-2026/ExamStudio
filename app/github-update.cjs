'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const REPO='animochoi-2026/ExamStudio',RELEASES=`https://github.com/${REPO}/releases`;
function version(value){if(!/^\d+\.\d+\.\d+$/.test(value))throw Error('업데이트 버전 형식이 올바르지 않습니다.');return value.split('.').map(Number);}
function newer(a,b){const x=version(a),y=version(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;}
function assetUrl(url,tag){const u=new URL(url);if(u.origin!=='https://github.com'||!u.pathname.startsWith(`/${REPO}/releases/download/${tag}/`)||u.username||u.password||u.search||u.hash)throw Error('공식 배포 파일 주소가 아닙니다.');return u.href;}
async function json(url,fetchImpl=fetch){const r=await fetchImpl(url,{headers:{Accept:'application/vnd.github+json','User-Agent':'ExamStudio-Updater'},signal:AbortSignal.timeout(30000)});if(r.status===404)return null;if(!r.ok)throw Error(r.status===403?'GitHub 요청 한도에 도달했습니다. 잠시 후 다시 확인하세요.':`업데이트 서버 응답 오류 (${r.status})`);const body=await r.text();if(body.length>1000000)throw Error('업데이트 정보가 너무 큽니다.');return JSON.parse(body);}
function validateManifest(m,release){
 if(!m||m.schema!==1||m.platform!=='win32-x64'||release.tag_name!==`v${m.version}`)throw Error('배포 정보와 버전이 일치하지 않습니다.');version(m.version);
 if(m.asset!==`ExamStudio-${m.version}-win32-x64.zip`||!/^[a-f0-9]{64}$/.test(m.sha256)||!Number.isSafeInteger(m.size)||m.size<=0||m.size>2000000000)throw Error('업데이트 파일 검증 정보가 올바르지 않습니다.');
 const a=release.assets.find(a=>a.name===m.asset&&a.state==='uploaded');if(!a||a.size!==m.size)throw Error('업데이트 파일 업로드가 완료되지 않았습니다.');
 return {...m,url:assetUrl(a.browser_download_url,release.tag_name)};
}
class GithubUpdater{
 constructor({current,root,dataDir,packaged,fetchImpl=fetch,onProgress=()=>{}}){Object.assign(this,{current,root,dataDir,packaged,fetchImpl,onProgress});this.offer=null;this.pending=null;this.active=false;this.catalog=new Map();this.checking=null;}
 async check(){
  if(this.active)throw Error('업데이트 파일을 준비하고 있습니다.');
  if(this.checking)return this.checking;
  this.checking=this.loadVersions();try{return await this.checking;}finally{this.checking=null;}
 }
 async loadVersions(){
  const releases=[];this.catalog.clear();this.offer=null;
  for(let page=1;;page++){
   if(page>20)throw Error('배포 목록이 너무 큽니다. 정리를 중단했습니다.');
   const rows=await json(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`,this.fetchImpl);
   if(rows===null)break;if(!Array.isArray(rows))throw Error('배포 목록을 확인하지 못했습니다.');releases.push(...rows);if(rows.length<100)break;
  }
  const ready=releases.filter(r=>!r.draft&&!r.prerelease&&/^v\d+\.\d+\.\d+$/.test(r.tag_name)&&Array.isArray(r.assets)&&['update.json',`ExamStudio-${r.tag_name.slice(1)}-win32-x64.zip`].every(n=>r.assets.some(a=>a.name===n&&a.state==='uploaded')));
  ready.sort((a,b)=>newer(a.tag_name.slice(1),b.tag_name.slice(1))?-1:newer(b.tag_name.slice(1),a.tag_name.slice(1))?1:0);
  const retained=ready.slice(0,3),latest=retained[0]?.tag_name.slice(1)||null,previous=retained.find(r=>newer(this.current,r.tag_name.slice(1)))?.tag_name.slice(1)||null;
  const choices=retained.map(release=>{
   const v=release.tag_name.slice(1);this.catalog.set(v,release);
   return {key:v,label:`v${v}`,version:v,installable:true,installed:v===this.current,latest:v===latest,rollback:newer(this.current,v),size:release.assets.find(a=>a.name===`ExamStudio-${v}-win32-x64.zip`)?.size||0,notes:String(release.body||'').slice(0,12000)};
  });
  try{for(const release of this.catalog.values()){
   const asset=release.assets.find(a=>a.name==='update.json');
   const manifest=validateManifest(await json(assetUrl(asset.browser_download_url,release.tag_name),this.fetchImpl),release);
   if(manifest.version===latest)this.offer=manifest;
  }}catch(error){this.catalog.clear();throw error;}
  // No pruning after a missing/incomplete catalog or in a development checkout.
  const cleanup=this.packaged&&latest?require('./update-retention.cjs').pruneUpdates({dataDir:this.dataDir,root:this.root,versions:[this.current,...choices.map(c=>c.version)],protectedDirectory:this.pending?.directory}):{removed:0,skipped:0};
  this.latest=latest;
  return {current:this.current,latest,previous,available:!!latest&&newer(latest,this.current),empty:!latest,packaged:this.packaged,choices,cleanup};
 }
 async download(selectedVersion){
  if(!this.packaged)throw Error('개발본에서는 자동 교체하지 않습니다. GitHub에서 배포판을 받아 실행하세요.');
  const selected=selectedVersion||this.latest,release=this.catalog.get(selected);
  if(this.active||this.checking||!release)throw Error('먼저 버전 목록에서 설치할 버전을 선택하세요.');this.active=true;this.pending=null;let zip;
  try{
   const manifest=release.assets.find(a=>a.name==='update.json'&&a.state==='uploaded');
   const offer=validateManifest(await json(assetUrl(manifest.browser_download_url,release.tag_name),this.fetchImpl),release);this.offer=offer;
   fs.mkdirSync(path.join(this.dataDir,'updates'),{recursive:true});
   const directory=fs.mkdtempSync(path.join(this.dataDir,'updates','download-'));zip=path.join(directory,'release.zip');
   const r=await this.fetchImpl(offer.url,{signal:AbortSignal.timeout(30*60*1000)});if(!r.ok||!r.body)throw Error('업데이트 파일을 다운로드하지 못했습니다.');
   let bytes=0,last=0;const hash=crypto.createHash('sha256');
   await pipeline(Readable.fromWeb(r.body),new Transform({transform:(chunk,encoding,callback)=>{bytes+=chunk.length;if(bytes>offer.size)return callback(Error('다운로드 크기가 배포 정보와 다릅니다.'));hash.update(chunk);if(Date.now()-last>500){last=Date.now();this.onProgress({type:'update-progress',received:bytes,total:offer.size});}callback(null,chunk);}}),fs.createWriteStream(zip,{flags:'wx'}));
   if(bytes!==offer.size||hash.digest('hex')!==offer.sha256)throw Error('다운로드 파일의 무결성 검증에 실패했습니다. 기존 프로그램은 변경하지 않았습니다.');
   const plan={root:path.resolve(this.root),zip,sha256:offer.sha256,version:offer.version,sourceVersion:this.current,parentPid:process.pid,restart:true};
   const planPath=path.join(directory,'plan.json'),script=path.join(directory,'apply-update.ps1');fs.writeFileSync(planPath,JSON.stringify(plan));fs.copyFileSync(path.join(__dirname,'../scripts/apply-update.ps1'),script);this.pending={planPath,script,directory};return {ready:true,version:offer.version};
  }catch(e){try{fs.unlinkSync(zip);}catch{}throw e;}finally{this.active=false;}
 }
}
module.exports={GithubUpdater,newer,validateManifest,assetUrl,REPO,RELEASES};
