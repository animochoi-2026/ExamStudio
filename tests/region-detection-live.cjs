'use strict';
// Explicit live smoke test. One generated page; never run as part of npm test.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {ProjectStore}=require('../app/store.cjs'),{RegionDetector}=require('../app/region-detector.cjs'),{CodexBridge}=require('../app/codex.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.resolve('data/validation/regions-live-')),file=path.join(dir,'sample.png');
 const svg='<svg width="1200" height="1600" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="1600" fill="white"/><g font-family="Arial" font-size="28" fill="black"><text x="70" y="90">Mathematics practice</text><text x="70" y="210">1. Find x in the triangle.</text><text x="70" y="570">A) 30  B) 40  C) 50  D) 60</text><text x="70" y="900">2. Solve the equation for x.</text><text x="110" y="980">3x + 5 = 20</text><text x="70" y="1100">A) 3  B) 4  C) 5  D) 6</text></g><path d="M120 490 L330 270 L480 490 Z" fill="none" stroke="black" stroke-width="3"/><g font-family="Arial" font-size="24"><text x="148" y="473">60°</text><text x="325" y="330">70°</text><text x="425" y="470">x</text></g></svg>';
 const bytes=await require('sharp')(Buffer.from(svg)).png().toBuffer();fs.writeFileSync(file,bytes);
 const store=new ProjectStore(path.join(dir,'data')),project=store.create(file),bridge=new CodexBridge({cwd:store.projectsDir,onEvent:e=>{if(e.type==='chat-status'&&e.text)console.log(e.text);}});
 const detector=new RegionDetector({store,getBridge:()=>bridge,getSettings:()=>({model:'gpt-6-astra',effort:'medium'})});
 try{
  const result=await detector.run({projectId:project.id,sourceId:'primary',page:1,imageDataUrl:'data:image/png;base64,'+bytes.toString('base64'),provider:'codex',requestId:'regions-'+crypto.randomUUID()});
  fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(result,null,2));
  assert.equal(result.regions.length,2,'The live provider should find both questions');assert.ok(result.regions[0].y<result.regions[1].y);
  for(const r of result.regions){const crop=await require('sharp')(bytes).extract({left:Math.floor(r.x*1200),top:Math.floor(r.y*1600),width:Math.min(Math.floor(r.width*1200),1200-Math.floor(r.x*1200)),height:Math.min(Math.floor(r.height*1600),1600-Math.floor(r.y*1600))}).png().toBuffer();store.addRegion({projectId:project.id,region:{...r,page:1,sourceId:'primary'},imageDataUrl:'data:image/png;base64,'+crop.toString('base64')});}
  assert.equal(store.get(project.id).problems.length,2);console.log('PASS live GPT region detection, actual schema validation and persisted two question crops');console.log(dir);
 }finally{bridge.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
