const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {ProjectStore,normalizeQuestion}=require('../app/store.cjs');
const {inspectDiagram,diagramSvg}=require('../app/geometry.cjs');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/bX8AAAAASUVORK5CYII=';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'source.png');fs.writeFileSync(file,Buffer.from(png,'base64'));const store=new ProjectStore(path.join(dir,'data'));return{dir,file,store};}

test('each problem retains its own manual part across saves and reloads', t => {
  const {store,file}=fixture(t); let project=store.create(file);
  const region={page:1,x:0,y:0,width:.4,height:.4};
  for(const part of ['geometry','integer']) project=store.addRegion({projectId:project.id,region,imageDataUrl:`data:image/png;base64,${png}`,part});
  const first=project.problems[0].id;
  project=store.updateProblem(project.id,first,p=>{p.threadId='keep-thread';p.messages=[{role:'user',text:'keep-message'}];});
  project.problems[0].part='algebra'; project=store.save(project);
  const reloaded=new ProjectStore(store.dataDir).get(project.id);
  assert.deepEqual(reloaded.problems.map(p=>p.part),['algebra','integer']);
  assert.equal(reloaded.problems[0].threadId,'keep-thread');
  assert.deepEqual(reloaded.problems[0].messages,[{role:'user',text:'keep-message'}]);
  project.problems[0].part='invalid'; assert.throws(()=>store.save(project),/파트/);
  assert.deepEqual(store.get(project.id).problems,reloaded.problems);
});
test('region capture is persistent and maintains one problem for multi-area crops',t=>{const {store,file}=fixture(t);let p=store.create(file);p=store.addRegion({projectId:p.id,region:{page:1,x:.1,y:.2,width:.3,height:.4},imageDataUrl:`data:image/png;base64,${png}`});const pid=p.problems[0].id;p=store.addRegion({projectId:p.id,problemId:pid,region:{page:2,x:.1,y:.1,width:.2,height:.2},imageDataUrl:`data:image/png;base64,${png}`});assert.equal(p.problems.length,1);assert.equal(p.problems[0].regions.length,2);assert.equal(store.last().id,p.id);assert.ok(store.ownsAsset(p.problems[0].cropPaths[0]));});
test('renderer edits cannot replace source paths or stored dialogue',t=>{const{store,file}=fixture(t);let p=store.create(file);p=store.addRegion({projectId:p.id,region:{page:1,x:0,y:0,width:1,height:1},imageDataUrl:`data:image/png;base64,${png}`});const original=p.source.path;p.source.path='C:/private.txt';p.problems[0].messages=[{role:'assistant',text:'forged'}];p.problems[0].threadId='external';p=store.save(p);assert.equal(p.source.path,original);assert.deepEqual(p.problems[0].messages,[]);assert.equal(p.problems[0].threadId,null);assert.equal(store.ownsAsset(file),false);assert.throws(()=>store.get('../other'));});
test('copied projects rebase source and crops while retaining threads and all problem content',t=>{
  const{dir,store,file}=fixture(t);let project=store.create(file);
  project=store.addRegion({projectId:project.id,region:{page:1,x:.1,y:.2,width:.4,height:.5},imageDataUrl:`data:image/png;base64,${png}`});
  project=store.updateProblem(project.id,project.problems[0].id,p=>{p.threadId='existing-conversation';p.messages=[{id:'message-1',role:'user',text:'보관할 대화'}];p.original={body:'보관할 원문',include:true};p.variants=[{body:'보관할 유사문제'}];});
  const movedData=path.join(dir,'moved','data');fs.cpSync(store.dataDir,movedData,{recursive:true});
  const movedStore=new ProjectStore(movedData);const loaded=movedStore.get(project.id);const expected=structuredClone(project);
  expected.source.path=path.join(movedStore.projectDir(project.id),'assets',path.basename(project.source.path));
  expected.problems[0].cropPaths=project.problems[0].cropPaths.map(old=>path.join(movedStore.projectDir(project.id),'assets',path.basename(old)));
  assert.deepEqual(loaded,expected);assert.notEqual(loaded.source.path,project.source.path);assert.ok(fs.existsSync(project.source.path));
  assert.ok(movedStore.ownsAsset(loaded.source.path));assert.ok(movedStore.ownsAsset(loaded.problems[0].cropPaths[0]));
  assert.equal(movedStore.ownsAsset(project.source.path),false);
  assert.deepEqual(movedStore.importProject(path.join(movedStore.projectDir(project.id),'project.json')).problems,expected.problems);
  assert.throws(()=>movedStore.importProject(path.join(store.projectDir(project.id),'project.json')),/데이터 폴더/);
});
test('asset rebasing accepts old Windows path basenames without reading the old location',t=>{
  const{dir,store,file}=fixture(t);let project=store.create(file);project=store.addRegion({projectId:project.id,region:{page:1,x:0,y:0,width:1,height:1},imageDataUrl:`data:image/png;base64,${png}`});
  const localSource=project.source.path,localCrop=project.problems[0].cropPaths[0];
  project.source.path='Z:\\unavailable\\old-app\\assets\\source.png';project.problems[0].cropPaths[0]='Z:\\unavailable\\old-app\\assets\\'+path.basename(localCrop);
  fs.writeFileSync(path.join(store.projectDir(project.id),'project.json'),JSON.stringify(project));
  const loaded=new ProjectStore(path.join(dir,'data')).get(project.id);
  assert.equal(loaded.source.path,localSource);assert.equal(loaded.problems[0].cropPaths[0],localCrop);
});
test('missing copied assets open in recovery mode without reading external files',t=>{
  const{dir,store,file}=fixture(t);let project=store.create(file);project=store.addRegion({projectId:project.id,region:{page:1,x:0,y:0,width:1,height:1},imageDataUrl:`data:image/png;base64,${png}`});
  const movedData=path.join(dir,'moved','data');fs.cpSync(store.dataDir,movedData,{recursive:true});const movedStore=new ProjectStore(movedData);
  const localCrop=path.join(movedStore.projectDir(project.id),'assets',path.basename(project.problems[0].cropPaths[0]));fs.unlinkSync(localCrop);
  assert.ok(fs.existsSync(project.problems[0].cropPaths[0]));const recovered=movedStore.get(project.id);assert.equal(recovered.assetIssues[0].path,localCrop);assert.equal(recovered.problems[0].cropPaths[0],localCrop);
});
test('invalid crop coordinates are rejected before writing assets',t=>{const{store,file}=fixture(t);const p=store.create(file);assert.throws(()=>store.addRegion({projectId:p.id,region:{page:1,x:.9,y:0,width:.4,height:.1},imageDataUrl:`data:image/png;base64,${png}`}));assert.equal(store.get(p.id).problems.length,0);});
test('recropping keeps conversations and marks old content for review',t=>{const{store,file}=fixture(t);let p=store.create(file);const r={page:1,x:0,y:0,width:1,height:1};p=store.addRegion({projectId:p.id,region:r,imageDataUrl:`data:image/png;base64,${png}`});const pid=p.problems[0].id;p=store.updateProblem(p.id,pid,q=>{q.messages=[{role:'user',text:'keep me'}];q.original={body:'old',needsReview:false};q.variants=[{body:'old variant',needsReview:false}];});p=store.replaceRegion({projectId:p.id,problemId:pid,regionIndex:0,region:{...r,width:.5},imageDataUrl:`data:image/png;base64,${png}`});assert.equal(p.problems[0].regions.length,1);assert.equal(p.problems[0].messages[0].text,'keep me');assert.equal(p.problems[0].variants[0].needsReview,true);assert.equal(p.problems[0].regions[0].width,.5);});
test('question identifiers cannot escape output directory',()=>{const q=normalizeQuestion({id:'../evil',body:'test'},'source','original',{id:'../../escape'});assert.match(q.id,/^[a-z0-9-]+$/);});
const diagram={points:[{name:'A',x:12,y:5},{name:'B',x:0,y:0},{name:'C',x:12,y:0},{name:'O',x:6,y:2.5},{name:'I',x:10,y:2},{name:'H',x:120/13,y:50/13}],segments:[{from:'A',to:'B'},{from:'A',to:'C'},{from:'B',to:'C'},{from:'I',to:'H'}],angles:[{a:'A',vertex:'C',b:'B',right:true}],constraints:[{type:'midpoint',points:['O','A','B']},{type:'perpendicular',points:['I','H','A','B']},{type:'distance',points:['I','H'],value:2}]};
test('geometry validation catches wrong right-angle markings and checks exact conditions',()=>{assert.equal(inspectDiagram(diagram).ok,true);const bad=structuredClone(diagram);bad.points.find(p=>p.name==='H').y+=1;assert.equal(inspectDiagram(bad).ok,false);assert.ok(diagramSvg(diagram).includes('<svg'));});
test('geometry labels are escaped, missing point references are not silently rendered',()=>{const d=structuredClone(diagram);d.labels=[{x:0,y:0,text:'<script>&'}];assert.ok(diagramSvg(d).includes('&lt;script&gt;&amp;'));d.segments.push({from:'missing',to:'A'});assert.throws(()=>diagramSvg(d));});
