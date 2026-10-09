'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const curriculum=require('../app/curriculum.js');

test('school choices follow the selected curriculum leaves and source exam, without guessing unknown units',async()=>{
 const {questionMatchesScope,matchingSourceSchools}=await import('../web-bank/exam-scope-schools.js');
 const external=new Set(['m2-6.3']),internal=new Set(['m2-6.4']);
 const match={metadata:{source:{grade:'중2'},classification:{primaryUnit:{id:'m2-6.3',name:'삼각형의 외심'}}}};
 const sameName={metadata:{source:{grade:'중2'},classification:{primaryUnit:{name:'삼각형의 외심'}}}};
 const unknown={metadata:{source:{grade:'중2'},classification:{primaryUnit:null}}};
 assert.equal(questionMatchesScope(match,external),true);
 assert.equal(questionMatchesScope(sameName,external),true);
 assert.equal(questionMatchesScope(match,internal),false);
 assert.equal(questionMatchesScope(unknown,external),false);
 const sources=[{source_id:'a',source:{school:'광희중'}},{source_id:'b',source:{school:'다른중'}},{source_id:'c',source:{school:'광희중'}}],questions=new Map([['a',[match]],['b',[unknown]],['c',[sameName]]]);
 assert.deepEqual(matchingSourceSchools(sources,questions,external),[{school:'광희중',examCount:2,questionCount:2}]);
 const selected=new Set(curriculum.toggle([],'m2-u6',true));
 assert.ok(selected.has('m2-6.3'));
 assert.equal(curriculum.state([...selected],'m2-u6').checked,true);
});

test('source exam average is shown only when every current question has a score',async()=>{
 const {sourceDifficultyStatus}=await import('../web-bank/source-difficulty.js');
 const confirmed=score=>({confirmed:{difficulty:score},metadata:{}}),suggested=score=>({confirmed:{},metadata:{difficulty:{aiScore:score,criteriaVersion:require('../app/difficulty-assessment.cjs').version}}}),missing={confirmed:{},metadata:{difficulty:{}}};
 assert.equal(sourceDifficultyStatus([confirmed('7.0'),confirmed('7.8')]),'평균 난이도 7.4 · 공동 확정');
 assert.equal(sourceDifficultyStatus([confirmed('7.0'),suggested('7.8')]),'평균 난이도 7.4 · 잠정 평가 포함');
 assert.equal(sourceDifficultyStatus([confirmed('7.0'),missing]),'난이도 평가 중 · 1/2문항');
 assert.equal(sourceDifficultyStatus([missing]),'난이도 미평가');
 assert.equal(sourceDifficultyStatus([{metadata:{difficulty:{aiScore:'7.8'}}}]),'난이도 미평가','retired criteria never returns as a current recommendation');
});
