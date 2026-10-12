const test=require('node:test'),assert=require('node:assert/strict');
const {officialDownload,identifier,desktopRevisions}=require('../app/download-security.cjs');
test('official downloads fail closed and report generation failure without publishing',async()=>{
 for(const fault of ['begin','identifier','generate','finish','blocked',null]){
  const calls=[];let published=false;
  const run=officialDownload({spaceId:'space',requestId:'request',format:'pdf',revisions:['a','a'],
   rpc:async(name,args)=>{calls.push({name,args});if(name.endsWith('begin')){if(fault==='begin')throw Error('offline');return{identifier:fault==='identifier'?'invalid':'0012'};}if(fault==='finish')throw Error('offline');return{allowed:fault!=='blocked'};},
   generate:async code=>{assert.equal(code,'0012');if(fault==='generate')throw Error('render failure');return Buffer.from('marked');},
   publish:file=>{published=true;return file;}});
  if(fault)await assert.rejects(run);else assert.equal((await run).toString(),'marked');
  assert.equal(published,!fault);if(calls[0])assert.deepEqual(calls[0].args.revisions,['a']);
  if(['identifier','generate'].includes(fault))assert.equal(calls.at(-1).args.generated,false);
 }
 assert.equal(identifier('0001'),'0001');assert.throws(()=>identifier(1));
});
test('desktop uses original bank bindings and only selected questions',()=>{
 const project={id:'p',problems:[{id:'s',original:{id:'q',include:true},variants:[{id:'v',include:false}]}]};
 assert.deepEqual(desktopRevisions(project,{bindings:{'p:s:q':{baseRevisionId:'old',latestRevisionId:'latest'},'p:s:v':{latestRevisionId:'excluded'}}}),['latest']);
});
