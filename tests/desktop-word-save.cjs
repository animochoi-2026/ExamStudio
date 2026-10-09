'use strict';
if(process.versions.electron)require('./desktop-workflow.cjs');else{
 const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
 const root=path.resolve(__dirname,'..'),runtime=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies');
 const {_electron}=require(path.join(runtime,'node/node_modules/playwright'));
 (async()=>{
  const supplied=process.env.EXAM_VERIFY_PROJECT;
  if(!supplied)throw Error('EXAM_VERIFY_PROJECT must name a read-only source project JSON');
  const original=fs.readFileSync(supplied),project=JSON.parse(original),dir=fs.mkdtempSync(path.join(root,'data/validation/word-save-'));
  const projectDir=path.join(dir,'projects',project.id);fs.mkdirSync(projectDir,{recursive:true});fs.writeFileSync(path.join(projectDir,'project.json'),original);fs.cpSync(path.join(path.dirname(supplied),'assets'),path.join(projectDir,'assets'),{recursive:true});
  const output=path.join(dir,'word-save-verified.docx');
  const app=await _electron.launch({executablePath:require('electron'),args:[__filename],env:{...process.env,EXAM_DATA_DIR:dir,EXAM_TEST_EXPORT:output,EXAM_PYTHON:path.join(runtime,'python/python.exe')}});
  try{
   const page=await app.firstWindow();await page.waitForFunction(()=>!!window.exam);
   const result=await page.evaluate(id=>window.exam.exportDocument({projectId:id,format:'docx',audience:'teacher'}),project.id);
   assert.ok(fs.statSync(result.path).size>1000);assert.equal(result.format,'docx');
   const snapshot=JSON.parse(fs.readFileSync(result.snapshotPath,'utf8'));assert.equal(snapshot.questions.length,project.problems.flatMap(p=>[p.original,...p.variants]).filter(q=>q?.include).length);
   assert.ok(fs.readFileSync(supplied).equals(original));
   fs.writeFileSync(path.join(root,'tests/artifacts/word-save-verification.json'),JSON.stringify({ok:true,mode:'real Electron export, real Python DOCX, copied user project, no AI calls',...result,questionCount:snapshot.questions.length},null,2));
   console.log(JSON.stringify({path:result.path,questions:snapshot.questions.length,warnings:result.warnings}));
  }finally{await app.close();}
 })().catch(e=>{console.error(e);process.exitCode=1;});
}
