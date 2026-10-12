const test=require('node:test'),assert=require('node:assert/strict'),S=require('../app/structured-layout.js');
test('math-wrapped score digits are extracted and restored without changing numerical conditions',()=>{
 const raw='작년보다 $8$점 높다. 평균은?($5$점)',q={body:raw};
 assert.equal(S.sourcePoints(q),5);
 const out=S.forOutput(q);
 assert.equal(out.body,'작년보다 $8$점 높다. 평균은?');
 assert.equal(S.forOutput({...out,showOriginalPoints:true}).body,raw);
 for(const text of ['$x=(4)$점','점수는 $4$점이다.','$\\text{(4점)}$'])assert.equal(S.splitSourcePoints(text).body,text);
});
