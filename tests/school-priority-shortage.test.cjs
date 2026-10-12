const test=require('node:test'),assert=require('node:assert/strict'),M=require('../web-bank/mock-exam-model.cjs'),B=require('../app/bank-exam-model.cjs'),S=require('../web-bank/mock-round-supplements.cjs'),sets=require('../app/question-sets.cjs');
function fixture(){
 const f=require('./fixtures/school-priority-stock.json'),document=M.create('stock-round');
 document.schools=f.schools.slice(0,3);document.profile={low:20,middle:40,high:40,targetAverage:null};
 f.variants.forEach((v,i)=>{M.addVariant(document,v.kind,'v'+i);document.variants.at(-1).units=v.units;});
 const candidates=f.rows.map(([s,format,score,primary,conditions,solutions],i)=>({question_id:'q'+i,revision_id:'r'+i,metadata:{source:{school:f.schools[s],kind:'학교기출'},content:{responseType:format},classification:{primaryUnit:primary,conditionUnitIds:conditions,solutions:solutions.map(([unitIds,dependencyUnitIds])=>({unitIds,dependencyUnitIds}))}},confirmed:{difficulty:score}}));
 return {document,snapshot:{id:'stock',candidates,excludeIds:[]},targetIds:document.variants.map(v=>v.id)};
}
module.exports={fixture};
if(require.main===module||process.env.NODE_TEST_CONTEXT){
test('large choice inventory with scarce written stock completes a four-paper round with two shared supplements',()=>{
 const data=fixture(),before=JSON.stringify(data),p=S.plan(data);
 assert(p.complete);assert.equal(p.requiredCount,2);assert(p.candidates.every(c=>B.responseType(c.metadata)==='서술형'));
 const r=S.check({...data,ids:p.suggestedIds});assert(r.complete);assert.equal(r.updates.length,4);
 for(const u of r.updates){const variant=data.document.variants.find(v=>v.id===u.id),items=u.paper.items;
 assert.equal(items.length,variant.kind==='A'?23:25);assert.equal(items.filter(i=>i.responseType==='서술형').length,variant.kind==='A'?4:0);
 assert(u.paper.rules.schoolMode==='priority');assert(sets.complete(items.map(i=>i.catalogSnapshot)));
 const histogram={low:0,middle:0,high:0};items.forEach(i=>histogram[B.compositionBand(i.catalogSnapshot)]++);assert.deepEqual(histogram,B.profileCounts(items.length,data.document.profile));
 }
 assert.deepEqual(p.groups.map(g=>g.neededIds.length),[2,0,1,1]);assert.equal(JSON.stringify(data),before);
});
test('priority bounds agree with exhaustive subsets including mixed-school sets and chapter quotas',()=>{
 let state=731;const rand=n=>((state=(Math.imul(state,1664525)+1013904223)>>>0)>>>8)%n;
 let verified=0;
 for(let trial=0;trial<80;trial++){
  const rows=Array.from({length:11},(_,i)=>({question_id:'q'+i,revision_id:'r'+i,metadata:{source:{school:['S0','S1','S2'][rand(3)]},classification:{primaryUnit:['m2-6.1','m2-7.1'][rand(2)]},content:{responseType:rand(3)?'선택형':'서술형'}},confirmed:{difficulty:[2,5,8][rand(3)]}}));
  if(trial%3===0){const pair={id:'pair',complete:true,original_numbers:['1','2'],members:[{questionId:'q0'},{questionId:'q1'}]};rows[0].questionSet=pair;rows[1].questionSet=pair;}
  const rules={count:4,units:['m2-6.1','m2-7.1'],types:{선택형:3,서술형:1,단답형:0},profile:{low:25,middle:50,high:25,targetAverage:5},scopeDistribution:true,schools:['S0','S1','S2']};
  const seed=B.selectQuestions(rows,rules);if(!seed.complete)continue;
  let best=null;const cmp=(a,b)=>{for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;};
  for(let mask=0;mask<1<<rows.length;mask++){const sub=rows.filter((_,i)=>mask&(1<<i));if(sub.length!==4||!M.valid(sub,rules,seed))continue;const vector=rules.schools.map(s=>sub.filter(c=>c.metadata.source.school===s).length);if(!best||cmp(vector,best)>0)best=vector;}
  const actual=B.selectQuestions(rows,{...rules,schoolMode:'priority'});assert(actual.complete);assert.deepEqual(rules.schools.map(s=>actual.schoolAllocation.counts[s]),best,'trial '+trial);verified++;
 }
 assert(verified>=15);
});
test('search exhaustion is never described as whole-bank shortage',()=>{
 const text=S.failureMessage({failures:[{failureKind:'search_limit'}]});assert.match(text,/문항 부족으로 판정한 결과가 아닙니다/);assert.doesNotMatch(text,/조건을 충족하지 못/);
 assert.match(S.failureMessage({failures:[{shortages:[{missing:2}]}]}),/부족한 형식·단원·난이도/);
});
}

