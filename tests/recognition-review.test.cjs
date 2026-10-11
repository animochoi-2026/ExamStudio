const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../app/diagram-layout.js'),S=require('../app/structured-layout.js');
const diagram=()=>({coordinateSystem:'image_y_down',points:[{name:'O',x:0,y:0},{name:'A',x:10,y:0}],segments:[],lines:[{start:{x:-20,y:0},end:{x:30,y:0},through:['A','O'],label:'x',axis:'x',arrowStart:false,arrowEnd:true,origin:'printed'}]});
test('observed arrow endpoint survives reversed through-point order and JSON round trip',()=>{
 const d=diagram(),before=JSON.stringify(d),l=G.layoutDiagram(JSON.parse(before)).lines[0];assert(l.a.x<l.b.x);assert.equal(l.arrowEnd,true);assert.equal((G.diagramSvg(d).match(/class="line-arrowhead"/g)||[]).length,1);assert.equal(JSON.stringify(d),before);
 d.lines[0].arrowEnd=null;assert(!G.diagramSvg(d).includes('class="line-arrowhead"'));delete d.lines[0].arrowEnd;assert(!G.diagramSvg(d).includes('class="line-arrowhead"'));
});
test('point subscript is rendered without changing the point or segment identity',()=>{
 const d=diagram();d.points[0].name='O_1';d.segments=[{from:'O_1',to:'A'}];const svg=G.diagramSvg(d);assert.match(svg,/<tspan baseline-shift="sub" font-size="70%">1/);assert.equal(G.layoutDiagram(d).segments.length,1);assert.equal(d.points[0].name,'O_1');
});
test('explicit absence of parallel marks does not invent marks from a mathematical relation',()=>{
 const d=diagram();d.constraints=[{type:'parallel',points:['O','A','O','A']}];d.parallelMarks=[];assert.equal(G.layoutDiagram(d).parallelMarks.length,0);
 d.parallelMarks=[{from:'O',to:'A',group:'printed-pair',count:2,origin:'printed'}];assert.equal(G.layoutDiagram(d).parallelMarks.length,2);
});
test('total and subquestion scores round-trip in their positions; text edits never restore stale text',()=>{
 const raw='다음 물음에 답하시오. [총 8점]\n(1) 반지름은? [4점]\n(2) 넓이는? [2점]\n(3) 길이는?',q={body:raw,originalPoints:8};
 const out=S.forOutput(q);assert(!/\d점/.test(out.body));assert.equal(q.body,raw);assert.equal(S.splitSourcePoints(raw).points,8);
 const restored=S.forOutput({...JSON.parse(JSON.stringify(out)),showOriginalPoints:true});assert.equal(restored.body,raw);assert.equal(restored.originalPoints,null);assert.equal(restored.sourceScoresRestored,true);
 const edited=S.forOutput({...out,body:'사용자가 새로 편집한 문제',showOriginalPoints:true});assert.equal(edited.body,'사용자가 새로 편집한 문제');
 assert.equal(S.splitSourcePoints('[㉠~㉤ 1점씩, 5점] 직각삼각형').body,'직각삼각형');
 for(const value of ['세 점 A, B, C','점 (3, 2)','$\\text{[4점]}$'])assert.equal(S.splitSourcePoints(value).body,value);
});
test('nested scores stay reversible and named stored geometry resolves without a source crop',()=>{
 const inline={kind:'text',origin:'printed',text:'구하시오. [3점]'},q={body:'문제',observedDiagram:diagram(),layoutDocument:{nodes:[{id:'figure',type:'figure',origin:'printed',figureId:'observedDiagram',diagram:null,inlines:[]},{id:'proof',parentId:'box',type:'proofStep',origin:'printed',inlines:[inline]}]}};
 const hidden=S.forOutput(q);assert(hidden.layoutDocument.nodes[0].diagram);assert.equal(hidden.layoutDocument.nodes[1].inlines[0].text,'구하시오.');
 const shown=S.forOutput({...hidden,showOriginalPoints:true});assert.equal(shown.layoutDocument.nodes[1].inlines[0].text,inline.text);assert.equal(q.layoutDocument.nodes[0].diagram,null);
});
test('existing answer-count score variants preserve the answer count and mathematical text',()=>{
 const cases=require('./fixtures/answer-count-points-cases.json');for(const [original,body,points]of cases.remove)assert.deepEqual(S.splitSourcePoints(original),{body,points,original});for(const original of cases.preserve)assert.deepEqual(S.splitSourcePoints(original),{body:original,points:null,original});
});
