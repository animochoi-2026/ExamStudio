'use strict';
const fs=require('node:fs'),path=require('node:path');
const valid=v=>typeof v==='string'&&/^\d+\.\d+\.\d+$/.test(v);
function read(file){try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return null;}}
function same(a,b){return typeof a==='string'&&typeof b==='string'&&path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();}
function noLinks(target){
 for(let p=path.resolve(target);;p=path.dirname(p)){if(fs.lstatSync(p).isSymbolicLink())throw Error('Linked update path');if(path.dirname(p)===p)break;}
}
function plainTree(target){const stat=fs.lstatSync(target);if(stat.isSymbolicLink())throw Error('Linked update content');if(stat.isDirectory())for(const name of fs.readdirSync(target))plainTree(path.join(target,name));}
// Only finished updater transactions are eligible. Unknown folders and incomplete
// installs are recovery material, never user-authorized cleanup candidates.
function pruneUpdates({dataDir,root,versions,protectedDirectory}){
 const report={removed:0,skipped:0};const keep=new Set(versions.filter(valid));if(!keep.size)return report;
 const base=path.resolve(dataDir,'updates');if(!fs.existsSync(base))return report;
 let entries;try{noLinks(base);entries=fs.readdirSync(base,{withFileTypes:true});}catch{return {...report,skipped:1};}
 for(const entry of entries){
  if(!entry.isDirectory()||!/^download-[a-zA-Z0-9_-]+$/.test(entry.name))continue;
  const dir=path.resolve(base,entry.name);if(same(dir,protectedDirectory))continue;
  try{
   noLinks(dir);const plan=read(path.join(dir,'plan.json')),result=read(path.join(dir,'result.json'));
   if(!plan||!result||result.status!=='installed'||!same(plan.root,root)||!same(plan.zip,path.join(dir,'release.zip'))||!valid(plan.version)||result.version!==plan.version)continue;
   const backupPackage=read(path.join(dir,'backup/resources/app/package.json'));
   const backupVersion=valid(backupPackage?.version)?backupPackage.version:plan.sourceVersion;
   const remove=name=>{
    const target=path.resolve(dir,name);
    if(path.dirname(target)!==dir||!target.startsWith(base+path.sep))throw Error('Unsafe cleanup path');
    if(!fs.existsSync(target))return;noLinks(target);plainTree(target);
    fs.rmSync(target,{recursive:true,force:false});report.removed++;
   };
   if(!keep.has(plan.version))remove('release.zip');
   if(valid(backupVersion)&&!keep.has(backupVersion))remove('backup');
   // Keep the small transaction records, but not completed extraction leftovers.
   remove('unpacked');
  }catch{report.skipped++;}
 }
 return report;
}
module.exports={pruneUpdates};
