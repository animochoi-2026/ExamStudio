'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');
for(const code of ['app','phase2-desktop/app'])test(code+' export preserves question number, points, space and manual placement without rewriting source',()=>{
 const file=path.join(root,code,'main.cjs'),source=fs.readFileSync(file,'utf8'),start=source.indexOf('function documentQuestion('),end=source.indexOf('\nasync function buildDocument(',start),context=vm.createContext({require:createRequire(file)});
 vm.runInContext(source.slice(start,end)+';globalThis.convert=documentQuestion;',context);
 const q={id:'saved-q',sourceId:'source',kind:'original',body:'함수 $f(x)=x^2$의 값을 구하시오.',answer:'4',solution:'값을 대입한다.',include:true,printedNumber:'서답형 2',originalPoints:7,pointsAtBodyEnd:true,workspaceMm:35,breakBefore:'column',webChoiceColumns:1,layout:'auto',choices:['1','2']};
 const before=JSON.stringify(q),result=context.convert(q,'teacher');
 for(const field of ['printedNumber','originalPoints','pointsAtBodyEnd','workspaceMm','breakBefore','webChoiceColumns'])assert.equal(result[field],q[field],field+' was lost between saved question and export');
 assert.equal(result.body,q.body);assert.equal(result.answer,q.answer);assert.equal(result.solution,q.solution);assert.equal(JSON.stringify(q),before);
});
