const test=require('node:test'),assert=require('node:assert/strict');
test('reload keeps saved mock download and school management routes',async()=>{
 const {initialRoute}=await import('../web-bank/initial-route.js'),id='cdb93673-8910-40a4-a52d-93928d18a801';
 for(const route of ['mock-download/'+id,'mock-exams/'+id,'exam/'+id+'/download','school-regions','search','review','source/school-key','paper-forms/edit'])assert.equal(initialRoute(route),route);
 for(const route of ['','missing','mock-download/','mock-download/not-an-id','school-regions/extra'])assert.equal(initialRoute(route),'home');
});
