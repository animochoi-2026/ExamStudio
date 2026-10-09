const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { diagramSvg, layoutDiagram } = require('../app/geometry.cjs');
const fixtures = require('./fixtures/geometry-overlap.json');

test('three-point perpendicular uses a confirmed right-angle vertex without inventing a point',()=>{
 const {inspectDiagram}=require('../app/geometry.cjs');
 const diagram={points:[{name:'B',x:3,y:0},{name:'C',x:0,y:0},{name:'A',x:0,y:4}],segments:[],angles:[{a:'B',vertex:'C',b:'A',right:true}],constraints:[{type:'perpendicular',points:['B','C','A']}]};
 const before=JSON.stringify(diagram);assert.equal(inspectDiagram(diagram).ok,true);assert.equal(JSON.stringify(diagram),before);
 assert.equal(inspectDiagram({...diagram,angles:[]}).ok,false);
 assert.equal(inspectDiagram({...diagram,points:diagram.points.map(p=>p.name==='A'?{...p,x:2}:p)}).ok,false);
});

test('printed shading renders behind edges and equal-angle dots stay on their own arcs',()=>{
 const d=require('./workflow-fixtures.cjs').recognition().observedDiagram;
 d.shadedRegions=[{rings:[[{x:0,y:0},{x:4,y:5},{x:8,y:0}]],color:'#cccccc',origin:'printed'}];
 d.equalAngleMarks=[{a:'A',vertex:'B',b:'C',group:'g',count:2,style:'dot',origin:'printed'}];
 for(const coordinateSystem of ['image_y_down','cartesian_y_up']){
  const l=layoutDiagram({...d,coordinateSystem}),svg=diagramSvg({...d,coordinateSystem});assert.equal(l.shadedRegions.length,1);assert.equal(l.equalAngleMarks[0].dots.length,2);
  assert.ok(svg.indexOf('class="shaded-region"')<svg.indexOf('<polyline'));assert.equal((svg.match(/class="equal-angle-dot"/g)||[]).length,2);
  const m=l.equalAngleMarks[0];for(const dot of m.dots)assert.ok(Math.abs(Math.hypot(dot.x-m.vertex.x,dot.y-m.vertex.y)-m.radius)<1e-6);
 }
 d.shadedRegions[0].origin='handwritten';d.equalAngleMarks[0].origin='handwritten';assert.doesNotMatch(diagramSvg(d),/class="shaded-region"|class="equal-angle-dot"/);
});

test('named lines extend through BC, preserve italic l and do not invent endpoint points',()=>{
 const {questionDiagram}=require('../app/diagram-layout.js'),d=require('./workflow-fixtures.cjs').recognition().observedDiagram;
 d.lines=[{start:{x:-1,y:6},end:{x:9,y:6},through:[],label:'l',dashed:false,origin:'printed'}];
 const before=JSON.stringify(d),q=questionDiagram({body:'직선 $BC$와 직선 $l$이 있다.',observedDiagram:d}),l=layoutDiagram(q);
 assert.equal(l.lines.length,2);assert.equal(l.points.length,3);assert.ok(l.labels.some(x=>x.kind==='line'&&x.text==='l'));
 const bc=l.lines[1],b=l.points.find(x=>x.name==='B'),c=l.points.find(x=>x.name==='C');
 assert.ok(Math.hypot(bc.a.x-b.x,bc.a.y-b.y)>20);assert.ok(Math.hypot(bc.b.x-c.x,bc.b.y-c.y)>20);
 assert.equal(JSON.stringify(d),before);assert.match(diagramSvg(q),/class="geometry-line"/);
 assert.equal(questionDiagram({body:'선분 BC의 길이는 1이다.',observedDiagram:d}).lines.length,1);
});

