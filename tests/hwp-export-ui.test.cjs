'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app/renderer.js'),'utf8').split('\n').find(line=>line.startsWith('async function exportDocument('));
async function render(result){
 const dialog={children:[],append(...items){this.children.push(...items);}},status={};let title,subtitle;
 const context=vm.createContext({state:{project:{id:'test'}},updateControls(){},$:()=>status,toast(){},
  api:{exportDocument:async()=>result,openPath:async()=>{}},
  openDialog:(a,b)=>{title=a;subtitle=b;return dialog;},
  element:(tag,cls,text)=>({tag,text,append(){}}),button:(label,cls,fn)=>({label,fn}),guarded:fn=>fn});
 vm.runInContext(source,context);await vm.runInContext("exportDocument('hwpx')",context);
 return{title,subtitle,labels:dialog.children.map(x=>x.label).filter(Boolean)};
}
test('HWPX save failure is not displayed as a completed Word export',async()=>{
 await assert.rejects(render({path:'backup.docx',format:'docx',success:false,error:'native package failed',warnings:[]}),/native package failed/);
});
test('direct HWPX success offers a manual open action without opening automatically',async()=>{
 const view=await render({path:'output.hwpx',format:'hwpx',success:true,warnings:[]});
 assert.equal(view.title,'한글 HWPX를 저장했습니다');assert.equal(view.subtitle,'EXPORT COMPLETE');
 assert.ok(view.labels.includes('저장한 문서 열기'));
});
