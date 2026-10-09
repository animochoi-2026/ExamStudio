'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {pickSourceFiles}=require('../app/source-picker.cjs');
test('source picker remembers A then B, cancellation preserves B, a new process restores B',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'exam-source-picker-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const data=path.join(root,'profile'),a=path.join(root,'A'),b=path.join(root,'B');for(const d of [a,b])fs.mkdirSync(d);
 const options={title:'Files',properties:['openFile','multiSelections']},calls=[];let result;
 const dialog={showOpenDialog:async(_w,o)=>{calls.push(o);return result;}};
 result={canceled:false,filePaths:[path.join(a,'one.pdf'),path.join(a,'two.pdf')]};assert.deepEqual(await pickSourceFiles(dialog,null,data,options),result.filePaths);assert.equal(calls.at(-1).defaultPath,undefined);
 result={canceled:true,filePaths:[]};assert.equal(await pickSourceFiles(dialog,null,data,options),null);assert.equal(calls.at(-1).defaultPath,a);
 result={canceled:false,filePaths:[path.join(b,'three.pdf')]};await pickSourceFiles(dialog,null,data,options);assert.equal(calls.at(-1).defaultPath,a);
 result={canceled:true,filePaths:[]};await pickSourceFiles(dialog,null,data,options);assert.equal(calls.at(-1).defaultPath,b);
 const script=`require(${JSON.stringify(require.resolve('../app/source-picker.cjs'))}).pickSourceFiles({showOpenDialog:async(w,o)=>{console.log(JSON.stringify(o));return {canceled:true}}},null,${JSON.stringify(data)},${JSON.stringify(options)})`;
 const fresh=JSON.parse(cp.execFileSync(process.execPath,['-e',script],{encoding:'utf8'}));assert.equal(fresh.defaultPath,b);assert.deepEqual(fresh.properties,['openFile','multiSelections']);
 assert.equal(JSON.parse(fs.readFileSync(path.join(data,'source-picker.json'))).lastDirectory,b);
 fs.rmdirSync(b);await pickSourceFiles(dialog,null,data,options);assert.equal(calls.at(-1).defaultPath,undefined);
});
