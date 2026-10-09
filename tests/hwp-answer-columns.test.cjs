'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {equationPlan}=require('../scripts/hwp_math.cjs');
test('HWP images follow body, boxed statements, quick answers and two-column solutions with their own sizes',()=>{
 const snapshot={questions:[{body:'$x$',statementBox:['ㄱ. $y$'],choices:['$z$'],answer:'$a$',solution:'$$b$$'},{body:'$u$',answer:'$$v$$',solution:'$w$'}]};
 const plan=equationPlan(snapshot);
 assert.deepEqual(plan.map(x=>x.latex),['x','y','z','u','a','v','a','b','v','w']);
 assert.deepEqual(plan.map(x=>x.fontPt),[12,12,12,12,9,9,9,9,9,9]);
 assert.deepEqual(plan.map(x=>x.display),[false,false,false,false,false,true,false,true,false,false]);
 assert.ok(plan.every((x,i)=>x.part==='word/document.xml'&&x.index===i));
});
