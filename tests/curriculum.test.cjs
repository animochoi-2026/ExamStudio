const test=require('node:test'),assert=require('node:assert/strict');
const c=require('../app/curriculum.js');
const {validateScope,scopeText,DEFAULT_SCOPE,DEFAULT_PRESETS}=require('../app/rules.cjs');
const {forbiddenConcepts}=require('../app/scope-check.cjs');
test('all three supplied TOCs retain chapter, subunit and concept order',()=>{
 const middle=c.tree.filter(g=>g.id.startsWith('m')),middleLeaves=c.leaves.filter(n=>n.id.startsWith('m'));
 assert.deepEqual(middle.map(g=>g.children.reduce((n,t)=>n+t.children.length,0)),[10,10,8]);
 assert.deepEqual(middle.map(g=>c.descendants(g.id).length),[56,51,51]);
 assert.equal(new Set(middleLeaves.map(n=>n.id)).size,158);
 assert.ok(c.leaves.find(n=>n.id==='m2-6.3').concepts.includes('외심'));
 assert.equal(middleLeaves.at(-1).title,'상관관계');
});
test('parent checks select descendants; unchecking a leaf gives partial state',()=>{
 let ids=c.toggle([],'m2-u6',true);assert.equal(ids.length,4);assert.equal(c.state(ids,'m2-u6').checked,true);
 ids=c.toggle(ids,'m2-6.4',false);assert.deepEqual(c.state(ids,'m2-u6'),{checked:false,partial:true});
 ids=c.toggle(ids,'m2-u6',false);assert.equal(ids.length,0);
 assert.equal(c.toggle([],'m1',true).length,56);
});
test('quadrilateral scope permits earlier lessons without adding them as exam topics',()=>{
 const s=c.build(c.descendants('m2-u7'));
 assert.deepEqual(s.units,['사각형의 성질']);assert.ok(s.prerequisites.some(x=>x.includes('삼각형의 성질')));
 assert.ok(s.prerequisites.some(x=>x.includes('작도와 합동')));assert.ok(s.forbidden.includes('닮음'));assert.ok(s.forbidden.includes('피타고라스 정리'));
 assert.deepEqual(forbiddenConcepts(s,{usedConcepts:['삼각형의 외심','삼각형의 합동']},''),[]);
 assert.ok(forbiddenConcepts(s,{usedConcepts:['피타고라스 정리']},'').length);
 assert.match(scopeText(s),/체크되지 않았어도/);assert.match(scopeText(s),/중학교 이후/);
});
test('partial chapter cutoff does not admit later lessons or prohibit learned similarity',()=>{
 const s=c.build(['m2-8.2']);assert.ok(!s.forbidden.includes('닮음'));
 assert.ok(s.forbidden.some(x=>x.includes('삼각형과 평행선')));assert.ok(!s.forbidden.some(x=>x==='도형의 닮음'));
 assert.match(scopeText(s),/최종 학습 지점: 중2 2학기 도형의 닮음 > 삼각형의 닮음 조건/);
 assert.ok(s.prerequisites.some(x=>x.includes('닮은 도형과 닮음비')));
});
test('legacy presets map without losing freeform restrictions or silently replacing unknown topics',()=>{
 assert.equal(c.infer(DEFAULT_SCOPE).ids.length,12);
 for(const p of DEFAULT_PRESETS)assert.equal(c.infer(p.scope).unmatched.length,0);
 assert.equal(c.infer(DEFAULT_PRESETS[3].scope).ids.filter(id=>id.startsWith('m2-8.')).length,3);
 const old={...DEFAULT_SCOPE,restrictions:'수선 사용',forbidden:[...DEFAULT_SCOPE.forbidden,'벡터']};
 const ids=c.infer(old).ids,s=c.build(ids,c.extras(old,ids));assert.ok(s.forbidden.includes('벡터'));assert.equal(s.restrictions,'수선 사용');
 assert.deepEqual(c.infer({...old,units:['개인 교재 특강']}).unmatched,['개인 교재 특강']);
});
test('server derives scope from IDs and rejects empty/unknown curriculum data',()=>{
 const s=c.build(['m2-6.3']);s.forbidden=[];s.units=['거짓 범위'];const saved=validateScope(s);
 assert.ok(saved.forbidden.includes('피타고라스 정리'));assert.ok(!saved.units.includes('거짓 범위'));
 assert.deepEqual(validateScope(saved),saved);assert.throws(()=>c.build([]));assert.throws(()=>c.build(['bad-id']));
 assert.throws(()=>validateScope({...saved,curriculum:{...saved.curriculum,version:'unknown'}}));
 assert.equal(validateScope(c.build(c.descendants('m3'))).curriculum.selected.length,51);
});
