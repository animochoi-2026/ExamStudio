const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../web-bank/automatic-exam-title.cjs');
test('selected schools and curriculum order override mixed source years and exams',()=>{
 const sources=[2025,2026].map(academicYear=>({metadata:{source:{school:'다른중',academicYear,exam:'중간고사'}}}));
 assert.equal(T.automaticTitle(sources,{schools:['경원중'],units:['m2-7.1','m2-6.1']}),'경원중 삼각형의 성질~사각형의 성질 시험지');
 assert.equal(T.automaticTitle(sources,{schools:['경원중'],units:['m2-6.1','m2-9.1']}),'경원중 삼각형의 성질·피타고라스 정리 시험지');
 assert.equal(T.automaticTitle(sources,{schools:[],units:[]}),'시험지');
 assert.equal(T.automaticTitle([],{schools:['경원중'],units:['m2-u6']}),'경원중 삼각형의 성질 시험지');
});
test('automatic drafts update from current selections while deliberate and legacy titles survive',()=>{
 const d={autoTitle:true,title:'경원중 여러 학년도 중2 수학'};
 assert.equal(T.applyAutomaticTitle(d,[],{schools:['경원중'],units:['m2-7.1']}),'경원중 사각형의 성질 시험지');
 assert.equal(T.applyAutomaticTitle(d,[],{schools:['압구정중'],units:['m2-8.1']}),'압구정중 도형의 닮음 시험지');
 for(const manual of [{title:'특강 3회',autoTitle:false},{title:'기존 시험지'}])assert.equal(T.applyAutomaticTitle(manual,[],{}),manual.title);
});
