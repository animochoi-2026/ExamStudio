'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../app/difficulty-v122/scorer.cjs'),Input=require('../app/difficulty-v122/input.cjs');
const {fixture}=require('./difficulty-v122-entrypoints.test.cjs');
function data(){
 const prepared=Input.prepare({question_id:'order-q',revision_id:'order-r',question:{body:'옳은 것은?',choices:['① $a=b$','② $a>b$']},
  scope:{grade:'중2'},difficulty_basis:'주어진 관계를 적용하여 각 보기를 판단한다.',
  approved_routes:[{route_id:'approved-main',source:'confirmed_solution',solution_excerpt:'주어진 관계를 적용하여 각 보기를 판단한다.'}],images:[]});
 const raw=fixture(prepared),r=raw.viable_routes[0],ordered=[...prepared.registry.targets].sort((a,b)=>a.source_order-b.source_order);
 const original=structuredClone(r.critical_discoveries);
 r.critical_discoveries=[];r.targets=[];
 for(let n=0;n<2;n++){
  const prefix='b'+n+'-';
  const nodes=structuredClone(original);
  for(const d of nodes){d.id=prefix+d.id;d.depends_on=d.depends_on.map(id=>prefix+id);d.target_statement_id=ordered[n].id;}
  r.critical_discoveries.push(...nodes);
  r.targets.push({target_statement_id:ordered[n].id,source_span_id:ordered[n].source_span_id,source_quote:ordered[n].text,conclusion_ids:[nodes.at(-1).id]});
 }
 r.conclusion_ids=r.targets.flatMap(t=>t.conclusion_ids);
 return {prepared,raw,r,ordered};
}
test('input targets carry immutable original choice order',()=>{
 const {ordered}=data();
 assert.deepEqual(ordered.map(t=>[t.label,t.source_order]),[['①',0],['②',1]]);
});
test('equal tier and score choose the first source choice despite model order',()=>{
 const {raw,prepared,r,ordered}=data();r.targets.reverse();
 const result=S.score(raw,prepared.payload);
 assert.equal(result.branch_id,ordered[0].id);
 assert.equal(result.branch_results[0].score,result.branch_results[1].score);
});
test('renaming hash IDs does not change the source choice winner',()=>{
 const {raw,prepared,r,ordered}=data();
 const renamed=new Map([[ordered[0].id,'zzzz-hash'],[ordered[1].id,'aaaa-hash']]);
 for(const t of prepared.payload.source_registry.targets)t.id=renamed.get(t.id);
 for(const t of r.targets)t.target_statement_id=renamed.get(t.target_statement_id);
 for(const d of r.critical_discoveries)d.target_statement_id=renamed.get(d.target_statement_id);
 assert.equal(S.score(raw,prepared.payload).branch_id,'zzzz-hash');
});
test('higher tier keeps priority over original source order',()=>{
 const {raw,prepared,r,ordered}=data();
 const d=r.critical_discoveries.find(d=>d.target_statement_id===ordered[1].id);
 d.C=4;d.R=4;d.B=4;d.H=4;d.is_non_obvious=true;
 const result=S.score(raw,prepared.payload);
 assert.equal(result.branch_id,ordered[1].id);
 assert(result.branch_results[0].score>result.branch_results[1].score);
});
test('missing canonical source order fails instead of falling back to hash order',()=>{
 const {raw,prepared}=data();
 delete prepared.payload.source_registry.targets[0].source_order;
 assert.throws(()=>S.score(raw,prepared.payload),/source target order missing/);
});
test('stored Shindong first item retains 4.7 T2 and choice one',()=>{
 const base=path.resolve(__dirname,'../artifacts/difficulty-v122-rc1/baseline/shindong-m2-three-stage-20261020');
 const q=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')))[0];
 const final=JSON.parse(fs.readFileSync(path.join(base,'run-three-stage',q.id,'final.json')));
 const stage=JSON.parse(fs.readFileSync(path.join(base,'run-three-stage',q.id,'stage-'+final.finalStage,'result.json')));
 const context=JSON.parse(fs.readFileSync(path.join(base,q.contextFile)));
 const result=S.score(stage.raw,context);
 assert.equal(result.branch_id,'①');assert.equal(result.score,4.7);assert.equal(result.problem_tier,'T2');
 assert.deepEqual(result.moves,final.computed.moves);assert.deepEqual(result.promotions,final.computed.promotions);
});
