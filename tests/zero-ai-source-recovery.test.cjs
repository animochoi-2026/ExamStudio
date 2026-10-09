'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const I=require('../app/source-inventory.cjs'),{reconcile,diagnostic}=require('../app/queue-numbering.cjs'),{splitSourcePoints}=require('../app/question-text.cjs');
const manifest={total:22,objectiveCount:18,writtenCount:4,confirmed:true};
test('closed printed brackets preserve section and subquestion identity without merging labels',()=>{
 for(const [value,section,key] of [['[논술형 2]','written','written:2'],['[논술형 4-1]','written','written:4-1'],['[논술형 4(1)]','written','written:4(1)'],['[1]','objective','objective:1']]){const n=I.number(value,section);assert.equal(n.key,key);assert.equal(n.raw,value);}
 assert.notEqual(I.number('1','objective').key,I.number('[논술형 1]','written').key);
 for(const value of ['[논술형 2','논술형 2]','[논술형 2][논술형 3]','[논술형 2 또는 3]'])assert.equal(I.number(value,'written').key,null);
 assert.equal(I.number('[논술형 2]','objective').key,null);
 const inventory=I.inventory([{questionId:'a',source:{originalNumber:'1',numbering:{section:'objective'}}},{questionId:'b',source:{originalNumber:'[논술형 1]',numbering:{section:'written'}}}],{total:2,objectiveCount:1,writtenCount:1,confirmed:true});assert.equal(inventory.distinct,2);assert.deepEqual(inventory.duplicates,[]);
});
test('confirmed counts resolve absent header wording only, preserving literal identity and real warnings',()=>{
 for(const [number,section,evidence] of [['8','objective','시험 전체 문항 수를 명시한 표기는 이 영역에 없습니다.'],['16','objective','전체 또는 영역별 문항 수를 명시한 표시는 없다.'],['논술형 1','written','시험 전체 또는 영역별 문항 수는 제시되지 않았습니다.'],['[논술형 2]','written','전체 및 영역별 문항 수는 보이지 않음.'],['[논술형 4]','written','전체 및 유형별 문항 수는 보이지 않는다.']]){
  const r={originalNumber:number,body:'unchanged',version:3,sourceNumbering:{section,evidence,total:null,objectiveCount:null,writtenCount:null,uncertain:true},uncertainties:[{text:diagnostic},{text:'diagram unreadable'}]};
  const next=reconcile(r,manifest,I.number(number,section).key);assert.ok(next);assert.equal(next.sourceNumbering.total,22);assert.equal(next.originalNumber,number);assert.equal(next.body,r.body);assert.equal(next.version,3);assert.deepEqual(next.uncertainties,[{text:'diagram unreadable'}]);assert.equal(next.aiSourceNumbering.evidence,evidence);
  assert.equal(reconcile({...r,sourceNumbering:{...r.sourceNumbering,evidence:evidence+' 번호가 불확실합니다.'}},manifest,I.number(number,section).key),null);
 }
});
test('explicit printed score with numeric math delimiters is separated without inventing missing points',()=>{
 assert.deepEqual(splitSourcePoints('본문 ($4.5$점)'),{body:'본문',points:4.5,original:'본문 ($4.5$점)'});
 assert.equal(splitSourcePoints('본문 [$6$점]').points,6);
 for(const value of ['조건 ($4.5$)','조건 $4.5$점','조건 ($4.5$점]','조건 ($x$점)','조건 ($4.5+1$점)'])assert.equal(splitSourcePoints(value).points,null);
 assert.equal(splitSourcePoints('조건 $4.5$를 구하라. (5.2점)').points,5.2);
});
