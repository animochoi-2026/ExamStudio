'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inferSourceInfo}=require('../app/bank-source-info.cjs');

test('exact approved Korean filename supplies 2026 with existing exam metadata',()=>{
 const value=inferSourceInfo('2026년기출_서울삼육중_2학년2학기_중간고사.pdf');
 assert.deepEqual({school:value.school,academicYear:value.academicYear,grade:value.grade,semester:value.semester,exam:value.exam},
  {school:'서울삼육중',academicYear:'2026',grade:'중2',semester:'2학기',exam:'중간고사'});
});

test('Korean year suffixes and underscore separators retain existing explicit conventions',()=>{
 for(const prefix of ['2026년기출','2026년_기출','2026년도','2026학년도','2026학년','기출_2026']){
  assert.equal(inferSourceInfo(prefix+'_서울삼육중_2학년2학기_중간고사.pdf').academicYear,'2026',prefix);
 }
});

test('conflicting and absent years remain unconfirmed instead of falling back to one candidate',()=>{
 for(const prefix of ['2026년_2025년도','2026년_2025','2026_2025','26년기출','기출']){
  assert.equal(inferSourceInfo(prefix+'_서울삼육중_2학년2학기_중간고사.pdf').academicYear,null,prefix);
 }
});
