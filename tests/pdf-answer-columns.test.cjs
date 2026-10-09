'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {documentHtml}=require('../app/pdf-export.cjs');
test('PDF answers and solutions retain source question labels after reordering',()=>{
 for(const module of ['../app/pdf-export.cjs']){
  const questions=[{kind:'original',printedNumber:'서답형 3',body:'첫 문제',answer:'A',solution:'첫 풀이',choices:[]},{kind:'original',printedNumber:'7',body:'둘째 문제',answer:'B',solution:'둘째 풀이',choices:[]}];
  for(const answerMode of ['quick','detailed']){
   const html=require(module).documentHtml({title:'번호 보존',settings:{answerMode,workspaceLines:0},questions});
   const notes=html.slice(html.indexOf('<section class="notes columns">'));
   assert.match(notes,/<div>서답형 3번  A<\/div><div>7번  B<\/div>/);
   assert.doesNotMatch(notes,/>[12]번/);
   if(answerMode==='detailed'){assert.match(notes,/<h3>서답형 3번<\/h3>/);assert.match(notes,/<h3>7번<\/h3>/);}
  }
 }
});
test('PDF preserves explicit quick-answer mode without detailed solutions',()=>{
 for(const module of ['../app/pdf-export.cjs']){
  const html=require(module).documentHtml({title:'정답 모드',settings:{answerMode:'quick',workspaceLines:0},questions:[{kind:'original',body:'문제',answer:'2',solution:'상세풀이보존검사',choices:[]}]});
  assert.match(html,/빠른 정답/);assert.doesNotMatch(html,/<h2>상세 풀이<\/h2>|상세풀이보존검사/);
 }
});
test('PDF quick answers and detailed solutions share two columns with a black repeating page rule',()=>{
 const html=documentHtml({title:'수학',settings:{workspaceLines:0},questions:[{kind:'original',body:'문제',answer:'2',solution:'풀이 마지막',choices:[]}]});
 assert.match(html,/<section class="notes columns">/);
 assert.match(html,/\.columns\{[^}]*column-count:2/);
 assert.doesNotMatch(html,/\.quick-answers\{[^}]*column-count/);
 assert.match(html,/\.notes article\{[^}]*break-inside:auto/);
 assert.match(html,/\.page-column-rule\{[^}]*position:fixed;[^}]*background:#000/);
 assert.equal((html.match(/class="page-column-rule"/g)||[]).length,1);
 assert.ok(html.indexOf('빠른 정답')<html.indexOf('상세 풀이'));
 assert.ok(html.indexOf('상세 풀이')<html.indexOf('풀이 마지막'));
 assert.match(html,/\.notes\{[^}]*break-before:page;[^}]*font-size:9pt/);
});
