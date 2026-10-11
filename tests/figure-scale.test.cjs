'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('new and missing figure settings use 80 while explicit values and the existing range are preserved',async()=>{
 const {figureScalePercent}=await import('../web-bank/figure-scale.js');
 for(const value of [undefined,null,'',NaN,'invalid'])assert.equal(figureScalePercent(value),80);
 for(const value of [50,80,100,113,150])assert.equal(figureScalePercent(value),value);
 assert.equal(figureScalePercent('113'),113);assert.equal(figureScalePercent(20),50);assert.equal(figureScalePercent(200),150);
});

test('sorting and repeated previews do not apply the figure scale twice',async()=>{
 const {scaleQuestionFigures}=await import('../web-bank/figure-scale.js');
 const image={dataset:{},style:{width:'200px',height:'100px'},parentElement:{getBoundingClientRect:()=>({width:300})},getBoundingClientRect(){return {width:parseFloat(this.style.width),height:parseFloat(this.style.height)};}};
 const element={querySelectorAll:()=>[image]};scaleQuestionFigures(element,80);assert.equal(image.style.width,'160px');scaleQuestionFigures(element,80);assert.equal(image.style.width,'160px');assert.equal(image.style.height,'80px');scaleQuestionFigures(element,100);assert.equal(image.style.width,'200px');scaleQuestionFigures(element,150);assert.equal(image.style.width,'300px');
});