test('equal-length ticks remain centered on their segments across coordinate systems and scales',()=>{
 const d=require('./workflow-fixtures.cjs').recognition().observedDiagram;
 d.equalLengthMarks=[{from:'A',to:'B',group:'double',count:2,position:null,origin:'printed'},{from:'B',to:'C',group:'double',count:2,position:.65,origin:'printed'},{from:'A',to:'C',group:'handwriting',count:3,position:null,origin:'handwritten'}];
 for(const coordinateSystem of ['image_y_down','cartesian_y_up'])for(const width of [480,960]){
  const l=layoutDiagram({...d,coordinateSystem},{width});assert.equal(l.ticks.length,4);
  for(const t of l.ticks){const a=l.points.find(p=>p.name===t.from),b=l.points.find(p=>p.name===t.to),v={x:b.x-a.x,y:b.y-a.y};assert.ok(Math.abs(v.x*(t.center.y-a.y)-v.y*(t.center.x-a.x))<1e-6);assert.ok(Math.abs(v.x*(t.b.x-t.a.x)+v.y*(t.b.y-t.a.y))<1e-6);}
 }
 assert.equal((diagramSvg(d).match(/class="equal-length-tick"/g)||[]).length,4);
 d.equalLengthMarks=[];assert.equal(layoutDiagram(d).ticks.length,0);
 d.constraints=[{type:'equalLength',points:['A','B','B','C'],value:null}];assert.equal(layoutDiagram(d).ticks.length,2);
});

test('invalid tick anchors, group counts, and zero-length lines are diagnosed',()=>{
 const {inspectDiagram}=require('../app/geometry.cjs'),d=require('./workflow-fixtures.cjs').recognition().observedDiagram;
 d.equalLengthMarks=[{from:'A',to:'MISSING',group:'g',count:1,position:null,origin:'printed'},{from:'B',to:'C',group:'g',count:2,position:null,origin:'printed'}];
 d.lines=[{start:{x:0,y:0},end:{x:0,y:0},through:[],label:'l',origin:'printed'}];
 const r=inspectDiagram(d);assert.equal(r.ok,false);assert.match(r.errors.join(' '),/선분 참조/);assert.match(r.errors.join(' '),/그룹/);assert.match(r.errors.join(' '),/직선/);
});

test('curved dimension guides touch measured points directly without straight extensions in browser and export',()=>{
 const diagram=require('./workflow-fixtures.cjs').recognition().observedDiagram;
 diagram.dimensions=[{from:'A',to:'C',start:{x:0,y:-1},end:{x:8,y:-1},label:'8',origin:'printed',endpointStyle:'tick'},
 {from:'A',to:'B',start:{x:-1,y:0},end:{x:3,y:5},label:'3',origin:'printed',endpointStyle:'arrow'}];
 const before=JSON.stringify(diagram),layout=layoutDiagram(diagram),svg=diagramSvg(diagram);
 assert.equal(layout.dimensions.length,2);assert.equal(layout.segments.length,3);
 assert.equal((svg.match(/class="dimension-guide"/g)||[]).length,2);
 assert.doesNotMatch(svg,/class="dimension-(?:endpoint|extension)"/);
 assert.match(svg,/class="dimension-guide"[^>]+stroke-dasharray="8 7"/);
 assert.match(svg,/class="dimension-guide" d="M [^"]+ Q /);
 for(const d of layout.dimensions){
  assert.deepEqual(d.curvePoints[0],d.a);assert.deepEqual(d.curvePoints.at(-1),d.b);
  const mid={x:(d.a.x+d.b.x)/2,y:(d.a.y+d.b.y)/2};
  assert.deepEqual(d.a,{x:d.fromPoint.x,y:d.fromPoint.y});assert.deepEqual(d.b,{x:d.toPoint.x,y:d.toPoint.y});
  const sag=Math.hypot(d.labelCenter.x-mid.x,d.labelCenter.y-mid.y);
  assert.ok(sag>=20&&sag<=130.001);
  assert.ok(Math.abs(sag-Math.min(130,Math.max(20,Math.hypot(d.b.x-d.a.x,d.b.y-d.a.y)*.2)))<.001);
 }
 assert.doesNotMatch(svg,/class="dimension-extension"/);
 assert.equal(layout.labels.filter(l=>l.kind==='dimension').length,2);
 const browser=vm.createContext({});vm.runInContext(fs.readFileSync(require.resolve('../app/diagram-layout.js'),'utf8'),browser);
 assert.equal(browser.ExamDiagramLayout.diagramSvg(diagram),svg);assert.equal(JSON.stringify(diagram),before);
});

