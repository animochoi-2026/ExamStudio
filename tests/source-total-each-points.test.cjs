const test=require('node:test'),assert=require('node:assert/strict'),layout=require('../app/structured-layout.js');
test('total and per-part score annotations hide and restore without a second total',()=>{
 const body='각각 쓰시오. (1가지 이상이면 처음 내용만 채점함.) (총 4점, 각 2점)';
 const q={body,originalPoints:4};const hidden=layout.forOutput(q);
 assert.equal(hidden.body,'각각 쓰시오. (1가지 이상이면 처음 내용만 채점함.)');
 assert.equal(layout.sourcePoints(q),4);
 const visible=layout.forOutput({...hidden,showOriginalPoints:true});assert.equal(visible.body,body);assert.equal(visible.originalPoints,null);assert.equal(visible.sourceScoresRestored,true);assert.equal(layout.forOutput(visible).body,body);assert.equal(q.body,body);
 for(const value of ['조건 (총 4점, 각 2점]','조건 $x=(총 4점, 각 2점)$','총 4점, 각 2점이면 통과한다.'])assert.equal(layout.splitSourcePoints(value).body,value);
});
test('per-part followed by explicit total preserves source placement and suppresses a duplicate total',()=>{
 const annotation='(각 1점, 총 7점)';
 const body='조건에 맞게 서술하시오. '+annotation;
 const q={body,originalPoints:7,layoutDocument:{nodes:[{id:'score',type:'paragraph',parentId:null,inlines:[{kind:'text',origin:'printed',text:annotation}]}]}};
 const hidden=layout.forOutput(q);
 assert.equal(hidden.body,'조건에 맞게 서술하시오.');
 assert.equal(hidden.layoutDocument.nodes[0].inlines[0].text,'');
 assert.equal(layout.sourcePoints({body}),7);
 const visible=layout.forOutput({...hidden,showOriginalPoints:true});
 assert.equal(visible.layoutDocument.nodes[0].inlines[0].text,annotation);
 assert.equal(visible.body,body);
 assert.equal(visible.originalPoints,null);
 assert.equal(visible.sourceScoresRestored,true);
 assert.deepEqual(layout.forOutput(visible),visible);
 for(const value of ['조건 (각 1점, 총 7점]','조건 $x=(각 1점, 총 7점)$','각 1점, 총 7점이면 통과한다.','(각 1점, 7점)'])assert.equal(layout.splitSourcePoints(value).body,value);
});
