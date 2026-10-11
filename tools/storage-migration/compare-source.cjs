'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),esbuild=require('esbuild');
const base='ee53fb267ad21f0279f6973ed71b69ea9c5d01ed';
const directory='tests/artifacts/r2/deployed-bank-verify/supabase/functions';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function canonical(source){
 const stripped=(await esbuild.transform(source,{loader:'ts',target:'es2022',format:'esm'})).code;
 return (await esbuild.transform(stripped,{loader:'js',minifyWhitespace:true,minifyIdentifiers:false,minifySyntax:false,legalComments:'none'})).code;
}
(async()=>{
 const files=[];
 async function walk(d){for(const n of fs.readdirSync(d)){const p=path.join(d,n);if(fs.statSync(p).isDirectory())await walk(p);else{
  const name='supabase/functions/'+path.relative(directory,p).replaceAll('\\','/'),live=fs.readFileSync(p),main=cp.execFileSync('git',['show',base+':'+name],{maxBuffer:50*1024*1024});
  const item={path:name,liveSha256:hash(live),equalBaseBytes:live.equals(main)};
  if(name.endsWith('bank-verify/index.ts')){const a=await canonical(main.toString()),b=await canonical(live.toString());item.canonicalJavaScriptEqual=a===b;item.canonicalSha256=hash(b);}
  files.push(item);
 }}}
 await walk(directory);
 const report={base,method:'official CLI raw bundle unbundle; byte equality for dependencies, type/format-only canonicalization for entrypoint',files,ok:files.length===10&&files.every(f=>f.equalBaseBytes||f.canonicalJavaScriptEqual)};
 fs.writeFileSync('docs/r2/deployed-source-comparison.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({files:files.length,ok:report.ok}));if(!report.ok)process.exitCode=1;
})().catch(()=>{console.error('DEPLOYED_SOURCE_COMPARISON_FAILED');process.exitCode=1;});
