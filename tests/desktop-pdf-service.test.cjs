const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {desktopPdf}=require('../app/native-pdf-cache.cjs');
test('desktop creates locally, uploads once, and reuses authorized R2 bytes without cloud rendering',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-service-')),previousFetch=global.fetch;
 const bytes=Buffer.from('%PDF-1.7\n'+'test '.repeat(40)+'\n%%EOF'),calls=[],saved=new Map();let generations=0,fail=false;
 const auth={config:()=>({spaceId:'space'}),status:()=>({account:{id:'user'}}),token:async()=>'test',request:async(route,{body})=>{
  assert.equal(route,'/functions/v1/bank-native-pdf');const {job}=body;calls.push(job.operation);const signature=job.document.desktopSignature;
  if(job.operation==='claim')return {hit:saved.has(signature),key:signature};
  if(job.operation==='upload'){saved.set(signature,Buffer.from(body.pdfBase64,'base64'));return {};}
  if(job.operation==='abort')return {};
  assert.equal(job.operation,'read','Desktop must never call cloud render');
  return {hit:true,url:'https://test.r2.cloudflarestorage.com/test',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 }};
 global.fetch=async()=>new Response(bytes);
 const project={id:'local',title:'표본',settings:{answerMode:'quick'},problems:[{original:{include:true,body:'문제'}}]};
 async function run(name){const target=path.join(dir,name);return desktopPdf({auth,project,revisions:[],requestId:name,identity:'1234',target,generate:async identity=>{assert.equal(identity,'1234');generations++;if(fail)throw Error('local renderer failed');fs.writeFileSync(target,bytes);return {path:target,format:'pdf'};}});}
 try {
  assert.equal((await run('one.pdf')).cached,false);assert.equal((await run('two.pdf')).cached,true);
  assert.equal(generations,1);assert.deepEqual(calls,['claim','upload','claim','read']);assert.deepEqual(fs.readFileSync(path.join(dir,'one.pdf')),fs.readFileSync(path.join(dir,'two.pdf')));
  project.title='변경';fail=true;await assert.rejects(run('failed.pdf'),/local renderer failed/);assert.equal(calls.at(-1),'abort');assert.equal(saved.size,1);
  fail=false;assert.equal((await run('changed.pdf')).cached,false);assert.equal((await run('changed-again.pdf')).cached,true);assert.equal(generations,3);assert.equal(saved.size,2);
 } finally {global.fetch=previousFetch;fs.rmSync(dir,{recursive:true,force:true});}
});
