'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),I=require('../app/difficulty-v12/input.cjs'),R=require('../app/difficulty-v121/source-repair.cjs'),S=require('../app/difficulty-v121/scorer.cjs'),F=require('./fixtures/difficulty-v12-values.cjs');
test('branch collisions are namespaced without changing edges, axes, content or source',()=>{
 const raw={viable_routes:[F.route([],{parallel_branch_count:2,independent_branches:[{branch_id:'a',critical_discoveries:[F.d('d1'),F.d('d2',2,2,1,2,['d1'])]},{branch_id:'b',critical_discoveries:[F.d('d1')]}]})]},before=I.hash(raw);
 const out=R.namespaceIndependentDiscoveryIds(raw);assert.equal(I.hash(raw),before);assert.equal(out.changes.length,3);
 const ds=out.raw.viable_routes[0].independent_branches[0].critical_discoveries;assert.deepEqual(ds[1].depends_on,[ds[0].id]);assert.equal(S.scoreProblem(out.raw.viable_routes,false).status,'complete');
 const strip=x=>JSON.stringify(x,(k,v)=>['id','depends_on'].includes(k)?undefined:v);assert.equal(strip(raw),strip(out.raw));
 assert.equal(R.namespaceIndependentDiscoveryIds(out.raw).changes.length,0);
});
test('ambiguous references and duplicates inside one branch are never repaired by guessing',()=>{
 for(const groups of [[[F.d('d1'),F.d('d1')]],[[F.d('d1',2,2,1,2,['external'])],[F.d('d1')]]]){
  const raw={viable_routes:[{critical_discoveries:[],independent_branches:groups.map(ds=>({critical_discoveries:ds}))}]};assert.throws(()=>R.namespaceIndependentDiscoveryIds(raw));
 }
});
test('reviewed edits bind before state and cannot edit confidence, scores or source in place',()=>{
 const original={answer:'156',confidence:.4},edit={path:['answer'],before:'156',after:'155',rationale:'17000+240(x-80)=35000 gives x=155'};
 assert.equal(R.applyReviewedEdits(original,I.hash(original),[edit]).answer,'155');assert.equal(original.answer,'156');
 assert.throws(()=>R.applyReviewedEdits({...original,answer:'157'},I.hash(original),[edit]),/changed/);
 assert.throws(()=>R.applyReviewedEdits(original,I.hash(original),[{...edit,before:'999'}]),/changed/);
 assert.throws(()=>R.applyReviewedEdits(original,I.hash(original),[{...edit,path:['confidence'],before:.4,after:.99}]),/forbidden/);
});
