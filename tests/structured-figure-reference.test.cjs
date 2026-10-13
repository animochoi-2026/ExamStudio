'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const structure=require('../app/structured-layout.js'),materials=require('../app/source-materials.cjs');
const {node}=require('./fixtures/compound-proof.cjs'),drawing=require('./workflow-fixtures.cjs').recognition().observedDiagram;
const question=()=>({kind:'original',body:'증명하시오.',diagramMode:'redraw',observedDiagram:structuredClone(drawing),layoutMode:'structure',layoutDocument:{version:1,features:['proofSteps'],nodes:[node('figure','figure',null,[],{figureId:'diagram'})]}});
test('structured diagram reference uses saved observed geometry without mutating recognition',()=>{
 const q=question(),before=structuredClone(q),out=structure.forOutput(q);
 assert.deepEqual(out.layoutDocument.nodes[0].diagram.points,drawing.points);
 assert.doesNotThrow(()=>materials.validateQuestionFigures({cropPaths:[]},q));
 assert.deepEqual(q,before);
});
test('explicit node geometry and source-image mode preserve their selected representation',()=>{
 const q=question();q.diagramMode='source';q.sourceFigure={path:'source.png',bounds:{x:0,y:0,width:1,height:1}};
 assert.equal(structure.forOutput(q).layoutDocument.nodes[0].diagram,null);
 assert.doesNotThrow(()=>materials.validateQuestionFigures({},q));
 q.layoutDocument.nodes[0].diagram=structuredClone(drawing);q.layoutDocument.nodes[0].diagram.points[0].x+=1;
 assert.equal(structure.forOutput(q).layoutDocument.nodes[0].diagram.points[0].x,q.layoutDocument.nodes[0].diagram.points[0].x);
});
test('upload rejects unresolved printed references, keeps hidden and handwritten exclusions',()=>{
 const q=question();q.observedDiagram=null;
 assert.throws(()=>materials.validateQuestionFigures({},q),/그림 참조.*figure/);
 q.hiddenFigureIds=['diagram'];assert.doesNotThrow(()=>materials.validateQuestionFigures({},q));
 q.hiddenFigureIds=[];q.layoutDocument.nodes[0].origin='handwritten';assert.doesNotThrow(()=>materials.validateQuestionFigures({},q));
});
test('named materials and explicit source figures stay valid; unknown IDs do not use unrelated drawings',()=>{
 const q=question(),p={cropPaths:['crop.png'],recognition:{materials:[{regionIndex:0,label:'보기',bounds:null}]}};
 q.layoutDocument.nodes[0].figureId=materials.materialId(p.recognition.materials[0],p);
 assert.doesNotThrow(()=>materials.validateQuestionFigures(p,q));
 q.layoutDocument.nodes[0].figureId='missing';assert.throws(()=>materials.validateQuestionFigures(p,q),/그림 참조/);
 q.sourceFigures=[{id:'missing',path:'crop.png'}];assert.doesNotThrow(()=>materials.validateQuestionFigures(p,q));
});
test('portable snapshot rejects missing figure before packaging files',()=>{
 const q=question();q.observedDiagram=null;
 assert.throws(()=>require('../app/bank-model.cjs').portableSnapshot({}, {}, q, '.'),/그림 참조/);
});
