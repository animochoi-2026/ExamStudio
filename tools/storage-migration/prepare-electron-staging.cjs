'use strict';
// Creates one artificial local project. Does not authenticate, upload, call AI, or touch existing profiles.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ProjectStore,id}=require('../../app/store.cjs');
(async()=>{
 const base=path.resolve('tests/artifacts/r2-freeze'),dir=path.join(base,'electron-'+crypto.randomUUID());
 fs.mkdirSync(dir,{recursive:true});
 const source=path.join(dir,'R2-TEST-2026-중1-방정식.png');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="900" height="400"><rect width="900" height="400" fill="white"/><text x="60" y="70" font-size="25">R2 TEST - ARTIFICIAL FILE ONLY</text><text x="60" y="180" font-size="42">x + 1 = 3</text><text x="60" y="280" font-size="28">Find x. Answer: 2</text></svg>';
 await require('sharp')(Buffer.from(svg)).png().toFile(source);
 const store=new ProjectStore(dir);let p=store.create(source);
 p=store.addRegion({projectId:p.id,region:{page:1,x:0,y:0,width:1,height:1},imageDataUrl:'data:image/png;base64,'+fs.readFileSync(source).toString('base64')});
 p=store.updateProblem(p.id,p.problems[0].id,q=>{
  q.recognition={...require('../../tests/workflow-fixtures.cjs').recognition(),body:'$x+1=3$일 때 $x$의 값을 구하시오.',conditions:[],marks:[],observedDiagram:null,confirmed:true};
  q.original={id:id(),kind:'original',body:'$x+1=3$일 때 $x$의 값을 구하시오.',choices:[],statementBox:[],answer:'$2$',solution:'양변에서 1을 빼면 $x=2$이다.',diagram:null,include:true,approval:{status:'approved',method:'manual_user_authorized'},needsReview:false};
 });
 const result={directory:dir,projectId:p.id,source,productionData:false,aiCalls:0};
 fs.writeFileSync(path.join(base,'electron-staging-session.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(()=>{console.error('ARTIFICIAL_PROJECT_PREPARATION_FAILED');process.exitCode=1;});