test('explicit straight length guide remains supported and legacy guides default to curves',()=>{
 const diagram=require('./workflow-fixtures.cjs').recognition().observedDiagram;
 diagram.dimensions=[{from:'A',to:'C',start:{x:0,y:-1},end:{x:8,y:-1},label:'8',origin:'printed',endpointStyle:'tick',guideStyle:'straight'}];
 assert.match(diagramSvg(diagram),/class="dimension-guide" d="M [^"]+ L /);
 delete diagram.dimensions[0].guideStyle;assert.match(diagramSvg(diagram),/class="dimension-guide" d="M [^"]+ Q /);
 for(const coordinateSystem of ['image_y_down','cartesian_y_up']){
  diagram.coordinateSystem=coordinateSystem;const d=layoutDiagram(diagram).dimensions[0];
  assert.ok(coordinateSystem==='image_y_down'?d.labelCenter.y<d.a.y:d.labelCenter.y>d.a.y);
 }
});

test('handwritten, uncertain and missing-endpoint dimensions are not invented or rendered',()=>{
 const diagram=require('./workflow-fixtures.cjs').recognition().observedDiagram;
 const d={from:'A',to:'C',start:{x:0,y:-1},end:{x:8,y:-1},label:'8',origin:'printed',endpointStyle:'tick'};
 diagram.dimensions=[{...d,origin:'handwritten'},{...d,origin:'uncertain'},{...d,from:null},{...d,end:null}];
 assert.equal(layoutDiagram(diagram).dimensions.length,0);assert.doesNotMatch(diagramSvg(diagram),/dimension-guide/);
 diagram.dimensions=[{...d,from:'missing'}];assert.throws(()=>diagramSvg(diagram),/치수선 참조/);
});

test('explicit redraw angle placements and leaders survive renderer defaults',()=>{
 const diagram=require('./workflow-fixtures.cjs').recognition().observedDiagram;
 diagram.angleLabelOverrides=[{angleIndex:0,x:6,y:6,leader:true}];
 const layout=layoutDiagram(diagram),label=layout.labels.find(l=>l.kind==='angle');
 assert.equal(label.withinWedge,false);assert.equal(label.leaderArrow,true);
 assert.match(diagramSvg(diagram),/class="angle-label-arrow"/);
 diagram.angleLabelOverrides=null;assert.doesNotMatch(diagramSvg(diagram),/class="angle-label-arrow"/);
});

test('narrow-angle numbers stay inside without arrows in browser and export',()=>{
 const source=structuredClone(fixtures[0].diagram);source.angleLabelLeaders='always';
 const dataBefore=JSON.stringify(source),layout=layoutDiagram(source),labels=layout.labels.filter(l=>l.kind==='angle');assert.ok(labels.length>0);
 for(const label of labels){const a=layout.angles.find(a=>`angle-${a.index}`===label.id);assert.equal(label.leaderAnchor,undefined);assert.equal(label.leaderArrow,undefined);assert.equal(label.withinWedge,true);assert.ok(Math.hypot(label.center.x-a.vertex.x,label.center.y-a.vertex.y)<=140);
 const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
 assert.ok(cross(a.vertex,a.a,label.center)*cross(a.vertex,a.a,a.b)>=0);assert.ok(cross(a.vertex,a.b,label.center)*cross(a.vertex,a.b,a.a)>=0);}
 const svg=diagramSvg(source);assert.doesNotMatch(svg,/class="angle-label-(?:arrow|leader)"/);assert.equal(JSON.stringify(source),dataBefore);
 const context={};vm.runInNewContext(fs.readFileSync(require.resolve('../app/diagram-layout.js'),'utf8'),context);assert.equal(svg,context.ExamDiagramLayout.diagramSvg(source));
});

test('spacious angles keep their number inside the figure without arrows, including legacy always settings',()=>{
 const diagram={angleLabelLeaders:'always',points:[{name:'O',x:0,y:0},{name:'A',x:6,y:0},{name:'B',x:0,y:6}],segments:[{from:'O',to:'A'},{from:'O',to:'B'}],angles:[{a:'A',vertex:'O',b:'B',label:'90°'}]};
 const before=JSON.stringify(diagram),layout=layoutDiagram(diagram),label=layout.labels.find(l=>l.kind==='angle'),angle=layout.angles[0];
 assert.equal(label.withinWedge,true);assert.equal(label.leaderAnchor,undefined);assert.equal(label.leaderArrow,undefined);assert.ok(Math.hypot(label.center.x-angle.vertex.x,label.center.y-angle.vertex.y)<120);assertSeparated(layout);assert.doesNotMatch(diagramSvg(diagram),/class="angle-label-arrow"/);assert.equal(JSON.stringify(diagram),before);
});

