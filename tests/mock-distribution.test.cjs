const test=require('node:test'),assert=require('node:assert/strict'),R=require('../web-bank/mock-round-edit.cjs');
const item=(id,unit)=>({questionId:id,revisionId:id+'-v',catalogSnapshot:{metadata:{classification:{primaryUnit:{id:unit}}}}});
test('round composition counts unique shared questions and individual units per variant',()=>{
 const doc={variants:[{id:'a',label:'A1',paper:{items:[item('shared','m2-6.1'),item('a1','m2-8.7'),item('a2','m2-8.7')]}},{id:'b',label:'A2',paper:{items:[item('shared','m2-6.1'),item('b1','m2-7.1')]}},{id:'c',label:'B1'}]},before=structuredClone(doc),s=R.distribution(doc);
 assert.equal(s.shared,1);assert.equal(s.distinct,4);assert.equal(s.total,5);assert.deepEqual(s.variants.map(v=>[v.common,v.individual]),[[1,2],[1,1]]);assert.deepEqual(s.variants[0].units,[{id:'m2-8.7',name:null,count:2}]);assert.deepEqual(doc,before);
 const reopened=JSON.parse(JSON.stringify(doc));assert.deepEqual(R.distribution(reopened),s);reopened.variants[0].paper.items[1]=item('replacement','m2-6.1');assert.equal(R.distribution(reopened).variants[0].units.length,2);
});
