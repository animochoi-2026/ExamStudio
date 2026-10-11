'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {matchesEvidence}=require('../app/type-evidence.cjs');
const {BankAnalysis,checked}=require('../app/bank-analysis.cjs');
const question={body:'정사각형 $ABCD$와 $AE=AB$인 이등변삼각형이 있다.\n$\\angle DEB$의 크기는?',choices:['① $30^\\circ$','④ $45^\\circ$']};
const type={id:'task.angle',repeatKey:'task.angle|m2-6.1|base_angles',coreName:'밑각 비교',coreDefinition:'이등변삼각형의 밑각을 비교한다.',evidence:'“정사각형 $ABCD$”, “$\\angle DEB$의 크기는?”'};
test('literal, multiple quoted fragments and display whitespace are verified independently',()=>{
 for(const evidence of [type.evidence,'정사각형 $ABCD$','"정사각형 $ABCD$" 및 「④ $45^\\circ$」','이등변삼각형이 있다. $\\angle DEB$의 크기는?'])assert.equal(matchesEvidence(question,evidence),true,evidence);
});
test('unknown fragments, changed math/numbers, arbitrary commentary and broken quotes still fail',()=>{
 for(const evidence of ['',null,'“정사각형 $ABCD$”, “없는 조건”','“정사각형 $ABCD$” 그러므로 닮음이다','“④ $35^\\circ$”','“$AE>AB$”','“정사각형 $ABCD$','“정사각형 $ABCD$” 일부를 생략하고 “없는 내용”'])assert.equal(matchesEvidence(question,evidence),false,String(evidence));
});
test('slash-separated evidence must contain complete unchanged source fields',()=>{
 assert.equal(matchesEvidence(question,question.body+' / '+question.choices[1]),true);
 assert.equal(matchesEvidence(question,question.body+' / '+'④ $35^\\circ$'),false);
 assert.equal(matchesEvidence(question,'정사각형 $ABCD$ / $AE=AB$'),false);
});
test('regular analysis and type repair use the same evidence contract and retain content/difficulty',async()=>{
 const result=checked({originalNumber:'8',primaryUnitId:'m2-6.1',relatedUnitIds:[],conditionUnitIds:[],solutions:[],assessment:null,types:[type],typeReason:'밑각 비교'},true,undefined,question);
 assert.equal(result.types[0].evidence,type.evidence);
 assert.throws(()=>checked({originalNumber:'8',primaryUnitId:null,relatedUnitIds:[],conditionUnitIds:[],solutions:[],assessment:null,types:[{...type,evidence:'“없는 내용”'}],typeReason:'검사'},true,undefined,question),/실제 문구/);
 const q={...question,id:'q',solution:'저장된 풀이',answer:'④',queueClassification:{value:{types:[]}}},p={id:'p',original:q,regions:[]},project={id:'project',problems:[p],scope:{}},item={metadata:{source:{originalNumber:'8'},classification:{solutions:[]},difficulty:{aiScore:6}}};
 const saved=structuredClone(q),score=JSON.stringify(item.metadata.difficulty);let calls=0,saves=0;
 const analyzer=new BankAnalysis({store:{get:()=>project,updateProblem:(_,__,fn)=>fn(p)},getSettings:()=>({}),getModules:()=>[],getBridge:()=>({run:async()=>{calls++;return {result:{types:[type],typeReason:'밑각 비교'}};}})});
 await analyzer.repairTypes({ensure:()=>item,save:()=>saves++},{projectId:'project',questionId:'q'});
 assert.equal(calls,1);assert.equal(saves,1);assert.equal(item.metadata.classification.types[0].repeatKey,type.repeatKey);assert.equal(q.body,saved.body);assert.equal(q.answer,saved.answer);assert.equal(q.solution,saved.solution);assert.equal(JSON.stringify(item.metadata.difficulty),score);
 item.metadata.classification.confirmed={types:[type]};await assert.rejects(analyzer.repairTypes({ensure:()=>item},{projectId:'project',questionId:'q'}),/사용자 확정/);assert.equal(calls,1);
});
