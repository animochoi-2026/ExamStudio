'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Source=require('../app/difficulty-v122/source.cjs'),Input=require('../app/difficulty-v122/input.cjs');
const Legacy=require('../app/difficulty-v122/legacy-resolver.cjs');
const build=q=>Input.prepare({question_id:'q',revision_id:'r',question:q,scope:{grade:'중2'},
 difficulty_basis:'승인된 관계로 각 보기를 판단한다.',approved_routes:[{route_id:'approved-main',source:'confirmed_solution',solution_excerpt:'승인된 관계로 각 보기를 판단한다.'}]});
test('formula-only equalities receive separate stable source IDs',()=>{
 const q={body:'옳지 않은 것은?',choices:['① $\\angle BAD=25^\\circ$','② $\\triangle ACD=15$']};
 const a=build(q),b=build(q);
 assert.equal(a.registry.targets.length,2);assert.deepEqual(a.registry,b.registry);
 for(const choice of q.choices)assert.equal(Legacy.resolve(choice,a.registry.targets).status,'resolved');
 assert.equal(new Set(a.registry.targets.map(t=>t.source_span_id)).size,2);
});
test('symbolic and LaTeX relations without prose are judgment targets',()=>{
 for(const choices of [['① $AB\\parallel CD$','② $AB\\perp BC$'],['① $x\\leq 3$','② $x>5$'],['① $\\triangle ABC\\sim\\triangle DEF$','② $AB≅CD$']]){
  assert.equal(Source.targetSources({body:'항상 성립하는 것은?',choices}).length,2);
 }
});
test('mixed prose and formula judgments retain each choice',()=>{
 assert.equal(Source.targetSources({body:'옳은 것은?',choices:['① $AB=CD$','② 마름모이다.']}).length,2);
});
test('scalar numerical answers remain a single target',()=>{
 for(const body of ['사각형의 성질을 이용하여 각의 크기를 구하시오.','계산 결과로 옳은 것은?']){
  const result=Source.targetSources({body,choices:['① $25^\\circ$','② $\\frac{3}{2}$','③ $\\sqrt{2}$']});
  assert.equal(result.length,1);assert.equal(result[0].label,'main');
 }
});
test('nonjudgment equation answer alternatives keep the existing single target',()=>{
 assert.equal(Source.targetSources({body:'방정식의 해를 구하시오.',choices:['① $x=1$','② $x=2$']})[0].label,'main');
});
test('target IDs remain scoped to revision',()=>{
 const q={body:'옳은 것은?',choices:['① $a=b$','② $a>b$']},a=build(q);
 const m=Source.build({question_id:'q',revision_id:'other',difficulty_basis_hash:a.identities.difficulty_basis_hash,question:q,
  approved_routes:[{route_id:'approved-main',source:'confirmed_solution',solution_excerpt:'승인된 관계로 각 보기를 판단한다.'}]});
 assert(a.registry.targets.every(t=>!m.targets.some(x=>x.id===t.id)));
});
test('preserved Shindong first item exposes all five approved choice targets',()=>{
 const base=path.resolve(__dirname,'../artifacts/difficulty-v122-rc1/baseline/shindong-m2-three-stage-20261020');
 const item=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')))[0];
 const context=JSON.parse(fs.readFileSync(path.join(base,item.contextFile)));
 const targets=Source.targetSources(context.question);
 assert.equal(targets.length,5);
 assert.deepEqual(targets.map(t=>t.text),context.question.choices);
});
