const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {automaticPlan}=require('../app/batch-queue.js'),{diagramSvg,textSize,labelText}=require('../app/diagram-layout.js'),{recognition}=require('./workflow-fixtures.cjs');
test('automatic continuation skips complete sources and variants; only new or missing phases run',()=>{
 const p={regions:[{}],recognition:{version:1,body:'문제'},original:{body:'문제',answer:'2',solution:'풀이'},variants:[{body:'변형',answer:'3',solution:'풀이'}]};
 assert.deepEqual(automaticPlan(p),{recognition:false,review:false,solve:false,generation:false});
 p.original.solutionStale=true;assert.equal(automaticPlan(p).solve,true,'invalidated solutions must be regenerated in the explicitly requested automatic run');
 const recognized={regions:[{}],recognition:{version:1,body:'문제'},original:{body:'문제'},variants:[]};assert.deepEqual(automaticPlan(recognized),{recognition:false,review:true,solve:true,generation:false});
 assert.equal(automaticPlan(recognized,'automaticSolve').generation,false);assert.equal(automaticPlan({regions:[{}]}).recognition,true);
});
test('diagram fractions render as stacked numerator, rule, denominator across formats',()=>{
 for(const label of ['13/2','$\\frac{13}{2}$','¹³⁄₂','½']){
  const diagram=recognition().observedDiagram;diagram.angles[0].label=label;
  const svg=diagramSvg(diagram);assert.match(svg,/class="fraction-label"/);assert.match(svg,/<path d="M [^"]+ H /);assert.ok(!svg.includes('foreignObject'));assert.ok(textSize(labelText(label),24).height>36);
 }
});
test('legacy short-answer grading is hidden without mutating saved history or explanation',()=>{
 const {solutionText}=require('../app/solution-display.js');const q={questionType:'single_value',solution:'자세한 설명\n\n[서술형 채점기준 · 총 6점]\n이전 배점'};
 assert.equal(solutionText(q),'자세한 설명');assert.match(q.solution,/이전 배점/);assert.equal(solutionText({...q,questionType:'written_response'}),q.solution);
});
test('separate method panels preserve source image crops without modifying diagram coordinates',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-material-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'source.png'),sharp=require('sharp');await sharp({create:{width:200,height:100,channels:3,background:'#c0c0c0'}}).png().toFile(file);
 const p={cropPaths:[file],regions:[{}],recognition:{materials:[{label:'방법 1',text:'접기',regionIndex:0,bounds:{x:0,y:0,width:.5,height:1}},{label:'방법 2',text:'다른 접기',regionIndex:0,bounds:{x:.5,y:0,width:.5,height:1}}]}};
 const {materialImages}=require('../app/source-materials.cjs');const items=await materialImages(p);assert.equal(items.length,2);for(const i of items)assert.equal((await sharp(Buffer.from(i.dataUrl.split(',')[1],'base64')).metadata()).width,100);
 p.recognition.materials[0].bounds.width=2;await assert.rejects(materialImages(p),/범위/);
});
