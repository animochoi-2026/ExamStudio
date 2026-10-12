const test=require('node:test'),assert=require('node:assert/strict'),R=require('../web-bank/replacement-model.cjs'),sets=require('../app/question-sets.cjs');
const candidate=id=>({question_id:id,revision_id:id+'-v',metadata:{difficulty:{userScore:id==='B'?0:10},source:{school:'fixture'},content:{responseType:'서술형'}}});
test('A to B to C restores first original with current layout, points and move identity',()=>{
 const session=R.createSession(),a={questionId:'A',revisionId:'A-v',workspaceMm:25,originalPoints:7,breakBefore:'column'},other={questionId:'X',revisionId:'X-v',workspaceMm:3};let items=[a,other];
 items=session.replace(items,0,candidate('B'));assert.equal(items[0].scoreSnapshot,0);assert.equal(items[0].originalPoints,7);
 items=session.replace(items,0,candidate('C'));items[0].workspaceMm=55;items[0].originalPoints=9;
 items=sets.move(items,0,1);assert.equal(items[1].questionId,'C');assert.equal(items[1].workspaceMm,55);
 items=session.restore(items,1);assert.equal(items[1].questionId,'A');assert.equal(items[1].originalPoints,9);assert.equal(items[1].breakBefore,'column');assert.equal(items[1].workspaceMm,55);assert(!session.has(items[1]));assert.equal(other.questionId,'X');
});
test('replace and restore deny duplicates, sets stay indivisible, original history is session-only',()=>{
 const s=R.createSession();let items=[{questionId:'A',revisionId:'a',workspaceMm:8},{questionId:'X',revisionId:'x'}];
 assert.throws(()=>s.replace(items,0,candidate('X')),/다른 위치/);items=s.replace(items,0,candidate('B'));items.push({questionId:'A',revisionId:'a'});assert.throws(()=>s.restore(items,0),/원본 문항/);
 assert(!JSON.stringify(items).includes('originals'));assert(!R.createSession().has(items[0]));
 assert.throws(()=>s.replace([{...items[0],questionSet:{id:'set'}}],0,candidate('C')),/세트/);
 const next=s.remove(items,0);assert.equal(next.length,2);assert(!s.has(items[0]));
});
test('replacement request removes difficulty and retains scope, school, exclusions',()=>{const rules=R.searchRules({rules:{schools:['S'],units:['u'],excludeIds:['Q'],forbidden:['f'],profile:{high:100},bins:[{min:9}],type:'t',unit:'title'}});assert.deepEqual(rules,{schools:['S'],units:['u'],excludeIds:['Q'],forbidden:['f'],type:'t',unit:'title',originalsOnly:false});assert(!Object.hasOwn(rules,'profile'));});
