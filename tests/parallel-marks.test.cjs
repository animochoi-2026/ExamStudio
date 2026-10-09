const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),L=require('../app/diagram-layout.js');
const diagram=()=>({points:[{name:'__a',x:0,y:0},{name:'__b',x:4,y:0},{name:'__c',x:5,y:3},{name:'__d',x:1,y:3}],segments:[],labels:[],constraints:[{type:'parallel',points:['__a','__b','__d','__c'],value:null},{type:'parallel',points:['__a','__d','__b','__c'],value:null}]});
test('explicit opposite sides get matching one and two arrow marks',()=>{
 const d=diagram(),before=JSON.stringify(d),a=L.layoutDiagram(d);assert.equal(a.parallelMarks.length,6);assert.equal(a.parallelMarks.filter(m=>m.count===1).length,2);assert.equal(a.parallelMarks.filter(m=>m.count===2).length,4);assert.equal(JSON.stringify(d),before);
 const browser={};vm.runInNewContext(fs.readFileSync(require.resolve('../app/diagram-layout.js'),'utf8'),browser);assert.equal(browser.ExamDiagramLayout.diagramSvg(d),L.diagramSvg(d));
 for(const group of ['parallel-0','parallel-1']){const ms=a.parallelMarks.filter(m=>m.group===group);assert.ok(ms.every(m=>Math.sign(m.tip.x-m.center.x)===Math.sign(ms[0].tip.x-ms[0].center.x)));}
});
test('appearance alone adds no parallel relations and duplicate/invalid references add no marks',()=>{
 const d=diagram();assert.equal(L.layoutDiagram({...d,constraints:[]}).parallelMarks.length,0);
 d.constraints.push({type:'parallel',points:['__c','__d','__b','__a'],value:null},{type:'parallel',points:['missing','__b','__a','__d'],value:null});assert.equal(L.layoutDiagram(d).parallelMarks.length,6);
});
