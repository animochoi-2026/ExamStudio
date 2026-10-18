const test=require('node:test'),assert=require('node:assert/strict');
test('school labels distinguish whole-result counts, unknown and zero',async()=>{
 const m=await import('../web-bank/school-list-ui.js');
 assert.equal(m.schoolCountLabel(18),'조건에 맞는 학교 18개');assert.equal(m.schoolCountLabel(0),'조건에 맞는 학교 0개');
 assert.throws(()=>m.schoolCountLabel(undefined));assert.throws(()=>m.schoolCountLabel(null));
 assert.equal(m.schoolRangeLabel('대명중',25),'대명중 관련범위 25개');assert.equal(m.schoolRangeLabel('대명중',0),'대명중 관련범위 0개');assert.throws(()=>m.schoolRangeLabel('대명중',undefined));
});
test('scroll cue appears only when visible content remains below',async()=>{
 const {hasMoreBelow}=await import('../web-bank/school-list-ui.js');
 assert(hasMoreBelow({scrollHeight:800,clientHeight:220,scrollTop:0}));assert(!hasMoreBelow({scrollHeight:800,clientHeight:220,scrollTop:580}));assert(hasMoreBelow({scrollHeight:800,clientHeight:220,scrollTop:300}));assert(!hasMoreBelow({scrollHeight:200,clientHeight:220,scrollTop:0}));assert(!hasMoreBelow({scrollHeight:800,clientHeight:0,scrollTop:0}));
});
