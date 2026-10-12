const test=require('node:test'),assert=require('node:assert/strict');
const {webConfiguration}=require('../scripts/web-config.cjs');
const target=require('../release/storage-routing.json').targets[0];
const config={...target,publishableKey:'sb_publishable_fixture'};
test('R2 production builds preserve the gateway flag and reject missing or false routing',()=>{
 assert.equal(webConfiguration(config).storageGateway,true);
 const {storageGateway,...missing}=config;
 assert.throws(()=>webConfiguration(missing),/storageGateway/);
 assert.throws(()=>webConfiguration({...config,storageGateway:false}),/storageGateway/);
 assert.throws(()=>webConfiguration({...config,publishableKey:'sb_secret_do_not_accept'}),/공개/);
});
test('other Supabase projects can still build without R2 settings',()=>{
 const {storageGateway,...legacy}={...config,url:'https://fixture.supabase.co'};
 assert.equal(webConfiguration(legacy).storageGateway,undefined);
});
test('detail and preview file reads use the gateway, never the old bucket, with the production config',async()=>{
 const built=await require('esbuild').build({entryPoints:[require('node:path').resolve(__dirname,'../web-bank/file-storage.js')],bundle:true,platform:'node',format:'cjs',write:false});
 const mod={exports:{}};new Function('module','exports',built.outputFiles[0].text)(mod,mod.exports);
 const previous=global.fetch,calls=[];
 const client={functions:{invoke:async(name,{body})=>{calls.push({name,body});return{data:{provider:'r2',url:'https://fixture.r2.cloudflarestorage.com/test'}};}},storage:{from:()=>{throw Error('Old storage must not be used');}}};
 global.fetch=async(url,options)=>{assert.equal(options.credentials,'omit');return new Response('artificial preview data');};
 try{
  for(const purpose of ['detail','preview']){
   const result=await mod.exports.downloadChunk(client,webConfiguration(config),'fixture/'+purpose+'/000');
   assert.ifError(result.error);assert.equal(await result.data.text(),'artificial preview data');
  }
  assert.equal(calls.length,2);assert(calls.every(c=>c.name==='bank-storage'&&c.body.operation==='read'));
 }finally{global.fetch=previous;}
});