test('source image coordinates preserve vertical placement; generated Cartesian figures remain y-up', () => {
  const {questionDiagram}=require('../app/geometry.cjs');
  const diagram={points:[{name:'D',x:422,y:307},{name:'B',x:210,y:664},{name:'C',x:552,y:665}],segments:[{from:'D',to:'B'},{from:'B',to:'C'}],circles:[],angles:[],labels:[]};
  const raw=JSON.stringify(diagram),source=questionDiagram({observedDiagram:diagram});
  const screen=layoutDiagram(source),cartesian=layoutDiagram(questionDiagram({diagram}));
  assert.ok(screen.points[0].y<screen.points[1].y,'D is above the baseline in the source image');
  assert.ok(cartesian.points[0].y>cartesian.points[1].y,'generated coordinates still increase upward');
  assert.equal(JSON.stringify(diagram),raw,'legacy saved coordinates are never rewritten');
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('../app/diagram-layout.js'),'utf8'),context);
  assert.equal(diagramSvg(source),context.ExamDiagramLayout.diagramSvg(context.ExamDiagramLayout.questionDiagram({observedDiagram:diagram})),'screen and document export use the identical coordinate convention');
  assert.equal(questionDiagram({observedDiagram:{...diagram,coordinateSystem:'cartesian_y_up'}}).coordinateSystem,'cartesian_y_up');
});

function assertSeparated(layout) {
  assert.deepEqual(layout.collisions, []);
  for (let i = 0; i < layout.labels.length; i++) {
    const a = layout.labels[i];
    assert.ok(a.box.left >= layout.viewBox[0] && a.box.top >= layout.viewBox[1]);
    assert.ok(a.box.right <= layout.viewBox[0] + layout.viewBox[2]);
    assert.ok(a.box.bottom <= layout.viewBox[1] + layout.viewBox[3]);
    for (const b of layout.labels.slice(i + 1)) {
      assert.ok(a.box.right + 5 <= b.box.left || b.box.right + 5 <= a.box.left
        || a.box.bottom + 5 <= b.box.top || b.box.bottom + 5 <= a.box.top,
      `${a.id} and ${b.id} must have a visible gap`);
    }
  }
}

test('all four reported exam diagrams have clear labels at a readable two-column print size', () => {
  for (const { name, diagram } of fixtures) {
    const original = JSON.stringify(diagram);
    const layout = layoutDiagram(diagram);
    assertSeparated(layout);
    assert.equal(layout.labels.length, diagram.points.length + diagram.angles.filter(a => a.label).length);
    assert.equal(JSON.stringify(diagram), original, `${name}: layout must not edit mathematical data`);
    const printScale = Math.min((82.7 / 25.4 * 72) / layout.width, (58 / 25.4 * 72) / layout.height);
    for (const label of layout.labels) assert.ok(label.fontSize * printScale >= 9, `${name}: ${label.text} remains at least 9pt in export`);
    // Every pair retains its distance under one uniform scale; no point can be nudged for typography.
    for (let i = 0; i < diagram.points.length; i++) for (let j = i + 1; j < diagram.points.length; j++) {
      const a = diagram.points[i], b = diagram.points[j];
      const p = layout.points.find(point => point.name === a.name), q = layout.points.find(point => point.name === b.name);
      assert.ok(Math.abs(Math.hypot(p.x - q.x, p.y - q.y) - Math.hypot(a.x - b.x, a.y - b.y) * layout.transform.scale) < 1e-7);
    }
  }
});

test('acute numbers stay inside near the angle and permit limited geometry overlap', () => {
  const diagram = fixtures.find(fixture => fixture.name === 'variant-1').diagram;
  const layout = layoutDiagram(diagram);
  const label = layout.labels.find(item => item.text === '15°');
  const angle = layout.angles.find(item => item.text === '15°');
  assert.equal(label.withinWedge, true);
  assert.equal(label.leaderAnchor,undefined);
  assert.ok(Math.hypot(label.center.x-angle.vertex.x,label.center.y-angle.vertex.y)<=185);
  assert.equal(label.fontSize,38);
  assertSeparated(layout);
  for (const name of ['I', 'G']) {
    const point = layout.points.find(point => point.name === name);
    const annotation = layout.labels.find(item => item.id === `point-${name}`);
    assert.ok(annotation.box.top > point.y + 5, `${name} must sit below the baseline`);
  }
});

