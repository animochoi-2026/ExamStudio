const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../web-bank/mock-exam-model.cjs'),S=require('../web-bank/mock-round-supplements.cjs'),E=require('../web-bank/mock-round-edit.cjs');
const unit='m2-6.1';
const row=(id,format='선택형',school='원래중',u=unit,score=5)=>({question_id:id,revision_id:'r'+id,metadata:{source:{kind:'학교기출',school},content:{responseType:format},classification:{primaryUnit:{id:u}}},confirmed:{difficulty:score}});
function round(){const d=M.create('test');d.paperForm={kind:'mock'};d.schools=['원래중'];d.counts.A={choice:1,written:1,choicePoints:4,writtenPoints:6};d.profile={low:0,middle:100,high:0,targetAverage:5};for(const id of ['a1','a2','a3']){M.addVariant(d,'A',id);d.variants.at(-1).units=[unit];}return d;}
test('A B C defaults are 100 points and existing papers and custom counts survive normalize',()=>{
 const d=M.create('id');assert.deepEqual([d.counts.A.choice,d.counts.A.written,d.counts.B.choice,d.counts.B.short,d.counts.C.written],[19,4,25,0,10]);assert.deepEqual(Object.values(d.counts).map(M.totalPoints),[100,100,100]);
 d.counts.A.choice=17;const n=M.normalize(d);assert.equal(n.counts.A.choice,17);assert.equal(M.totalPoints(n.counts.A),92);
 const old=round();old.counts.A={choice:3,written:2};old.variants[0].paper={items:[{questionId:'old'}],title:'old'};assert.deepEqual(M.normalize(old).variants[0].paper.items,old.variants[0].paper.items);
});
test('whole round deduplicates shared written shortage and excludes choice alternatives and excluded questions',()=>{
 const d=round(),snapshot={candidates:[row('base'),row('written','서술형','다른중'),row('alternative','서술형','또다른중'),row('choice','선택형','다른중'),row('excluded','서술형','다른중')],excludeIds:['excluded']},targetIds=d.variants.map(v=>v.id),before=JSON.stringify(d);
 const p=S.plan({document:d,snapshot,targetIds});assert(p.complete);assert.equal(p.requiredCount,1);assert(p.groups.every(g=>g.neededIds.length===1));assert.deepEqual(new Set(p.candidates.map(c=>c.question_id)),new Set(['written','alternative']));assert.equal(JSON.stringify(d),before);
 let chosen=S.selection(p,new Set(),p.candidates[0]);assert.throws(()=>S.selection(p,chosen,p.candidates[1]),/1개/);
 for(const c of p.candidates){const r=S.check({document:d,snapshot,targetIds,ids:[c.question_id]});assert(r.complete);assert(r.updates.every(u=>u.paper.items.some(i=>i.questionId===c.question_id)));}
});
test('selected second school is a base source and incompatible full-bank shortage stays unresolved',()=>{
 const d=round();d.schools.push('2순위중');const snapshot={candidates:[row('base'),row('w','서술형','2순위중')]},targetIds=d.variants.map(v=>v.id);
 assert.equal(S.plan({document:d,snapshot,targetIds}).requiredCount,0);
 snapshot.candidates=[row('base'),row('wrong','선택형','외부중')];assert.equal(S.plan({document:d,snapshot,targetIds}).complete,false);
});
test('shared replacement updates all uses atomically, preserves slots and rejects wrong format scope and duplicates',()=>{
 let d=round();const snapshot={candidates:[row('base'),row('w','서술형')]};d=M.apply(d,M.compose({document:d,snapshot,targetIds:d.variants.map(v=>v.id)}));
 for(const v of d.variants)v.paper.items.find(i=>i.questionId==='base').workspaceMm=37;
 const before=JSON.stringify(d),r=E.replace(d,'base',row('next'));assert.equal(r.affectedIds.length,3);assert.equal(JSON.stringify(d),before);for(const v of r.document.variants){assert(!v.paper.items.some(i=>i.questionId==='base'));assert.equal(v.paper.items.find(i=>i.questionId==='next').workspaceMm,37);assert.equal(v.paper.items.find(i=>i.questionId==='next').points,4);}
 assert.throws(()=>E.replace(d,'base',row('bad','서술형')),/형식/);assert.throws(()=>E.replace(d,'base',row('bad','선택형','원래중','m2-8.1')),/범위/);assert.throws(()=>E.replace(d,'w',row('w','서술형')),/현재 문항/);
 const duplicate=structuredClone(d);duplicate.variants[2].paper.items.push({questionId:'next',revisionId:'rnext'});assert.throws(()=>E.replace(duplicate,'base',row('next')),/포함/);assert.equal(JSON.stringify(d),before);
 const single=structuredClone(d);single.variants[0].paper.items[0].questionId='single';assert.equal(E.replace(single,'single',row('alone')).affectedIds.length,1);
});
test('generated scoring notes and per-item points are frozen with each paper',()=>{
 const d=round(),r=M.compose({document:d,snapshot:{candidates:[row('base'),row('w','서술형')]},targetIds:['a1']});assert(r.complete);assert.match(r.updates[0].paper.paperForm.scoreNote,/객관식 1개 × 4점/);assert.match(r.updates[0].paper.paperForm.scoreNote,/서술형 1개 × 6점/);assert.deepEqual(r.updates[0].paper.items.map(i=>i.points).sort(),[4,6]);
});

test('supplement sets select together and count only new members, retaining a selected-school partner',()=>{
 const d=round(),a=row('set-a'),b=row('set-b','서술형','다른중'),descriptor={id:'pair',complete:true,original_numbers:['1','2'],members:[{questionId:'set-a'},{questionId:'set-b'}]};a.questionSet=descriptor;b.questionSet=descriptor;
 const snapshot={candidates:[a,b]},targetIds=d.variants.map(v=>v.id),p=S.plan({document:d,snapshot,targetIds});assert(p.complete);assert.equal(p.requiredCount,1);assert.equal(p.candidates.length,1);assert.deepEqual([...S.selection(p,new Set(),p.candidates[0])],['set-b']);
 a.metadata.source.school='다른중';const all=S.plan({document:d,snapshot,targetIds});assert(all.complete);assert.equal(all.requiredCount,2);assert.deepEqual(new Set(S.selection(all,new Set(),all.candidates[0])),new Set(['set-a','set-b']));
});

test('an existing supplement can be authorized for the other papers in one round selection',()=>{
 const d=round();d.variants[0].supplementIds=['shared'];const snapshot={candidates:[row('base'),row('shared','서술형','다른중')]},targetIds=d.variants.map(v=>v.id);
 const p=S.plan({document:d,snapshot,targetIds});assert(p.complete);assert.equal(p.requiredCount,1);assert.deepEqual(p.suggestedIds,['shared']);assert(p.candidates.some(c=>c.question_id==='shared'));assert(S.check({document:d,snapshot,targetIds,ids:p.suggestedIds}).complete);
});
