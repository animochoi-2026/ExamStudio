const test=require('node:test'),assert=require('node:assert/strict');
const {printableSolution}=require('../web-bank/solution-print.cjs');
test('print omits explicit trailing review appendix without changing source',()=>{
 const q={solution:'계산하면 $\\frac12\\times32=16$입니다.\n\n[참고 코멘트]\n원문 확인 참고: 안내선 끝점 미확인'};
 assert.equal(printableSolution(q.solution),'계산하면 $\\frac12\\times32=16$입니다.');
 assert.match(q.solution,/안내선 끝점 미확인/);
});
test('unmarked reasoning and inline mentions remain printable',()=>{
 const text='참고로 이등변삼각형입니다.\n문장 속 [참고 코멘트]라는 표현은 그대로 둡니다.\n$\\angle A=90^\\circ$';
 assert.equal(printableSolution(text),text);
});
test('old explicit source-review lines do not discard subsequent proof',()=>{
 assert.equal(printableSolution('첫 계산\n원문 확인 참고: 관찰 기록\n마지막 증명'),'첫 계산\n마지막 증명');
});
