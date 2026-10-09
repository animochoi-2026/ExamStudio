'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const layout=require('../app/structured-layout.js'),{question,node,text,blank}=require('./fixtures/compound-proof.cjs');
const {documentHtml}=require('../app/pdf-export.cjs'),{cleanRecognition,Workflow}=require('../app/workflow.cjs'),{normalizeQuestion,ProjectStore}=require('../app/store.cjs');
test('source proof preserves box, flow, contiguous inline math, blanks and separate reason numbers',()=>{
 const q=question(),html=documentHtml({title:'회귀',settings:{audience:'student'},questions:[q]});
 const ids=['intro','proof-box','conditions','figures','separate','arrow','joined','flip','blank-line','first','triangle','second','third','reasons','congruence','conclusion'];
 assert.deepEqual(ids.map(id=>html.indexOf('data-structure-id="'+id+'"')).sort((a,b)=>a-b),ids.map(id=>html.indexOf('data-structure-id="'+id+'"')));
 assert.match(html,/structure-box/);assert.equal((html.match(/data-blank-label=/g)||[]).length,5);
 assert.match(html,/structure-reason/);assert.match(html,/를 뒤집어/);assert.equal(q.layoutDocument.nodes.find(n=>n.id==='flip').inlines.length,6);
 assert.ok(html.indexOf('class="choices"')>html.indexOf('data-structure-id="conclusion"'));
 for(const d of q.layoutDocument.nodes.filter(n=>n.diagram))assert.equal(require('../app/geometry.cjs').inspectDiagram(d.diagram).ok,true);
 assert.match(html,/right-angle|<path|<polyline/);assert.match(html,/A\(D\)/);
});
test('ordinary and lone-box questions keep existing path; missing structure never claims reconstruction',()=>{
 const q=question();q.layoutDocument.features=['multiElementBox'];assert.equal(layout.status(q).active,false);
 q.layoutMode='structure';assert.equal(layout.status(q).active,true);
 q.layoutMode='normal';assert.equal(layout.html(q,{}),null);
 q.layoutMode='structure';q.layoutDocument=null;assert.throws(()=>layout.html(q,{}),/구조 정보 없음/);
});
test('saved recognition and normalization preserve structure; exclude handwritten and flag uncertainty',()=>{
 const q=question(),raw=require('./workflow-fixtures.cjs').recognition();raw.body=q.body;raw.layoutDocument=q.layoutDocument;
 const before=structuredClone(raw),out=cleanRecognition(raw,{id:'p',cropPaths:[],regions:[]},1);
 assert.deepEqual(out.layoutDocument,q.layoutDocument);assert.deepEqual(raw,before);
 const normalized=normalizeQuestion({...q,include:true},'p','original');assert.deepEqual(normalized.layoutDocument,q.layoutDocument);
 const modified=question();modified.layoutDocument.nodes.push(node('student','paragraph',null,[text('빨간 필기')],{origin:'handwritten'}));modified.layoutDocument.nodes.push(node('covered','paragraph',null,[text('추측한 답')],{origin:'uncertain'}));
 const html=documentHtml({title:'필기 제외',settings:{},questions:[modified]});assert.doesNotMatch(html,/빨간 필기|추측한 답/);assert.match(layout.warnings(modified).join(' '),/부분 확인 필요/);
 assert.throws(()=>layout.validate({version:1,features:[],nodes:[node('bad','paragraph','missing')]}),/포함관계/);
 const bad=question();bad.layoutDocument.nodes.find(n=>n.id==='blank-line').inlines[0]=blank('①');assert.throws(()=>layout.validate(bad.layoutDocument),/근거번호/);
});
test('per-question mode change is local, keeps approval, and never calls an AI bridge',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-structure-'));
 try{const source=path.join(dir,'source.png');fs.writeFileSync(source,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XhR8AAAAASUVORK5CYII=','base64'));const store=new ProjectStore(dir);let p=store.create(source);const q=question();p.problems=[{id:'p',original:{...q,id:'q',include:true,approval:{status:'approved'}},variants:[],cropPaths:[],regions:[],messages:[]}];store.write(p);
 const wf=new Workflow({store,directory:dir,getSettings:()=>({}),getBridge:()=>{throw Error('AI 호출 금지');}});
 wf.setPresentation({projectId:p.id,problemId:'p',targetIds:['q'],layoutMode:'normal'});let changed=store.get(p.id).problems[0].original;assert.equal(changed.layoutMode,'normal');assert.equal(changed.include,true);assert.equal(changed.approval.status,'approved');
 wf.setPresentation({projectId:p.id,problemId:'p',targetIds:['q'],layoutMode:'structure'});assert.equal(store.get(p.id).problems[0].original.layoutMode,'structure');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('recognition contract detects compound layout inside the existing single request',()=>{
  const {schemas,check}=require('../app/task-schemas.cjs');assert.ok(schemas.recognition.properties.recognition.properties.layoutDocument);
  const contract=schemas.recognition.properties.recognition.properties.layoutDocument.description;
  assert.match(contract,/separate printed line belongs to its own paragraph\/proofStep/);
  assert.match(contract,/empty arrow is incomplete/);
 const r=require('./workflow-fixtures.cjs').recognition();r.layoutDocument=question().layoutDocument;assert.doesNotThrow(()=>check('recognition',{reply:'',recognition:r}));
 const rules=require('../app/rules.cjs');const instructions=rules.compose({task:'recognition',domains:['geometry'],modules:Object.values(rules.definitions)}).instructions;assert.match(instructions,/별도 AI 분류 호출은 하지 않는다/);assert.match(instructions,/증명 전체를 materials 원본 crop/);
});
test('actual DOCX snapshot retains outer border, box slot, structure and local mode',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app/main.cjs'),'utf8');const start=source.indexOf('function documentQuestion('),end=source.indexOf('async function buildDocument(',start);
 const requireFromMain=require('node:module').createRequire(path.join(__dirname,'../app/main.cjs'));
 const fn=require('node:vm').runInNewContext(source.slice(start,end)+';documentQuestion',{require:requireFromMain});
 const q={...question(),boxSlot:'line:1',bodyBorder:true,layoutMode:'structure'};const out=fn(q,'student');
 assert.equal(out.boxSlot,'line:1');assert.equal(out.bodyBorder,true);assert.equal(out.layoutMode,'structure');assert.deepEqual(out.layoutDocument,q.layoutDocument);
});
test('late children are rejected rather than silently reordered; cropped geometry is flagged',()=>{
 const q=question();q.layoutDocument.nodes.push(node('outside','paragraph',null,[text('상자 밖')]),node('late','paragraph','proof-box',[text('지연 자식')]));assert.throws(()=>layout.validate(q.layoutDocument),/읽기 순서/);
 const raw=require('./workflow-fixtures.cjs').recognition();raw.layoutDocument={version:1,features:['multipleFigures','interleavedFlow'],nodes:[node('source','figure',null,[],{figureId:'material:0'})]};raw.materials=[{label:'도형만',text:'',regionIndex:0,bounds:null,slot:'after'}];
 const out=cleanRecognition(raw,{id:'p',cropPaths:['source.png'],regions:[]},1);assert.match(out.layoutDocument.nodes[0].figureId,/^material-/);assert.match(out.uncertainties.map(u=>u.text).join(' '),/필기 잔존/);
});

test('empty printed arrows in saved recognition require review without inventing a direction',()=>{
 const raw=require('./workflow-fixtures.cjs').recognition();raw.layoutDocument=question().layoutDocument;
 const arrow=raw.layoutDocument.nodes.find(n=>n.type==='arrow');arrow.inlines=[];
 const before=JSON.stringify(raw),out=cleanRecognition(raw,{id:'p',cropPaths:[],regions:[]},1);
 assert.equal(JSON.stringify(raw),before);assert.equal(out.status,'needs_confirmation');
 assert.match(out.uncertainties.map(u=>u.text).join(' '),/화살표의 방향·표시가 저장되지/);
 assert.deepEqual(out.layoutDocument.nodes.find(n=>n.type==='arrow').inlines,[]);
 arrow.inlines=[text('→')];assert.doesNotMatch(layout.warnings(raw).join(' '),/화살표의 방향/);
 arrow.origin='handwritten';arrow.inlines=[];assert.doesNotMatch(layout.warnings(raw).join(' '),/화살표의 방향/);
});
