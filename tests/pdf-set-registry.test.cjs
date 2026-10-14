const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
test('PDF cache checks newly registered sets before any cached result and signs current set version',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-set-check-'));
 try{await require('esbuild').build({entryPoints:['web-bank/native-pdf-cache.js'],bundle:true,platform:'node',format:'cjs',outfile:path.join(dir,'cache.cjs')});const {nativePdfCache}=require(path.join(dir,'cache.cjs'));
 let registry=[],calls=[];const client={functions:{invoke:async(_,request)=>{calls.push(request.body.job);return {error:{message:'stop after claim'}};}}};
 const cache=nativePdfCache({client,config:{spaceId:'test'},rpc:async name=>{assert.equal(name,'bank_question_sets_get');return structuredClone(registry);}}),base={items:[{questionId:'a'},{questionId:'b'}]},run=document=>cache.obtain({job:{document},status:{},prepare:()=>assert.fail('must not render')});
 registry=[{id:'set',version:1,complete:true,original_numbers:['24','25'],members:[{questionId:'a'},{questionId:'b'}],common:{nodes:[]}}];
 await assert.rejects(run({items:[{questionId:'a'}]}),/세트 짝/);assert.equal(calls.length,0);
 await assert.rejects(run({items:[{questionId:'b'},{questionId:'a'}]}),/세트 짝/);assert.equal(calls.length,0);
 await assert.rejects(run(base),/stop after claim/);assert.equal(calls.at(-1).document.items[0].questionSet.version,1);
 registry[0].version=2;await assert.rejects(run(base),/stop after claim/);assert.equal(calls.at(-1).document.items[0].questionSet.version,2);assert.equal(base.items[0].questionSet,undefined);
 registry[0].complete=false;await assert.rejects(run(base),/세트 짝/);assert.equal(calls.length,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
