'use strict';
// Private PDF backend only. Public web releases still use canonical-release deploy.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const canonical=require('./canonical-release.cjs'),root=path.resolve(__dirname,'..');
async function main(){
 const before=canonical.assertBaseline(root,{clean:true}),common=cp.execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
 const release=canonical.acquireLock(path.join(common,'examstudio-production.lock'));let dispatched=false,verified=false;
 try{
  canonical.verify(root);await canonical.checkAssets(before.manifest.web.url,before.manifest.web.assets);
  const after=canonical.assertBaseline(root,{clean:true});if(after.head!==before.head||after.authority?.commit!==before.authority?.commit)throw Error('검사 중 공식 소스가 변경됐습니다.');
  const args=['--yes','wrangler@4.149.0','deploy','--config','services/pdf-renderer/wrangler.jsonc'];
  dispatched=true;const run=process.platform==='win32'?cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','& npx.cmd --yes wrangler@4.149.0 deploy --config services/pdf-renderer/wrangler.jsonc; exit $LASTEXITCODE'],{cwd:root,windowsHide:true,stdio:'inherit'}):cp.spawnSync('npx',args,{cwd:root,stdio:'inherit'});
  if(run.error||run.status!==0)throw Error('PDF 서버 배포 결과를 확인해야 합니다.');
  const response=await fetch('https://examstudio-pdf-renderer.realspy1234.workers.dev',{method:'POST',body:'{}',signal:AbortSignal.timeout(30000)});if(response.status!==403)throw Error('PDF 서버 익명 접근 차단 검증 실패');
  fs.writeFileSync(path.join(common,'examstudio-pdf-renderer.json'),JSON.stringify({sourceCommit:before.head,verifiedAt:new Date().toISOString(),anonymousStatus:403},null,2));verified=true;
 }finally{if(!dispatched||verified)release();else console.error('PDF 서버 배포 결과 미확인: 운영 잠금을 유지합니다.');}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
