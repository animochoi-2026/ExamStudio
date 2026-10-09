'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){
 const {spawnSync}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const result=spawnSync(require('electron'),[__filename],{env,stdio:'inherit',windowsHide:true,timeout:90000});
 if(result.error)throw result.error;process.exitCode=result.status??1;
}else{
 const {app,BrowserWindow}=require('electron');
 const dir=fs.mkdtempSync(path.join(root,'data/validation/pdf-units-'));
 app.setPath('userData',path.join(dir,'profile'));app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});
 app.whenReady().then(async()=>{
  const {exportPdf}=require('../app/pdf-export.cjs');
  const snapshot={title:'길이 단위 PDF 출력 확인',settings:{workspaceLines:0},questions:[{
   kind:'original',body:String.raw`다음 그림에서 점 $I$는 삼각형 $ABC$의 내심이다. 점 $D$, $E$는 각각 변 $AB$, $AC$ 위에 있고, 선분 $DE$는 점 $I$를 지나며 $\overline{BC}\parallel\overline{DE}$이다. $\overline{DB}=13\text{ cm}$, $\overline{BC}=42\text{ cm}$, $\overline{CE}=15\text{ cm}$이고 내접원의 반지름의 길이가 $12\text{ cm}$일 때, 사각형 $DBCE$의 넓이를 구하시오.`,
   statementBox:[String.raw`단위 확인: $13\text{ cm}$, $\frac{13}{2}\text{ cm}$`],
   choices:[String.raw`$13\text{ cm}$`,String.raw`$42\mathrm{cm}^{2}$`],
   answer:String.raw`$13\text{ cm}$`,solution:String.raw`출력 확인용 풀이입니다. 길이 단위는 $13\text{ cm}$입니다.`+'\n'+String.raw`분수와 제곱도 확인합니다: $\frac{13}{2}\text{ cm}$, $42\text{ cm}^{2}$.`
  }]};
  const input=path.join(dir,'snapshot.json');fs.writeFileSync(input,JSON.stringify(snapshot));
  await exportPdf({BrowserWindow,snapshotPath:input,directory:dir,target:path.join(dir,'units.pdf')});
  const win=new BrowserWindow({show:false,width:900,height:1000,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  try{
   await win.loadFile(path.join(dir,'print.html'));
   await win.webContents.executeJavaScript('document.fonts.ready.then(()=>true)');
   const measurements=await win.webContents.executeJavaScript(`(()=>{
    document.body.style.width='182mm';
    return [...document.querySelectorAll('.katex .text')].filter(n=>n.textContent.trim()==='cm').map(n=>{
     const chars=[],walker=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let t;
     while(t=walker.nextNode())for(let i=0;i<t.length;i++)if(/\\S/.test(t.data[i])){
      const r=document.createRange();r.setStart(t,i);r.setEnd(t,i+1);const b=r.getBoundingClientRect();chars.push({text:t.data[i],x:b.x,y:b.y});
     }
     return {chars,whiteSpace:getComputedStyle(n).whiteSpace};
    });
   })()`);
   assert.ok(measurements.length>=10,'exercise body, statement box, choices, quick answers and detailed solutions');
   for(const m of measurements){
    assert.equal(m.whiteSpace,'nowrap','prose wrapping must not override KaTeX unit text');
    assert.equal(m.chars.map(c=>c.text).join(''),'cm');
    assert.ok(Math.abs(m.chars[0].y-m.chars[1].y)<0.5,'c and m must share one line');
    assert.ok(m.chars[1].x>m.chars[0].x,'unit letters must flow horizontally');
   }
   fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify(measurements,null,2));
  }finally{win.destroy();}
  console.log('PASS PDF cm units remain horizontal in all text roles: '+path.join(dir,'units.pdf'));app.quit();
 }).catch(e=>{console.error(e);app.exit(1);});
}
