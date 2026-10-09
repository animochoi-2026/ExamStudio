'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),katex=require('katex');
const {compose,definitions}=require('../app/rules.cjs');
const {cleanRecognition}=require('../app/workflow.cjs');
const {recognition}=require('./workflow-fixtures.cjs');

test('blank policy survives customized recognition rules and applies to downstream tasks',()=>{
 const modules=Object.values(definitions).map(m=>m.id==='recognition.common'?{...m,content:'사용자 맞춤 인식 규칙'}:m);
 for(const task of ['recognition','generation','revision','solve','validation']){
  const c=compose({task,domains:['geometry'],modules});
  assert.match(c.instructions,/빈칸 채우기 원문 보존/);
  assert.match(c.instructions,/기존 인쇄 밑줄·상자·괄호가 있으면 유지/);
  assert.match(c.instructions,/여백 낙서·채점·별도 필기 풀이/);
  assert.match(c.instructions,/answer\/solution에만 분리/);
  if(task==='recognition')assert.match(c.instructions,/사용자 맞춤 인식 규칙/);
 }
 assert.equal(modules.find(m=>m.id==='recognition.common').content,'사용자 맞춤 인식 규칙');
});

test('empty answer underlines render without hidden answers in math markup',()=>{
 for(const latex of [String.raw`AB=\underline{\qquad}`,String.raw`\angle B=\underline{\qquad\qquad}`]){
  const html=katex.renderToString(latex,{throwOnError:true});
  assert.match(html,/underline-line/);
  assert.doesNotMatch(html,/katex-error/);
 }
});

test('recognized blanks survive cleaning without copying handwriting into conditions',()=>{
 const raw=recognition();raw.body=String.raw`사다리꼴 ABCD에서 $AB=\underline{\qquad}$이다. 이유: $\underline{\qquad\qquad}$`;
 const before=structuredClone(raw),out=cleanRecognition(raw,{cropPaths:[],regions:[{page:1,x:0,y:0,width:1,height:1}]},1);
 assert.equal(out.body,raw.body);assert.deepEqual(raw,before);
 assert.equal(out.conditions.length,1);assert.equal(out.excludedConditions[0].origin,'handwritten');
});
