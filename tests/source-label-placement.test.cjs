const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const L=require('../app/diagram-layout.js');
test('all stored coordinate labels keep their anchors without requiring a fixed flag',()=>{
 const d={points:[{name:'__a',x:0,y:0},{name:'__b',x:100,y:100}],segments:[{from:'__a',to:'__b'}],labels:[{x:50,y:50,text:'−5'},{x:50,y:50,text:'−2',fixed:false},{x:50,y:50,text:'2',fixed:null}]};
 for(const coordinateSystem of ['cartesian_y_up','image_y_down'])for(const width of [480,960]){
  const input={...d,coordinateSystem},before=JSON.stringify(input),layout=L.layoutDiagram(input,{width});
  for(const l of layout.labels){assert.deepEqual(l.center,l.anchor);assert.equal(l.leaderAnchor,undefined);assert.ok(l.geometryHits>0);}
  assert.equal(JSON.stringify(input),before);
 }
});
test('a circle crossing a point label no longer pushes it away',()=>{
 const d={points:[{name:'__a',x:0,y:0},{name:'__b',x:100,y:100},{name:'P',x:50,y:50,labelDx:20,labelDy:0}],segments:[],labels:[]};
 const a=L.layoutDiagram(d),p=a.labels[0],t=a.transform;
 const circle={cx:t.minX+(p.center.x-t.x)/t.scale,cy:t.maxY-(p.center.y-t.y)/t.scale,r:1};
 const b=L.layoutDiagram({...d,circles:[circle]}),q=b.labels[0];
 assert.deepEqual(q.center,p.center);assert.ok(q.geometryHits>0);assert.equal(q.leaderAnchor,undefined);
});
