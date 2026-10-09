'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {normalizeRegions,uniqueRegions,transformRegion}=require('../app/region-geometry.js');
const {RegionDetector,schema}=require('../app/region-detector.cjs'),{ProjectStore}=require('../app/store.cjs');
const {validateResult}=require('../app/codex.cjs');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/bX8AAAAASUVORK5CYII=';
const region={order:1,x:.1,y:.1,width:.3,height:.3};
test('actual shared provider validator accepts region order integers and rejects invalid values',()=>{
 const response={regions:[region,{...region,order:2,x:.6}]};
 assert.deepEqual(validateResult(response,schema),response);
 for(const order of [1.5,'1',null,NaN,Infinity])assert.throws(()=>validateResult({regions:[{...region,order}]},schema),/order/);
 assert.deepEqual(validateResult({regions:[]},schema),{regions:[]});
});
test('reading order, duplicate regions, distinct questions and invalid boxes',()=>{
 assert.deepEqual(normalizeRegions([{...region,order:2},{...region,x:.6,order:1}]).map(r=>r.x),[.6,.1]);
 assert.throws(()=>normalizeRegions([{...region,x:.9}]),/페이지 밖/);assert.throws(()=>normalizeRegions(null));
 assert.equal(uniqueRegions([region,{...region,x:.11},{...region,x:.6}],[]).length,2);
 assert.equal(uniqueRegions([region],[{...region,x:.11}]).length,0);
 assert.equal(uniqueRegions([region],[{x:0,y:0,width:1,height:1}]).length,1);
 assert.equal(uniqueRegions([region],[{...region,x:.2,width:.4,detectedBounds:region}]).length,0);
 assert.equal(uniqueRegions([region,{...region,height:.4}],[]).length,2); // Shared instructions may overlap across questions.
});
test('drag and all resize edges stay inside page without negative sizes',()=>{
 const moved=transformRegion(region,'move',5,-5);assert.equal(moved.x,.7);assert.equal(moved.y,0);
 for(const handle of ['nw','n','ne','e','se','s','sw','w'])for(const dx of [-2,2])for(const dy of [-2,2]){const r=transformRegion(region,handle,dx,dy,.02,.02);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=1.0001&&r.y+r.height<=1.0001&&r.width>=.0199&&r.height>=.0199);}
});
function setup(t,bridge){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-regions-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'source.png');fs.writeFileSync(file,Buffer.from(png.split(',')[1],'base64'));const store=new ProjectStore(path.join(dir,'data')),project=store.create(file);const detector=new RegionDetector({store,getBridge:()=>bridge,getSettings:()=>({model:'test',effort:'medium'})});return{store,project,detector,args:{projectId:project.id,sourceId:'primary',page:1,imageDataUrl:png,provider:'codex',requestId:'regions-'+require('crypto').randomUUID()}};}
test('detect only locations, clean temporary image and keep project content unchanged',async t=>{
 let request;const {store,project,detector,args}=setup(t,{run:async r=>{request=r;assert.ok(fs.existsSync(r.images[0]));return{result:validateResult({regions:[region]},r.execution.schema)};}});
 assert.equal((await detector.run(args)).regions.length,1);assert.equal(request.execution.task,'region_detection');assert.equal(fs.existsSync(request.images[0]),false);assert.equal(store.get(project.id).problems.length,0);
 await assert.rejects(detector.run({...args,sourceId:'missing'}));await assert.rejects(detector.run({...args,imageDataUrl:'data:image/png;base64,AAAA'}));
});
test('cancellation rejects late results and clears image and active request',async t=>{
 let resolve,request;const bridge={run:r=>{request=r;return new Promise(done=>resolve=done);},cancel:async()=>resolve({result:{regions:[region]}})};
 const {detector,args}=setup(t,bridge);const result=detector.run(args);const reject=assert.rejects(result,/중지/);await detector.cancel(args.requestId);await reject;assert.equal(detector.active.size,0);assert.equal(fs.existsSync(request.images[0]),false);
});
test('moving pending crop does not create review errors and retains question id',t=>{
 const {store,project}=setup(t,{});const added=store.addRegion({projectId:project.id,region:{...region,page:1},imageDataUrl:png}),id=added.problems[0].id;
 const updated=store.replaceRegion({projectId:project.id,problemId:id,regionIndex:0,region:{...region,page:1,x:.2},imageDataUrl:png});
 assert.equal(updated.problems[0].id,id);assert.equal(updated.problems[0].regions[0].x,.2);assert.equal(updated.problems[0].needsReview,false);assert.deepEqual(updated.problems[0].warnings,[]);
});
