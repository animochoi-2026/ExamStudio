'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
if(!process.versions.electron){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const run=require('node:child_process').spawnSync(require('electron'),[__filename],{env,stdio:'inherit',windowsHide:true,timeout:120000});if(run.error)throw run.error;process.exitCode=run.status??1;
}else{
 const {app,BrowserWindow}=require('electron'),dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'workspace-flow-'));
 app.setPath('userData',path.join(dir,'profile'));app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});
 app.whenReady().then(async()=>{
  const question={id:'boundary',kind:'original',body:Array.from({length:20},(_,i)=>`조건${i}를 확인합니다.`).join('\n'),choices:['선택하나','선택둘'],answer:'1',solution:'풀이',layout:'auto'};
  async function measure(name,q){const output=path.join(dir,name);fs.mkdirSync(output);const file=path.join(output,'snapshot.json');fs.writeFileSync(file,JSON.stringify({title:'긴 문항 이어 배치',settings:{workspaceLines:0},questions:[q]}));return require('../app/pdf-export.cjs').exportPdf({BrowserWindow,snapshotPath:file,directory:output,measureOnly:true});}
  const normal=await measure('normal',question);assert(normal.report.heights[0]<normal.report.available);assert(!normal.report.pages.flatMap(p=>p.positions.flat()).some(p=>p.fragment));
  const workspaceMm=(normal.report.available-normal.report.heights[0]+20)*25.4/96;
  const boundary=await measure('workspace',{...question,workspaceMm});assert(boundary.report.heights[0]>boundary.report.available);
  const fragments=boundary.report.pages.flatMap(p=>p.positions.flat()).filter(p=>p.fragment);assert(fragments.length>0,'Workspace overflow must use measured flow, not reject a valid question');
  let cursor=0;for(const p of fragments){assert.equal(p.fragment.start,cursor);cursor=p.fragment.end;}assert.equal(cursor,fragments.at(-1).fragment.total,'Every content unit must be retained exactly once');
  const text=fragments.flatMap(p=>p.fragment.layoutDocument.nodes.flatMap(n=>n.inlines.map(x=>x.text))).join('');for(let i=0;i<20;i++)assert(text.includes(`조건${i}를 확인합니다.`));assert(text.includes('선택하나')&&text.includes('선택둘'));
  const long=await measure('long',{...question,body:Array.from({length:100},(_,i)=>`긴조건${i}을 보존합니다.`).join('\n')});assert(long.report.pages.flatMap(p=>p.positions.flat()).filter(p=>p.fragment).length>2);
  fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({normalPages:normal.report.pages.length,boundaryFragments:fragments.length,longPages:long.report.pages.length}));process.stdout.write('PASS short / workspace boundary / multi-column content retention\n');app.quit();
 }).catch(e=>{process.stderr.write(e.stack+'\n');app.exit(1);});
}
