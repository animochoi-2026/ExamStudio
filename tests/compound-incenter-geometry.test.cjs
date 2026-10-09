'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const source=require('./fixtures/compound-incenter-observed.json'),structure=require('../app/structured-layout.js'),layout=require('../app/diagram-layout.js'),geometry=require('../app/geometry.cjs');
const figure=q=>q.layoutDocument.nodes.find(n=>n.diagram).diagram;
test('actual Gwanghui proof retains source and passes the existing strict checks after minimal foot recovery',()=>{
 const before=JSON.stringify(source),raw=figure(source);assert.equal(geometry.inspectDiagram(raw).errors.length,5);
 const output=structure.forOutput(source),corrected=figure(output),report=geometry.inspectDiagram(corrected);
 assert.equal(report.ok,true);assert.equal(report.checked,9);assert.deepEqual(report.errors,[]);assert.equal(JSON.stringify(source),before);
 assert.equal(output.body,source.body);assert.deepEqual(output.choices,source.choices);assert.deepEqual(output.observedDiagram,source.observedDiagram);
 assert.deepEqual(corrected.constraints,raw.constraints);assert.deepEqual(corrected.angles,raw.angles);assert.deepEqual(corrected.equalAngleMarks,raw.equalAngleMarks);
 for(const name of ['A','B','C','I'])assert.deepEqual(corrected.points.find(p=>p.name===name),raw.points.find(p=>p.name===name));
 for(const name of ['D','F']){const a=raw.points.find(p=>p.name===name),b=corrected.points.find(p=>p.name===name);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<4);}
 const edges=new Set(corrected.segments.map(s=>[s.from,s.to].sort().join(',')));for(const name of ['A','B','C','D','E','F'])assert.ok(edges.has([name,'I'].sort().join(',')));
 assert.deepEqual(layout.prepareObservedPerpendicularFeet(corrected),corrected);assert.ok(geometry.diagramSvg(corrected).includes('<svg'));
});
test('ordinary and exact geometry remain valid, while real coordinate and reference failures are still rejected',()=>{
 const valid=layout.prepareObservedPerpendicularFeet(figure(source));assert.equal(geometry.inspectDiagram(valid).ok,true);
 for(const mutate of [g=>{g.points.find(p=>p.name==='F').x+=50;},g=>{g.points.push({...g.points[0]});},g=>{g.coordinateSystem='cartesian';},g=>{g.constraints=g.constraints.filter(c=>c.type!=='collinear');},g=>{g.angles=[];},g=>{g.segments.push({from:'D',to:'C',dashed:false});},g=>{g.constraints.push({type:'equalLength',points:['A','B','A','C'],value:null});}]){
  const raw=structuredClone(figure(source));mutate(raw);const before=JSON.stringify(raw);assert.equal(geometry.inspectDiagram(layout.prepareObservedPerpendicularFeet(raw)).ok,false);assert.equal(JSON.stringify(raw),before);
 }
 const ordinary={points:[{name:'P',x:0,y:0},{name:'Q',x:3,y:0},{name:'R',x:0,y:4}],segments:[{from:'P',to:'Q'},{from:'P',to:'R'}],constraints:[{type:'perpendicular',points:['Q','P','P','R']}],angles:[{a:'Q',vertex:'P',b:'R',right:true}],coordinateSystem:'image_y_down'};
 assert.equal(layout.prepareObservedPerpendicularFeet(ordinary),ordinary);assert.equal(geometry.inspectDiagram(ordinary).ok,true);
});
test('recovery uses declared names and local figure scopes at different scales',()=>{
 for(const scale of [.1,100]){
  const raw=structuredClone(figure(source)),renames=Object.fromEntries(raw.points.map((p,i)=>[p.name,'point'+i]));raw.points.forEach(p=>{p.name=renames[p.name];p.x=p.x*scale+17;p.y=p.y*scale-8;});
  raw.segments.forEach(s=>{s.from=renames[s.from];s.to=renames[s.to];});raw.constraints.forEach(c=>c.points=c.points.map(n=>renames[n]));raw.angles.forEach(a=>{a.a=renames[a.a];a.vertex=renames[a.vertex];a.b=renames[a.b];});raw.equalAngleMarks.forEach(a=>{a.a=renames[a.a];a.vertex=renames[a.vertex];a.b=renames[a.b];});assert.equal(geometry.inspectDiagram(layout.prepareObservedPerpendicularFeet(raw)).ok,true);
 }
 const q=structuredClone(source),first=q.layoutDocument.nodes.find(n=>n.diagram),second={...structuredClone(first),id:'second',diagram:structuredClone(first.diagram)};second.diagram.points.forEach(p=>p.x+=1000);q.layoutDocument.nodes.push(second);
 const diagrams=structure.forOutput(q).layoutDocument.nodes.filter(n=>n.diagram).map(n=>n.diagram);assert.equal(diagrams.length,2);for(const d of diagrams)assert.equal(geometry.inspectDiagram(d).ok,true);assert.equal(diagrams[1].points.find(p=>p.name==='I').x-diagrams[0].points.find(p=>p.name==='I').x,1000);
 const uncertain=structuredClone(source);uncertain.layoutDocument.nodes.find(n=>n.diagram).origin='uncertain';assert.equal(geometry.inspectDiagram(figure(structure.forOutput(uncertain))).ok,false);
});