test('mirrored and translated exam diagrams retain nonoverlapping annotations', () => {
  for (const fixture of fixtures) {
    const diagram = structuredClone(fixture.diagram);
    for (const point of diagram.points) { point.x = 100 - point.x; point.y += 12; if (Number.isFinite(point.labelDx)) point.labelDx *= -1; }
    for (const circle of diagram.circles || []) { circle.cx = 100 - circle.cx; circle.cy += 12; }
    for (const label of diagram.labels || []) { label.x = 100 - label.x; label.y += 12; }
    assertSeparated(layoutDiagram(diagram));
  }
});

test('length labels avoid segments, circle outlines, point names and one another', () => {
  const diagram = {
    points: [{ name: 'A', x: 0, y: 0 }, { name: 'B', x: 4, y: 0 }, { name: 'C', x: 0, y: 3 }, { name: 'O', x: 2, y: 1.5 }],
    segments: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'A' }],
    circles: [{ cx: 2, cy: 1.5, r: 2.5 }],
    angles: [{ a: 'B', vertex: 'A', b: 'C', right: true }],
    labels: [{ x: 2, y: 0, text: '17' }, { x: 0, y: 1.5, text: '8' }, { x: 2, y: 1.5, text: '15' }],
  };
  const layout = layoutDiagram(diagram);
  assertSeparated(layout);
  assert.equal(layout.labels.filter(label => label.kind === 'label').length, 3);
  for (const label of layout.labels.filter(item => item.kind === 'label')) assert.notDeepEqual(label.center, label.anchor);
});

test('even a two-degree angle keeps its number inside and permits line overlap without shrinking', () => {
  const diagram = {
    points: [{ name: 'O', x: 0, y: 0 }, { name: 'A', x: 10, y: 0 }, { name: 'B', x: 10, y: .35 }],
    segments: [{ from: 'O', to: 'A' }, { from: 'O', to: 'B' }, { from: 'A', to: 'B' }],
    angles: [{ a: 'A', vertex: 'O', b: 'B', label: '2°' }],
  };
  const layout = layoutDiagram(diagram);
  assertSeparated(layout);
  const label = layout.labels.find(item => item.kind === 'angle');
  assert.equal(label.leaderAnchor,undefined);assert.equal(label.withinWedge,true);
  assert.ok(layout.permittedGeometryOverlaps.some(overlap=>overlap.label===label.id));
  assert.equal(label.fontSize, 38);
  assert.doesNotMatch(diagramSvg(diagram), /class="angle-label-(?:arrow|leader)"/);
  assert.match(diagramSvg(diagram),/paint-order="stroke"/);
});

test('browser preview and Node export use exactly the same deterministic SVG', () => {
  const browser = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../app/diagram-layout.js'), 'utf8'), browser);
  for (const { diagram } of fixtures) {
    const exported = diagramSvg(diagram);
    assert.equal(browser.ExamDiagramLayout.diagramSvg(diagram), exported);
    assert.equal(diagramSvg(diagram), exported);
    assert.doesNotMatch(exported, /(?:NaN|Infinity|<script|onload=)/);
  }
});

test('SVG paints isolated named centers and circle centers as dots without inventing names',()=>{
 const {diagramSvg}=require('../app/diagram-layout.js');
 const points=['I','O','G'].map((name,i)=>({name,x:i,y:i%2}));points.push({name:' ',x:3,y:3});
 const svg=diagramSvg({points,segments:[],angles:[],labels:[],circles:[{cx:4,cy:2,r:1},{cx:1,cy:1,r:2}]});
 assert.equal((svg.match(/class="geometry-point"/g)||[]).length,4);
 for(const name of ['I','O','G'])assert.ok(svg.includes(`data-point="${name}"`));
 assert.ok(!svg.includes('data-point=" "'));assert.ok(svg.includes('data-point=""'));
});
