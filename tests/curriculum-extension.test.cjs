'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),C=require('../app/curriculum.js'),{validateScope,scopeText}=require('../app/rules.cjs'),M=require('../app/bank-exam-model.cjs');
const metadata=(id,conditions=[],deps=[])=>({source:{grade:C.leaves.find(n=>n.id===id)?.grade},classification:{primaryUnit:{id},scopeEvidence:{conditionUnitIds:conditions,solutions:[{id:'s1',unitIds:[id],dependencyUnitIds:deps,text:'보존할 풀이'}]}}});
test('printed ranges distinguish subjects and repeated elementary semester titles',()=>{
 const {scopeLabel}=require('../web-bank/exam-form-model.cjs');
 const high=scopeLabel(['h2-common1-3.2','h2-probability-1.1']);assert.match(high,/공통수학1/);assert.match(high,/확률과 통계/);
 const elementary=scopeLabel([...C.descendants('e6-u1'),...C.descendants('e6-u7')]);assert.match(elementary,/1학기/);assert.match(elementary,/2학기/);
 assert.equal(scopeLabel(C.descendants('m2-u7')),'사각형의 성질');
});
test('five additional grades have usable units and roundtrip through saved scope',()=>{
 assert.deepEqual(C.tree.map(n=>n.id),['e5','e6','m1','m2','m3','h1','h2','h3']);
 assert.equal(new Set(C.leaves.map(n=>n.id)).size,C.leaves.length);
 for(const grade of ['e5','e6','h1','h2','h3']){
  const ids=C.descendants(grade);assert.ok(ids.length>20,grade);
  const scope=C.build(ids,{extraForbidden:['벡터 사용 금지'],restrictions:'원본 조건 유지'});
  assert.deepEqual(validateScope(JSON.parse(JSON.stringify(scope))),scope);
  assert.deepEqual(C.infer(scope).ids,ids);assert.ok(scope.forbidden.includes('벡터 사용 금지'));
  assert.ok(M.scopeFit(metadata(ids[0]),ids).ok);
 }
 assert.equal(C.gradeKey('초등학교 6학년'),'e6');assert.equal(C.gradeKey('고등학교 2학년'),'h2');
});
test('earlier lessons remain available, later or forbidden concepts are rejected',()=>{
 assert.ok(M.scopeFit(metadata('e5-2.2',['e5-1.1']),['e5-2.2']).ok);
 assert.equal(M.scopeFit(metadata('e5-2.2',['e6-1.1']),['e5-2.2']).ok,false);
 assert.equal(M.scopeFit(metadata('e5-2.2',['e5-1.1']),['e5-2.2'],['e5-1.1']).ok,false);
 assert.equal(M.scopeFit(metadata('m2-6.3',['h1-common1-1.1']),['m2-6.3']).ok,false);
 assert.ok(M.scopeFit(metadata('h2-algebra-2.1',['h1-common2-1.1']),['h2-algebra-2.1']).ok);
 assert.equal(M.scopeFit(metadata('h2-algebra-2.1',['h2-probability-1.1']),['h2-algebra-2.1']).ok,false);
 assert.equal(M.scopeFit(metadata('h2-algebra-2.1',['h2-algebra-3.1']),['h2-algebra-2.1']).ok,false);
 assert.ok(M.scopeFit(metadata('h3-calculus2-1.1',['h2-calculus1-2.1']),['h3-calculus2-1.1']).ok);
 assert.equal(M.scopeFit(metadata('h3-calculus2-1.1',['h2-calculus1-2.1']),['h3-calculus2-1.1'],['h3-calculus1-2.1']).ok,false);
});
test('same subject is selectable in every high grade, with no cross-grade question substitution',()=>{
 for(const g of ['h1','h2','h3'])assert.equal(C.tree.find(n=>n.id===g).children.length,15);
 assert.equal(M.scopeFit(metadata('h1-common1-1.1'),['h2-common1-1.1']).ok,false);
 assert.equal(M.scopeFit({source:{grade:'고2'},classification:{primaryUnit:{name:'순열과 조합'}}},['h2-probability-1.1']).ok,false,'ambiguous course names require stored unit IDs');
 const rows=[{question_id:'middle',metadata:metadata('m2-6.3')}];
 assert.equal(M.inspectCandidates(rows,{units:['e5-1.1']}).eligible.length,0);
 const result=M.selectQuestions(rows,{count:1,units:['e5-1.1']});assert.equal(result.complete,false);assert.equal(result.items.length,0);
});
test('the evidence wire version remains accepted by current SQL without relaxing its checks',()=>{
 const sql=fs.readFileSync('supabase/migrations/202610010016_teacher_review.sql','utf8');
 assert.ok(sql.includes("e->>'taxonomyVersion' is distinct from '"+C.version+"'"));
 assert.equal(C.catalogVersion,'school-math-2022-v2');
 for(const id of ['e5-1.1','h1-common1-1.1'])assert.equal(C.build([id]).curriculum.version,C.version);
 assert.doesNotMatch(scopeText(C.build(['e5-1.1'])),/중2 삼각형·사각형의 성질을 학습한 범위까지/);
});
