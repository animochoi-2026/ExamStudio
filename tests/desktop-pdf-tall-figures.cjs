'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
if(!process.versions.electron){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const r=require('node:child_process').spawnSync(require('electron'),[__filename],{env,stdio:'inherit',windowsHide:true,timeout:120000});if(r.error)throw r.error;process.exitCode=r.status??1;
}else{
 const {app,BrowserWindow}=require('electron'),dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'tall-figures-'));
 app.setPath('userData',path.join(dir,'profile'));app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});
 app.whenReady().then(async()=>{
  const node=(id,type,more)=>({id,type,parentId:null,origin:'printed',align:'left',widthRatio:1,inlines:[],...more});
  const paragraph=(id,text)=>node(id,'paragraph',{inlines:[{kind:'text',text,label:'',border:'none',widthEm:0,align:'left',origin:'printed'}]});
  const fixture={title:'긴 문항 그림 유지 검사',settings:{workspaceLines:0},questions:[{id:'fixture',kind:'original',body:'긴 문항',choices:[],answer:'2',solution:'정답은 2입니다.',layoutMode:'structure',layoutDocument:{version:1,features:['interleavedFlow'],nodes:[paragraph('intro','첫 번째 조건입니다.'),node('figure','figure',{figureId:'figure',diagram:{points:[{name:'A',x:0,y:0},{name:'B',x:2,y:0},{name:'C',x:1,y:2}],segments:[{from:'A',to:'B'},{from:'B',to:'C'},{from:'C',to:'A'}]}}),...Array.from({length:65},(_,i)=>paragraph('line'+i,'조건 '+i+' 삼각형의 조건을 확인합니다.')),paragraph('end','마지막조건유지확인') ]}}]};
  const inputs=process.env.EXAM_TEST_TALL_SNAPSHOTS?JSON.parse(process.env.EXAM_TEST_TALL_SNAPSHOTS).map(file=>JSON.parse(fs.readFileSync(file,'utf8'))):[fixture];
  for(const [i,snapshot]of inputs.entries()){
   const output=path.join(dir,String(i));fs.mkdirSync(output);const file=path.join(output,'snapshot.json');fs.writeFileSync(file,JSON.stringify(snapshot));
   const result=await require('../app/pdf-export.cjs').exportPdf({BrowserWindow,snapshotPath:file,directory:output,target:path.join(output,'output.pdf')});
   const report=JSON.parse(fs.readFileSync(path.join(output,'pdf-layout.json')));assert(report.pages.flatMap(p=>p.positions.flat()).some(p=>p.fragment),'Actual tall-question fragmentation exercised');
   const html=fs.readFileSync(path.join(output,'print.html'),'utf8');assert(html.includes('data:image/'),'Figure assets retained after fragmentation');
   const pdfPath=typeof result==='string'?result:result.path;assert(fs.readFileSync(pdfPath).subarray(0,5).equals(Buffer.from('%PDF-')));
   if(!process.env.EXAM_TEST_TALL_SNAPSHOTS)assert(html.includes('마지막조건유지확인'));
   console.log(JSON.stringify({index:i,pages:report.pages.length,bytes:fs.statSync(pdfPath).size,pdf:pdfPath}));
  }
  app.quit();
 }).catch(e=>{console.error(e);app.exit(1);});
}
