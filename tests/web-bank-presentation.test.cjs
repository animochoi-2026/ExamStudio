const test=require('node:test'),assert=require('node:assert/strict');
test('printed source labels retain an existing 번 suffix and original points',async()=>{
 const {sourceLabel,sourceInfo,originalNumberText,formatSourcePoints}=await import('../web-bank/presentation.js');
 const c={metadata:{source:{school:'광희중',academicYear:'2026',grade:'중2',semester:'2학기',exam:'중간고사',originalNumber:'서술형 3번',originalPoints:'4점'}}};
 assert.equal(sourceInfo(c).number,'서술형 3번');
 assert.match(sourceLabel(c),/원문 서술형 3번$/);
 assert.equal(originalNumberText('17'),'원문 17번');
 assert.equal(formatSourcePoints(sourceInfo(c).points),'4점');
});
