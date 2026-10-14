const test=require('node:test'),assert=require('node:assert/strict'),{containsObservedDiagram:covered}=require('../web-bank/material-diagram.cjs');
const observed={coordinateSystem:'image_y_down',points:[{name:'A',x:40,y:25},{name:'B',x:10,y:50},{name:'C',x:70,y:60}]};
const bounds={x:0,y:0,width:1,height:.8},p={cropPaths:['crop'],recognition:{version:1,observedDiagram:observed,materials:[{regionIndex:0,bounds}]}},q={kind:'original',sourceVersion:1,observedDiagram:observed},crop={ref:'crop',width:100,height:100,bounds};
test('original material contains unchanged observed geometry without mutating source',()=>{const before=structuredClone({p,q,crop});assert(covered(p,q,crop));assert.deepEqual({p,q,crop},before);});
test('retain authored, changed, separate, ambiguous or partially covered drawings',()=>{
 assert(!covered(p,{...q,diagram:observed},crop));assert(!covered(p,{...q,sourceVersion:2},crop));assert(!covered(p,{...q,kind:'variant'},crop));assert(!covered(p,q,undefined));assert(!covered({...p,cropPaths:['crop','second']},q,crop));assert(!covered(p,q,{...crop,height:50}));assert(!covered(p,q,{...crop,ref:'second'}));assert(!covered(p,{...q,observedDiagram:{...observed,points:[]}},crop));assert(!covered(p,{...q,layoutDocument:{nodes:[]}},crop));
});
