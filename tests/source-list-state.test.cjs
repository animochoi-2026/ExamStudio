const test=require('node:test'),assert=require('node:assert/strict');
test('review returns to explicit origin page filters sort scroll; direct entry defaults',async()=>{
 const m=await import('../web-bank/source-list-state.js'),states={schools:{page:2,filters:{year:'2024',semester:'2학기',exam:'기말고사',district:'서울특별시|강남구',query:'중'},order:'recent'}};
 const origin=m.captureSourceOrigin('schools',states,540,'middle2');states.schools.page=0;
 const target=m.restoreSourceOrigin(origin,states,'middle2');assert.equal(states.schools.page,2);assert.equal(states.schools.filters.year,'2024');assert.equal(states.schools.order,'recent');assert.equal(target.scroll,540);
 assert.deepEqual(m.restoreSourceOrigin(null,{},'middle2'),{route:'schools',scroll:0});assert.equal(m.restoreSourceOrigin(origin,{},'middle3').scroll,0);
});
