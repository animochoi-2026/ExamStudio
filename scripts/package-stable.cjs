'use strict';
// Reproduce the approved application using the official ZIP's pinned runtimes.
// Does not modify or launch an installed application, and never copies a profile.
const fs=require('node:fs'),path=require('node:path');
async function main(base,out){
 const stable=require('./stable-release.cjs'),m=stable.verifySources(),root=path.resolve(__dirname,'..');
 if(!base||!out)throw Error('Usage: node scripts/package-stable.cjs <extracted official Windows ZIP> <new output directory>');
 base=path.resolve(base);out=path.resolve(out);
 if(fs.existsSync(out))throw Error('Output must be a new directory');
 stable.verifyDesktop(base);
 for(const name of ['data','결과물','.git','.codex'])if(fs.existsSync(path.join(base,name)))throw Error('Personal data in runtime base: '+name);
 fs.cpSync(base,out,{recursive:true,filter:p=>!p.includes('__pycache__')&&!p.endsWith('.pyc')});
 for(const name of Object.keys(m.desktop.applicationAssets)){
   if(name==='scripts/export-engine.json')continue;
   const source=name==='app/shared-bank-config.json'?path.join(root,'config/public-bank.json'):path.join(root,name);
   if(fs.existsSync(source))fs.copyFileSync(source,path.join(out,'resources/app',name));
   else throw Error('Missing canonical source: '+name);
 }
 require('./export-engine.cjs').stage(path.join(out,'resources/app/scripts'));
 stable.verifyDesktop(out);console.log(out);
}
if(require.main===module)main(...process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main};
