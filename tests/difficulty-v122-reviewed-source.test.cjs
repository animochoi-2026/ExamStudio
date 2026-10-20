'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../app/difficulty-v122/canonical.cjs'),I=require('../app/difficulty-v122/input.cjs'),Source=require('../app/difficulty-v122/source.cjs');
const Review=require('../app/difficulty-v122/source-review.cjs'),Aggregation=require('../app/difficulty-v122/legacy-aggregation-targets.cjs');
const {inspect}=require('../scripts/diagnose-difficulty-v122-saved.cjs');
const base=path.resolve(__dirname,'../artifacts/difficulty-v122-rc1/baseline/shindong-m2-three-stage-20261020');
const json=f=>JSON.parse(fs.readFileSync(f)),manifest=json(path.join(base,'manifest.json'));
function saved(number){
 const item=manifest.find(x=>x.number===number),context=json(path.join(base,item.contextFile));
 const final=json(path.join(base,'run-three-stage',item.id,'final.json'));
 return {item,context,final,stage:json(path.join(base,'run-three-stage',item.id,'stage-'+final.finalStage,'result.json'))};
}
function input(number){const {item,context}=saved(number);return {question_id:item.id,revision_id:item.revisionId,
 question:context.question,difficulty_basis_hash:context.difficulty_basis_hash,approved_routes:context.approved_routes};}
test('all imported source role annotations match pinned original registry hashes',()=>{
 const dir=path.resolve(base,'../shindong-luna-reference-validator-execution-audit-20261020');
 for(const r of require('../app/difficulty-v122/source-reference-reviews.json').reviews){
  assert.equal(C.bytesHash(fs.readFileSync(path.join(dir,'registries',r.question_id+'.json'))),r.parent_registry_sha256);
  const scope=Review.apply(input(manifest.find(x=>x.id===r.question_id).number));
  assert(scope.approved_routes.every(a=>a.reviewed_spans.length));
 }
});
test('source review rejects modified question at the same scoped identity',()=>{
 const x=structuredClone(input('2'));x.question.body+=' changed';assert.throws(()=>Review.apply(x),/question hash mismatch/);
});
test('source review rejects modified approved solution at the same scope',()=>{
 const x=structuredClone(input('2'));x.approved_routes[0].solution_excerpt+=' changed';assert.throws(()=>Review.apply(x),/basis text hash mismatch/);
});
test('different revision does not inherit prior source roles',()=>{
 const x=structuredClone(input('2'));x.revision_id+='different';assert.equal(Review.apply(x),x);
});
test('different basis does not inherit prior source roles',()=>{
 const x=structuredClone(input('2'));x.difficulty_basis_hash+='different';assert.equal(Review.apply(x),x);
});
test('inline subquestions preserve source sequence and distinct scopes',()=>{
 const s=Source.targetSources({body:'앞 조건. (1) 첫 목표. (2) 다음 목표. (3) 마지막 목표.'});
 assert.deepEqual(s.map(x=>x.label),['(1)','(2)','(3)']);assert(s[0].end<=s[1].start);
});
test('saved second item optional post-check maps without changing score or work',()=>{
 const x=saved('2'),before=C.hash(x);const r=inspect(x.item,x.context,x.stage,x.final);
 assert.equal(r.status,'passed');assert.equal(r.evaluated.computed.score,4.6);
 assert(r.evaluated.computed.projection.excluded_explanation_ids.includes('d7'));assert.equal(C.hash(x),before);
});
test('multi-target answer collection retains its graph and remains non-scoring',()=>{
 const x=saved('11'),r=inspect(x.item,x.context,x.stage,x.final);assert.equal(r.status,'passed');
 const m=r.sharedMappings.find(m=>m.scoring_excluded);assert.equal(m.contributor_target_ids.length,5);assert.equal(m.node_copies_created,0);
 const old=x.stage.raw.viable_routes[0].critical_discoveries.find(n=>n.id===m.analysis_node_id);
 const next=r.migrated_response.viable_routes[0].critical_discoveries.find(n=>n.id===m.analysis_node_id);
 assert.deepEqual(next.depends_on,old.depends_on);assert.deepEqual(next.work,old.work);
 assert.equal(r.evaluated.computed.assembly_triggered,false);
});
test('aggregation cannot create targets from an orphan node',()=>{
 assert.throws(()=>Aggregation.resolve({critical_discoveries:[],targets:[]},
  {role:'answer_aggregation',target_statement_id:'main',depends_on:[]},{targets:[]},{allowed_roles:['answer_aggregation']}),/no completed target/);
});
test('source role conflict stays a failure instead of broadening roles',()=>{
 const x=saved('14'),r=inspect(x.item,x.context,x.stage,x.final);
 assert(r.issues.some(i=>i.error==='source_role_target_mismatch'));assert.equal(r.evaluated,null);
});
test('shared premise is not cloned or lowered by compatibility mapping',()=>{
 const x=saved('1'),r=inspect(x.item,x.context,x.stage,x.final);assert.equal(r.status,'passed');
 assert(r.sharedMappings.length);for(const m of r.sharedMappings)assert.equal(m.node_copies_created,0);
 const a=x.stage.raw.viable_routes[0].critical_discoveries,b=r.migrated_response.viable_routes[0].critical_discoveries;
 assert.equal(a.length,b.length);
 for(let i=0;i<a.length;i++)for(const k of ['C','R','B','H','depends_on','role','work'])assert.deepEqual(a[i][k],b[i][k]);
});
test('shared alias must retain the original source identity',()=>{
 const x=saved('1'),r=inspect(x.item,x.context,x.stage,x.final);
 assert.equal(r.status,'passed');
 const raw=structuredClone(r.migrated_response),route=raw.viable_routes[0];
 const origin=route.critical_discoveries.find(n=>n.role==='shared_premise');
 assert(origin);
 const alias={...structuredClone(origin),id:'identity-regression-alias',premise_source_id:origin.id,
  work:{choice_check_count:0,required_case_count:0,calculation_steps:0,calculation_depends_on:[]}};
 route.critical_discoveries.push(alias);
 const context=r.prepared.payload;
 const Ref=require('../app/difficulty-v122/references.cjs');
 assert.equal(Ref.audit(raw,context),true);
 alias.shared_premise_ids=[];
 assert.throws(()=>Ref.audit(raw,context),/premise alias source identity mismatch/);
});
