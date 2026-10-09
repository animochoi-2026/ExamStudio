const test=require('node:test'),assert=require('node:assert/strict'),L=require('../app/diagram-layout.js');
test('wide drawings lose blank height without moving or rescaling content',()=>{
 const d={points:[{name:'A',x:0,y:0},{name:'B',x:100,y:0},{name:'C',x:100,y:10},{name:'D',x:0,y:10}],segments:[{from:'A',to:'B'},{from:'B',to:'C'},{from:'C',to:'D'},{from:'D',to:'A'}],labels:[{x:50,y:5,text:'(가)'}],angles:[{a:'B',vertex:'A',b:'D',right:true}],constraints:[{type:'parallel',points:['A','B','D','C']}]};
 const a=L.layoutDiagram(d),b=L.layoutDiagram(d,{trimVertical:false});assert.ok(a.height<b.height/2);assert.equal(a.width,b.width);
 for(const k of ['points','labels','angles','ticks','parallelMarks','transform'])assert.deepEqual(a[k],b[k]);
});
test('cropping includes complete circles, text, and guide endpoints',()=>{
 const d={points:[{name:'A',x:0,y:0},{name:'B',x:10,y:0}],labels:[{x:5,y:3,text:'above'}],circles:[{cx:5,cy:0,r:2}],segments:[]};
 const a=L.layoutDiagram(d),top=a.viewBox[1],bottom=top+a.height;
 for(const c of a.circles){assert.ok(c.cy-c.r>top);assert.ok(c.cy+c.r<bottom);}
 for(const l of a.labels){assert.ok(l.box.top>top);assert.ok(l.box.bottom<bottom);}
});
