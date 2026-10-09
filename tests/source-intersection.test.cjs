'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),L=require('../app/diagram-layout.js');
test('source-confirmed intersection joins paths at the same existing point and shading vertex',()=>{
 const d={coordinateSystem:'image_y_down',points:[{name:'P',x:50,y:51},{name:'A',x:0,y:0},{name:'B',x:100,y:100},{name:'C',x:0,y:100},{name:'D',x:100,y:0}],segments:[{from:'A',to:'B',dashed:false},{from:'C',to:'D',dashed:true}],shadedRegions:[{rings:[[{x:0,y:0},{x:50,y:51},{x:100,y:0}]],color:'#999999',origin:'printed'}]};const before=JSON.stringify(d),fixed=L.confirmObservedIntersection(d,{pointName:'P',paths:[['A','B'],['C','D']],sourceConfirmed:true});
 assert.equal(JSON.stringify(d),before);assert.deepEqual(fixed.points,d.points);assert.deepEqual(fixed.shadedRegions,d.shadedRegions);assert.deepEqual(fixed.segments,[{from:'A',to:'P',dashed:false},{from:'P',to:'B',dashed:false},{from:'C',to:'P',dashed:true},{from:'P',to:'D',dashed:true}]);
 const layout=L.layoutDiagram(fixed),p=layout.points.find(p=>p.name==='P');assert.ok(layout.shadedRegions[0].rings[0].some(v=>v.x===p.x&&v.y===p.y));assert.ok(layout.segments.every(s=>s.a.name==='P'||s.b.name==='P'));
 assert.throws(()=>L.confirmObservedIntersection(d,{pointName:'P',paths:[['A','B']]}));assert.throws(()=>L.confirmObservedIntersection({...d,coordinateSystem:'cartesian'},{pointName:'P',paths:[['A','B']],sourceConfirmed:true}));
});
