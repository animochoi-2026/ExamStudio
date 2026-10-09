'use strict';
// Offline, high-resolution KaTeX rendering used only for HWP 2018 compatibility.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const FONT_PT_BY_ROLE = { problem:12, answer:9 };

function splitMath(text) {
  const found=[];
  for(let i=0;i<text.length;) {
    if(text.startsWith('\\$',i)){i+=2;continue;}
    const open=['$$','$','\\[','\\('].find(token=>text.startsWith(token,i));
    if(!open){i++;continue;}
    const close={'\\[':'\\]','\\(':'\\)'}[open]||open;
    const start=i+open.length;let end=start;
    while(end<text.length&&!text.startsWith(close,end)) {
      end+=text[end]==='\\'&&!close.startsWith('\\')?2:1;
    }
    if(end>=text.length)throw new Error('HWP 호환 수식의 구분 기호가 닫히지 않았습니다.');
    const latex=text.slice(start,end).trim();
    if(!latex)throw new Error('HWP 호환 수식이 비어 있습니다.');
    found.push({latex,display:open==='$$'||open==='\\['}); i=end+close.length;
  }
  return found;
}

function equationPlan(snapshot) {
  if(!snapshot||!Array.isArray(snapshot.questions))throw new Error('HWP 호환 문서 입력이 잘못되었습니다.');
  const questions=snapshot.questions.filter(question=>question.include!==false);
  const formulas=[];
  const append=(value,fontPt,answer=false)=>formulas.push(...splitMath(value||'').map(f=>({...f,display:answer?false:f.display,fontPt})));
  for(const question of questions)for(const value of [question.body,...(question.statementBox||[]),...(question.choices||[])])append(value,12);
  for(const question of questions)append(question.answer,9);
  for(const question of questions){append(question.answer,9,true);append(question.solution,9);}
  return formulas.map((formula,index)=>({part:'word/document.xml',index,...formula}));
}

async function renderEquationImages({BrowserWindow,snapshotPath,outputDir}) {
  const snapshot=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
  const plan=equationPlan(snapshot);
  const dir=path.resolve(outputDir);
  fs.mkdirSync(dir,{recursive:true});
  const katexDir=path.dirname(require.resolve('katex'));
  const css=pathToFileURL(path.join(katexDir,'katex.min.css')).href;
  const js=pathToFileURL(path.join(katexDir,'katex.min.js')).href;
  const htmlPath=path.join(dir,'renderer.html');
  fs.writeFileSync(htmlPath,`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src file:; style-src file: 'unsafe-inline'; font-src file:; img-src 'none'; connect-src 'none'"><link rel="stylesheet" href="${css}"><style>html,body{margin:0;background:#fff;color:#000}#line{position:absolute;left:16px;top:16px;font:56px/normal 'Times New Roman';white-space:nowrap}#equation{display:inline-block}#baseline{display:inline-block;width:0;height:0;vertical-align:baseline}.katex{font-size:1em!important;color:#000}.katex-display{display:inline-block;margin:0;text-align:left}.katex-display>.katex{display:inline-block}</style></head><body><span id="line"><span id="equation"></span><span id="baseline"></span></span><script src="${js}"></script></body></html>`,'utf8');
  const win=new BrowserWindow({show:false,width:1800,height:1200,backgroundColor:'#ffffff',skipTaskbar:true,
    webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false,offscreen:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  let timer;
  const execute=async()=>{
    await win.loadFile(htmlPath);
    const images=[];
    for(const formula of plan) {
      const box=await win.webContents.executeJavaScript(`(async()=>{
        const element=document.getElementById('equation');
        document.getElementById('line').style.fontSize=${JSON.stringify(`${formula.fontPt*96/72*4}px`)};
        katex.render(${JSON.stringify(formula.latex)},element,{displayMode:${formula.display},throwOnError:true,trust:false,strict:'error',output:'html',maxExpand:1000});
        element.getBoundingClientRect(); // Start any newly needed local font loads.
        await document.fonts.ready;
        // capturePage may otherwise capture the previous compositor frame.
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const r=element.getBoundingClientRect();
        const baseline=document.getElementById('baseline').getBoundingClientRect().top;
        const x=Math.floor(r.x)-2,y=Math.floor(r.y)-2;
        return {x,y,width:Math.ceil(r.right)+2-x,height:Math.ceil(r.bottom)+2-y,baseline};
      })()`);
      if(!Object.values(box).every(Number.isFinite)||box.width<=0||box.height<=0||box.width>1600||box.height>1050)
        throw new Error('HWP 호환 수식이 출력 범위를 넘습니다. 긴 수식을 여러 줄로 나누어 주세요.');
      const image=await win.webContents.capturePage({x:box.x,y:box.y,width:box.width,height:box.height},{stayHidden:true});
      if(image.isEmpty())throw new Error('HWP 호환 수식 이미지가 비어 있습니다.');
      const file=`equation-${String(images.length+1).padStart(4,'0')}.png`;
      fs.writeFileSync(path.join(dir,file),image.toPNG());
      images.push({...formula,file,widthPt:box.width*72/96/4,heightPt:box.height*72/96/4,
        depthPt:Math.max(0,(box.y+box.height-box.baseline)*72/96/4)});
    }
    const manifestPath=path.join(dir,'equation-images.json');
    fs.writeFileSync(manifestPath,JSON.stringify({version:1,fontPtByRole:FONT_PT_BY_ROLE,dpi:384,images},null,2),'utf8');
    return manifestPath;
  };
  try {
    return await Promise.race([execute(),new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('HWP 수식 이미지 준비 시간이 초과되었습니다.')),120000);
    })]);
  } finally {clearTimeout(timer);if(!win.isDestroyed())win.destroy();}
}

module.exports={renderEquationImages,equationPlan,splitMath};
