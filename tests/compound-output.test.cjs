'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const structure=require('../app/structured-layout.js'),text=require('../app/question-text.cjs'),model=require('../app/bank-model.cjs');
const actual=require('./fixtures/compound-proof-uploaded.json');
test('actual proof recovers only saved leaders and separates source score without changing recognition',()=>{
 const before=JSON.stringify(actual),q=structure.forOutput(actual);
 assert.equal(structure.sourcePoints(actual),4);assert.doesNotMatch(q.body,/4점/);
 const reasons=q.layoutDocument.nodes.flatMap(n=>n.inlines).filter(x=>x.kind==='reason').map(x=>x.text);
 assert.deepEqual(reasons,['…… ①','…… ②','…… ③']);assert.equal(JSON.stringify(actual),before);
 assert.equal(structure.forOutput(q).layoutDocument.nodes.flatMap(n=>n.inlines).filter(x=>x.kind==='reason')[0].text,'…… ①');
 const confirmed=structure.confirmArrow(actual,{nodeId:'arrow',symbol:'→',sourceConfirmed:true});
 const html=structure.html(confirmed,{math:s=>s,figure:n=>`<img alt="${n.id}">`});
 assert.doesNotMatch(html,/4점/);assert.match(html,/…… ①/);assert.equal((html.match(/data-blank-label/g)||[]).length,5);
 const ambiguous=structuredClone(actual);ambiguous.body+=' …… ①';assert.equal(structure.forOutput(ambiguous).layoutDocument.nodes.flatMap(n=>n.inlines).find(x=>x.kind==='reason').text,'①');
});
test('ordinary source scores, decimals and geometric points are handled conservatively',()=>{
 for(const s of ['점 A에서 4점과 2.5를 비교한다.','값 (4점)을 사용하라','반지름은 $4.2$이다.','조건? $x=4$ 점 A'])assert.equal(text.splitSourcePoints(s).body,s);
 assert.equal(text.splitSourcePoints('구하시오. (2.5점)').points,2.5);
 assert.equal(text.splitSourcePoints('옳은 것은? (4점 $x=1$').body,'옳은 것은? $x=1$');
 assert.equal(text.splitSourcePoints('구하시오. (4점').points,null);
 assert.equal(structure.html({body:'일반 문제',layoutDocument:null},{math:s=>s}),null);
});
test('real saved layout survives upload JSON and native restoration, with source score metadata',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-compound-bank-'));
 try{
  const file=path.join(dir,'source.png');fs.writeFileSync(file,Buffer.from('local-fixture-source'));
  const q=structuredClone(actual),problem={id:q.sourceId,original:q,variants:[],regions:[{sourceId:'primary',role:'question'}],cropPaths:[],recognition:{points:null}};
  const project={id:'test-project',title:'actual structure round trip',createdAt:'2026-10-01',settings:{},scope:{},sources:[{id:'primary',path:file}],source:{path:file},problems:[problem]};
  const pack=model.portableSnapshot(project,problem,q,dir),bundle=JSON.parse(JSON.stringify({schemaVersion:1,native:{project:pack.native,targetQuestionId:q.id},files:pack.refs}));
  assert.deepEqual(bundle.native.project.problems[0].original.layoutDocument,q.layoutDocument);
  const restored=model.restoreSnapshot(bundle,new Map(pack.refs.map(r=>[r.key,fs.readFileSync(r.localPath)])),path.join(dir,'restored'));
  assert.deepEqual(restored.problems[0].original.layoutDocument,q.layoutDocument);assert.equal(restored.problems[0].original.body,q.body);
  assert.equal(model.metadata(q,problem,project).source.originalPoints,4);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('web read and cached read derive source score metadata while retaining raw upload data',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-web-read-'));
 try{
  const target=path.join(dir,'reader.cjs');await require('esbuild').build({entryPoints:[path.resolve(__dirname,'../web-bank/question-renderer.js')],outfile:target,bundle:true,platform:'node',format:'cjs',logLevel:'silent'});
  const bundle={schemaVersion:1,questionId:'question',revisionId:'revision',metadata:{source:{originalPoints:null}},native:{targetQuestionId:actual.id,project:{problems:[{original:actual,variants:[]}]}}};
  const bytes=Buffer.from(JSON.stringify(bundle)),sha256=require('node:crypto').createHash('sha256').update(bytes).digest('hex');let downloads=0;
  const catalog={question_id:'question',revision_id:'revision',files:[{id:'data',role:'data',sha256}],metadata:{source:{originalPoints:null}}};
  const client={from:table=>({select:()=>({eq:()=>({single:async()=>({data:table==='bank_catalog'?catalog:{verified:true,size:bytes.length,chunks:1,sha256}})})})}),storage:{from:()=>({download:async()=>{downloads++;return{data:new Blob([bytes])};}})}};
  const reader=require(target).createQuestionReader(client,{spaceId:'fixture'});
  for(let i=0;i<2;i++){const loaded=await reader.load('revision');assert.equal(loaded.catalog.metadata.source.originalPoints,4);assert.deepEqual(loaded.question.layoutDocument,actual.layoutDocument);assert.equal(loaded.bundle.metadata.source.originalPoints,null);}
  assert.equal(catalog.metadata.source.originalPoints,null);assert.equal(downloads,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
