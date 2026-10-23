'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../app/modern-minimal.cjs'),F=require('../app/paper-form-model.cjs'),L=require('../app/exam-layout.js');
test('modern catalog and custom form preserve account data and embedded selection',()=>{
 const original={...F.builtin('modern-minimal'),academyName:'검증학원',logo:'data:fixture',minutes:37,typeLabel:'B2',roundLabel:'3회'};
 const {saved,forms}=F.saveForm(F.catalog(),original,'saved:modern');
 assert.equal(saved.name,'저장한 모던 미니멀');assert.equal(F.catalog(forms).length,4);assert.deepEqual(F.catalog(forms).at(-1),saved);assert.equal(F.selectedId(saved,F.catalog(forms)),saved.id);assert.equal(original.id,'builtin:modern-minimal');
 assert.equal(M.bodySize({paperForm:original}),9.6);assert.equal(M.bodySize({paperForm:original,bodyFontSize:13}),13);
 assert.equal(M.points({showOriginalPoints:true},{points:7,originalPoints:4}),7);assert.equal(M.points({showOriginalPoints:false},{points:7}),null);assert.equal(M.points({showOriginalPoints:true},{}),null);
});
test('only written group starts advance, short answer and mixed sets retain original types/order',()=>{
 const rows=Array.from({length:6},(_,i)=>({questionId:'q'+i}));const types=['single_choice','single_value','written_response','proof','single_choice','서술형'];
 assert.deepEqual([...M.sectionStarts(rows,types)],[2,5]);rows[2].questionSet={members:[{questionId:'q1'},{questionId:'q2'}]};assert.deepEqual([...M.sectionStarts(rows,types)],[5]);assert.equal(types[1],'single_value');assert.equal(M.responseType({questionType:'단답형'},{content:{responseType:'서술형'}}),'단답형');assert.equal(M.isWritten(M.responseType({responseType:'single_value'},{content:{responseType:'written_response'}})),false);
});
test('continuous flow advances right then next page and preserves connected groups',()=>{
 const items=[80,80,80,50,40,50].map((height,i)=>({questionId:'q'+i,height,...(i===3?{breakBefore:'column'}:{})}));
 const r=L.paginateQuestionAreas(items,{height:200,flow:'continuous'},10);
 assert.deepEqual(r.pages.map(p=>p.columns.map(c=>c.map(q=>q.questionId))),[[['q0','q1'],['q2']],[['q3','q4','q5'],[]]]);
 assert.deepEqual(r.pages[1].columns[0].map(q=>q.top),[0,60,110]);assert.deepEqual(r.overflows,[]);
 const set={members:[{questionId:'b'},{questionId:'c'}]},group=L.paginateQuestionAreas([{questionId:'a',height:100},{questionId:'b',height:60,questionSet:set},{questionId:'c',height:60,questionSet:set}],{height:200,flow:'continuous'},10);
 assert.deepEqual(group.pages[0].columns.map(c=>c.map(q=>q.questionId)),[['a'],['b','c']]);
});
test('oversize fragments and shorter first page keep all content and do not create blank pages',()=>{
 const fragmenter={next(cursor,capacity,index){return {height:150,element:null,fragment:{index},next:cursor+1,done:index===2};}};
 const r=L.paginateQuestionAreas([{questionId:'long',height:500,fragmenter},{questionId:'end',height:20}],{firstHeight:180,height:200,flow:'continuous'},10);
 assert.deepEqual(r.pages.flatMap(p=>p.columns.flat()).map(q=>q.questionId),['long','long','long','end']);assert.equal(r.pages.length,2);
 assert.deepEqual(L.paginateQuestionAreas([{questionId:'bad',height:300}],{height:200,flow:'continuous'}).overflows,['bad']);
});
test('real desktop bridge preserves recorded types and uses the modern score setting without source edits',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),file=path.resolve(__dirname,'../app/main.cjs'),source=fs.readFileSync(file,'utf8');
 const start=source.indexOf('function documentQuestion('),end=source.indexOf('\nasync function buildDocument(',start),context=vm.createContext({require:createRequire(file)});
 vm.runInContext(source.slice(start,end)+';globalThis.convert=documentQuestion;',context);
 const q={id:'q',sourceId:'q',kind:'original',body:'원문 그대로',answer:'3',solution:'풀이',questionType:'서술형',originalPoints:7},before=JSON.stringify(q);
 const on=context.convert(q,'teacher',{template:'modern-minimal',showOriginalPoints:true}),off=context.convert(q,'teacher',{template:'modern-minimal',showOriginalPoints:false});
 assert.equal(on.questionType,'서술형');assert.equal(on.originalPoints,7);assert.equal(off.originalPoints,null);assert.equal(on.pointsAtBodyEnd,false);assert.equal(JSON.stringify(q),before);
});
