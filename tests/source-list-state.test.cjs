const test=require('node:test'),assert=require('node:assert/strict');
test('review returns to explicit origin page filters sort scroll; direct entry defaults',async()=>{
 const m=await import('../web-bank/source-list-state.js'),states={schools:{page:2,filters:{year:'2024',semester:'2학기',exam:'기말고사',district:'서울특별시|강남구',query:'중'},order:'recent'}};
 const origin=m.captureSourceOrigin('schools',states,540,'middle2');states.schools.page=0;
 const target=m.restoreSourceOrigin(origin,states,'middle2');assert.equal(states.schools.page,2);assert.equal(states.schools.filters.year,'2024');assert.equal(states.schools.order,'recent');assert.equal(target.scroll,540);
 assert.deepEqual(m.restoreSourceOrigin(null,{},'middle2'),{route:'schools',scroll:0});assert.equal(m.restoreSourceOrigin(origin,{},'middle3').scroll,0);
});
test('question detail returns to its list page, filters and scroll without sharing state',async()=>{
 const m=await import('../web-bank/source-list-state.js');
 for(const [route,label]of [['search','문항찾기 목록'],['review','검수함 목록'],['mine','내 문항 목록']]){
  const filters={[route]:{school:'대명중',query:'삼각형'}},origin=m.captureSourceOrigin(route,{},430,'m2',{offset:100,searchFilters:filters});
  filters[route].query='변경';const target=m.restoreSourceOrigin(origin,{},'m2');
  assert.deepEqual(target,{route,scroll:430,offset:100,searchFilters:{[route]:{school:'대명중',query:'삼각형'}}});
  target.searchFilters[route].query='변경';assert.equal(origin.searchFilters[route].query,'삼각형');
  assert.equal(m.sourceOriginLabel(origin,'m2'),label);assert.equal(m.sourceOriginLabel(origin,'m3'),'시험지 목록');
  assert.deepEqual(m.restoreSourceOrigin(origin,{},'m3'),{route:'schools',scroll:0});
 }
});
