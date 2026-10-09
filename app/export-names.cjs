'use strict';
const fs=require('node:fs'),path=require('node:path');
function datedWordPath(file,date=new Date()){
 const parsed=path.parse(file),day=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
 const base=parsed.name.replace(/_ver\d+$/i,'');
 return path.join(parsed.dir,`${base.endsWith('_'+day)?base:base+'_'+day}.docx`);
}
function versionPath(file,n){const p=path.parse(file);return n?path.join(p.dir,`${p.name}_ver${n}${p.ext}`):file;}
function availablePath(file){for(let n=0;;n++){const candidate=versionPath(file,n);if(!fs.existsSync(candidate))return candidate;}}
// COPYFILE_EXCL closes the race between choosing a filename and publishing it.
// The exporter works in a private staging directory and never opens an old Word file.
function publishWord(staged,file){
 for(let n=0;;n++){
  const candidate=versionPath(file,n);
  try{fs.copyFileSync(staged,candidate,fs.constants.COPYFILE_EXCL);return candidate;}
  catch(error){if(error.code!=='EEXIST')throw error;}
 }
}
module.exports={datedWordPath,availablePath,publishWord};
