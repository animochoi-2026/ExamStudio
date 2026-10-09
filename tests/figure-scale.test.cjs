'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('new and missing figure settings use 80 while explicit values and the existing range are preserved',async()=>{
 const {figureScalePercent}=await import('../web-bank/figure-scale.js');
 for(const value of [undefined,null,'',NaN,'invalid'])assert.equal(figureScalePercent(value),80);
 for(const value of [50,80,100,113,150])assert.equal(figureScalePercent(value),value);
 assert.equal(figureScalePercent('113'),113);assert.equal(figureScalePercent(20),50);assert.equal(figureScalePercent(200),150);
});
