const test=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),Module=require('module');
function moduleAt(file){const out=esbuild.buildSync({entryPoints:[file],bundle:true,format:'cjs',platform:'node',write:false});const m=new Module(file);m._compile(out.outputFiles[0].text,file);return m.exports;}
const {originalPageReferences}=moduleAt('web-bank/original-pdf-page.js'),{readChunkRange}=moduleAt('web-bank/file-storage.js');
test('original PDF uses exact source identity, valid page, and groups same-page regions',()=>{
 const a={sourceId:'primary',page:3,x:.1,y:.2,width:.3,height:.4},b={...a,y:.6};const data={bundle:{native:{project:{sources:[{id:'primary',path:'bank-asset:source'}]}},files:[{id:'pdf',key:'source',role:'source',name:'source.pdf'}]},problem:{regions:[a,b,{page:0},{sourceId:'foreign',page:1}]}};
 const refs=originalPageReferences(data);assert.equal(refs.length,1);assert.equal(refs[0].page,3);assert.deepEqual(refs[0].regions,[a,b]);assert.equal(refs[0].file.id,'pdf');
});
test('private Range reader never accepts a full-body response or a wrong interval',async t=>{
 const old=global.fetch;t.after(()=>{global.fetch=old;});let claims=0;
 const client={functions:{invoke:async()=>{claims++;return {data:{provider:'r2',url:'https://fixture.r2.cloudflarestorage.com/private'}};}}};
 global.fetch=async(url,opt)=>{assert.equal(opt.headers.Range,'bytes=10-12');return new Response(new Uint8Array([1,2,3]),{status:206,headers:{'content-range':'bytes 10-12/100'}});};
 assert.deepEqual([...await readChunkRange(client,{storageGateway:true},'key',10,13)],[1,2,3]);assert.equal(claims,1);
 for(const response of [new Response('whole'),new Response('bad',{status:206,headers:{'content-range':'bytes 0-2/100'}})]){global.fetch=async()=>response;await assert.rejects(readChunkRange(client,{storageGateway:true},'key',10,13),/부분 읽기/);}
 const denied={functions:{invoke:async()=>({error:Error('Access denied')})}};global.fetch=()=>{throw Error('must not request object');};await assert.rejects(readChunkRange(denied,{storageGateway:true},'key',10,13),/Access denied/);
});
