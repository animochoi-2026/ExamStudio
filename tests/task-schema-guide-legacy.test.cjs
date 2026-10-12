'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {check,schemas}=require('../app/task-schemas.cjs');
const {fixture}=require('./fixtures/solution-guide.cjs');
const {validation,recognition}=require('./workflow-fixtures.cjs');

test('legacy diagram defaults never add diagram fields to solution guide views',()=>{
 const q=fixture(),guide=structuredClone(q.solutionGuide);delete guide.basis;
 const result={intendedSolution:null,assessment:null,reply:'풀이',answer:q.answer,solution:q.solution,solutionGuide:guide,questionType:'single_value',validation:validation(),holdReason:''};
 const views=structuredClone(guide.steps.map(s=>s.view));
 assert.doesNotThrow(()=>check('solve',result));
 assert.deepEqual(guide.steps.map(s=>s.view),views);
 assert.doesNotThrow(()=>check('solve',result));
 assert.ok(guide.steps.some(s=>s.view&&s.view.points.length));
 // Real extra fields still fail; this must not loosen schema validation.
 guide.steps.find(s=>s.view).view.parallelMarks=null;
 assert.throws(()=>check('solve',result),/solutionGuide/);
});

test('legacy observed diagram and coordinate line defaults remain supported',()=>{
 const r=recognition();
 r.observedDiagram.lines=[{start:{x:0,y:0},end:{x:1,y:0},through:[],label:'',dashed:false,origin:'printed'}];
 assert.doesNotThrow(()=>check('recognition',{reply:'판독',recognition:r},structuredClone(schemas.recognition)));
 assert.equal(r.observedDiagram.parallelMarks,null);
 assert.deepEqual(['axis','arrowStart','arrowEnd'].map(k=>r.observedDiagram.lines[0][k]),[null,null,null]);
});
