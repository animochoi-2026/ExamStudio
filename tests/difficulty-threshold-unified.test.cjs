'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../app/difficulty-assessment.cjs'),Desktop=require('../app/desktop-difficulty.cjs'),P=require('../app/difficulty-policy.cjs'),Cache=require('../app/assessment-cache.cjs');
const assessment=score=>({score,band:null,status:'estimated',reason:'조건 연결 부담',features:Object.fromEntries(D.features.map(k=>[k,'평가 근거']))});
test('one scoring boundary in both AI prompt paths; legacy band calculation stays local',()=>{
 const bankInstructions=require('node:fs').readFileSync(require.resolve('../app/bank-analysis.cjs'),'utf8').match(/const instructions=`([\s\S]*?)`;/)[1];
 for(const text of [D.instructions,D.instructionsForScope({}),bankInstructions]){
  assert.match(text,/하 3\.0 이하, 중 3\.0 초과 8\.0 미만, 상 8\.0 이상/);
  assert.doesNotMatch(text,/6\.5|4구간|하 난도\(4 미만/);
  assert.match(text,/band는 null/);
 }
 assert.match(D.instructions,/가중 점수식이 아닙니다/);
 assert.match(D.instructions,/체크 개수에 따른 점수식·최저점 보장이 아니/);
 const values=[0,3,3.1,6.5,7.9,8,9,10];
 assert.deepEqual(values.map(Desktop.band),['하','하','중','중','중','상','상','상']);
 assert.deepEqual(values.map(n=>D.compositionBand({metadata:{difficulty:{aiScore:String(n),criteriaVersion:D.version}}})),['low','low','middle','middle','middle','high','high','high']);
});
test('null compatibility band validates and records without changing raw score or response',()=>{
 for(const n of ['0.0','3.0','3.1','6.5','7.9','8.0','9.0','10.0']){
  const a=assessment(n),before=JSON.stringify(a),normalized=D.normalize(a);
  assert.equal(normalized.status,'estimated');assert.equal(normalized.score,n);assert.equal(normalized.band,D.band(n));assert.deepEqual(normalized.contradictions,[]);assert.equal(JSON.stringify(a),before);
  const saved=Cache.record(a,{body:'問題',solution:'풀이'},{},{},{});assert.equal(saved.score,n);assert.equal(saved.band,D.band(n));
 }
 assert.equal(D.normalize(assessment('10.1')).status,'format_error');
 assert.equal(D.normalize(assessment('7.55')).status,'format_error');
 assert.equal(D.normalize({...assessment(null),status:'deferred'}).status,'deferred');
 assert.equal(D.normalize({...assessment('4.0'),band:'아주어려움'}).contradictions.length,1,'invalid non-null legacy replies still detected');
});
test('saved assessments, proof cap, teacher priority and legacy distributions remain unchanged',()=>{
 const q={body:'합동임을 증명하시오.',solution:'증명'},a=Cache.record({...assessment('6.8'),band:D.band('6.8')},q,{},{});
 const row={content:q,metadata:{difficulty:{aiScore:'6.8',criteriaVersion:D.version,assessment:a,proofAdjustment:P.adjustment(q,'6.8')}}};
 const before=JSON.stringify(row);for(let i=0;i<3;i++){assert.equal(Desktop.effective(row).number,8.8);assert.equal(Desktop.effective(row).rawAI,6.8);assert.equal(Desktop.effective(row).band,'상');}
 assert.equal(JSON.stringify(row),before);row.confirmed={difficulty:'3.0'};assert.equal(Desktop.effective(row).number,3);assert.equal(Desktop.effective(row).band,'하');
 assert.equal(P.adjustment(q,'9.5').score,10);assert.equal(P.adjustment({body:'계산하시오.'},'6.8').delta,0);
 assert.equal(D.normalize(a).status,'estimated');assert.equal(D.normalize(a).contradictions.length,0);
});
