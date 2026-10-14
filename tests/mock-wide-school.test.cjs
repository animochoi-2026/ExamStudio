const test=require('node:test'),assert=require('node:assert/strict');
const {allocate}=require('../app/school-allocation.cjs'),sets=require('../app/question-sets.cjs'),B=require('../app/bank-exam-model.cjs');
test('fourteen default schools prove A3 priority without losing written or chapter quotas',()=>{
 const f=require('./fixtures/mock-wide-school-stock.json');
 const eligible=f.rows.map(([s,type,score,chapter],i)=>({question_id:'q'+i,metadata:{source:{school:f.schools[s]},content:{responseType:type}},confirmed:{difficulty:score},chapter}));
 const rules={count:f.count,profile:f.profile,types:f.types,schools:f.schools,schoolMode:'priority'},quotas=B.profileCounts(f.count,f.profile),seed={complete:true,items:f.seed.map(i=>eligible[i]),scopeAllocation:f.scopeAllocation};
 const start=performance.now(),result=allocate({eligible,rules,seed,sets,band:B.compositionBand,format:B.responseType,chapter:c=>c.chapter,quotas});
 assert(result.complete);assert(result.schoolAllocation.optimal);assert.equal(result.items.length,23);assert.equal(result.items.filter(c=>B.responseType(c.metadata)==='서술형').length,4);
 assert.deepEqual(f.schools.map(s=>result.schoolAllocation.counts[s]),[18,1,0,1,0,0,0,1,0,0,0,0,0,2]);
 assert.deepEqual(Object.fromEntries(Object.keys(quotas).map(k=>[k,result.items.filter(c=>B.compositionBand(c)===k).length])),quotas);
 for(const g of result.scopeAllocation.groups){assert(g.count>=Math.floor(g.target)&&g.count<=Math.ceil(g.target));assert(g.writtenCount>=Math.floor(g.writtenTarget)&&g.writtenCount<=Math.ceil(g.writtenTarget));}
 assert(result.schoolAllocation.work<=400002);assert(performance.now()-start<10000);
});
