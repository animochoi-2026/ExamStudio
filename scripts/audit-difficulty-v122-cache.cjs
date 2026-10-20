'use strict';
// Inventory all required data and referenced images before the formal corpus gate.
const fs=require('node:fs'),path=require('node:path');
const {createCache}=require('./difficulty-v122-cache.cjs');
const C=require('../app/difficulty-v122/canonical.cjs');
const base=path.resolve(__dirname,'../artifacts/difficulty-v122-rc1');
const out=process.argv[2]?path.resolve(process.argv[2]):base;
fs.mkdirSync(out,{recursive:true});
const snapshot=path.join(base,'corpus-snapshot');
const pages=fs.readdirSync(snapshot).filter(n=>/^page-\d+\.json$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
const rows=pages.flatMap(n=>JSON.parse(fs.readFileSync(path.join(snapshot,n),'utf8')));
const cache=createCache(),failures=[],results=[];
for(const row of rows){
 const errors=[],files=[];
 try{
  const data=row.files.find(f=>f.role==='data');
  if(!data)throw Error('native_source_missing');
  const bundle=JSON.parse(cache.read(data));files.push(data.id);
  if(bundle.questionId!==row.question_id||bundle.revisionId!==row.revision_id)throw Error('source_revision_mismatch');
  const native=bundle.native,problem=native?.project?.problems?.find(p=>[p.original,...(p.variants||[])].some(q=>q?.id===native.targetQuestionId));
  const question=[problem?.original,...(problem?.variants||[])].find(q=>q?.id===native?.targetQuestionId);
  if(!question)throw Error('native_question_missing');
  const refs=[...(problem.cropPaths||[]),question.sourceFigure?.path,...(question.sourceFigures||[]).map(f=>f.path)].filter(Boolean);
  for(const ref of new Set(refs)){
   try{
    if(!ref.startsWith('bank-asset:'))throw Error('unresolved_image_reference');
    const asset=row.files.find(f=>f.role==='asset'&&f.key===ref.slice(11));
    if(!asset)throw Error('source_image_missing:'+ref);
    cache.read(asset);files.push(asset.id);
   }catch(e){errors.push({error:e.message,candidates:e.candidates||[]});}
  }
 }catch(e){errors.push({error:e.message,candidates:e.candidates||[]});}
 const result={question_id:row.question_id,revision_id:row.revision_id,files,errors};
 results.push(result);
 if(errors.length)failures.push({...result,source:row.metadata.source});
}
const inventory=cache.report(),directories={};
for(const file of inventory.verified_files){
 const dir=path.dirname(file.path);directories[dir]=(directories[dir]||0)+1;
}
const report={at:new Date().toISOString(),total:rows.length,passed:rows.length-failures.length,
 failed:failures.length,verified_files:inventory.verified_files.length,directories,
 snapshot_pages:pages.map(n=>({file:n,sha256:C.bytesHash(fs.readFileSync(path.join(snapshot,n)))})),
 failures,inventory,results,actualAIcalls:0,productionWrites:0,computerUse:0};
fs.writeFileSync(path.join(out,'cache-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,inventory:undefined,results:undefined,snapshot_pages:undefined},null,2));
if(failures.length)process.exitCode=1;
